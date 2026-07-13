#!/usr/bin/env python3
"""analyze.py — Ranking & risk engine for the Deep Research Agent.

Reads what fetch.py stored in SQLite (player bios, prior-season stats,
rookie college metrics, schedule/SOS, news sentiment) and produces one
ranked snapshot per run in the `rankings_history` table. Every run is
appended (not overwritten), which is what makes the exported spreadsheet
"auto-updating" — each execution adds a fresh, timestamped ranking pass.

Methodology (intentionally simple & transparent, not a black box):

1. Projected points
   - Veterans: prior season's fantasy points, prorated to a 17-game pace and
     blended 80/20 with the positional average (regression to the mean) so a
     small injury-shortened sample doesn't get over/under-extrapolated.
   - Rookies: college-season stats are converted to an approximate NFL
     fantasy-point pace, then discounted by a per-position rookie factor and
     scaled by draft capital (1st round picks retain more of that pace than
     day-3 picks).

2. Strength-of-schedule adjustment
   Each player's team's full-season average opponent defensive rank (1 =
   toughest, 32 = easiest, from schedule_source) is converted into a +/-8%
   swing on the projection.

3. Risk tier (Low/Medium/High)
   Points for: RB age>=28, WR/TE age>=31, QB age>=34; >=1 negative-sentiment
   news item; being a rookie; missing >2 games last season. 0-1 -> Low,
   2-3 -> Medium, 4+ -> High.

4. Ranking
   Positional replacement-level baselines (12-team-league-ish: QB12, RB24,
   WR30, TE12, K12, DST12) are subtracted from each projection to get
   "points above replacement" (PAR), which drives the overall rank; plain
   projected points drive the position rank.

5. Tag (draft/report framing) — first matching rule wins:
   Rookie Watch > Bust Risk (High risk + strong raw projection) > Sleeper
   (positive recent buzz, not already a top-tier PAR player) > Value Pick
   (solid PAR relative to positional peers despite a worse position rank) >
   Safe Floor (Low risk, played nearly a full season).

Usage:
    python analyze.py                # analyze latest fetched data, print summary
"""
from __future__ import annotations

import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src import db
from src.config import config

REPLACEMENT_RANK = {"QB": 12, "RB": 24, "WR": 30, "TE": 12, "K": 12, "DST": 12}
ROOKIE_DISCOUNT = {"QB": 0.5, "RB": 0.6, "WR": 0.55, "TE": 0.45, "K": 0.3, "DST": 0.3}
DRAFT_ROUND_MULTIPLIER = {1: 1.0, 2: 0.85, 3: 0.65, 4: 0.5, 5: 0.4, 6: 0.3, 7: 0.25}
FULL_SEASON_GAMES = 17


def _half_ppr_points_from_stats(stats: dict) -> float:
    """Rough half-PPR scoring for translating raw college box-score stats."""
    pts = 0.0
    pts += stats.get("pass_yds", 0) / 25
    pts += stats.get("pass_td", 0) * 4
    pts -= stats.get("int", 0) * 1
    pts += stats.get("rush_yds", 0) / 10
    pts += stats.get("rush_td", 0) * 6
    pts += stats.get("rec", 0) * 0.5
    pts += stats.get("rec_yds", 0) / 10
    pts += stats.get("rec_td", 0) * 6
    return round(pts, 1)


def _project_veteran(stats_row: dict, position_avg: float) -> float:
    games = stats_row.get("games_played") or FULL_SEASON_GAMES
    games = max(games, 1)
    per_game = stats_row.get("fantasy_points", 0.0) / games
    prorated = per_game * FULL_SEASON_GAMES
    return round(prorated * 0.8 + position_avg * 0.2, 1)


def _project_rookie(college_record: dict, position: str) -> float:
    college_stats = college_record.get("college_stats", {})
    college_points_pace = _half_ppr_points_from_stats(college_stats)
    games = college_stats.get("games_played") or 13
    college_points_full = college_points_pace / max(games, 1) * FULL_SEASON_GAMES
    round_no = college_record.get("draft_capital", {}).get("round", 5)
    multiplier = DRAFT_ROUND_MULTIPLIER.get(round_no, 0.3)
    discount = ROOKIE_DISCOUNT.get(position, 0.4)
    return round(college_points_full * discount * multiplier, 1)


def _sos_adjustment(schedule_rows: list, position: str) -> float:
    if not schedule_rows:
        return 0.0
    avg_def_rank = statistics.mean(r["opponent_def_rank"] for r in schedule_rows)
    # avg_def_rank in [1, 32]; 16.5 is neutral. Positive => favorable (easy) schedule.
    return round((avg_def_rank - 16.5) / 16.5 * 0.08, 4)


def _risk_tier(age: int | None, position: str, is_rookie: bool, games_played: int | None,
               negative_news_count: int) -> tuple[str, int]:
    score = 0
    if age is not None:
        if position == "RB" and age >= 28:
            score += 1
        if position in ("WR", "TE") and age >= 31:
            score += 1
        if position == "QB" and age >= 34:
            score += 1
    if negative_news_count >= 2:
        score += 2
    elif negative_news_count >= 1:
        score += 1
    if is_rookie:
        score += 1
    if games_played is not None and games_played < (FULL_SEASON_GAMES - 2):
        score += 1

    if score >= 4:
        return "High", score
    if score >= 2:
        return "Medium", score
    return "Low", score


def _tag(is_rookie: bool, risk_tier: str, projected_points: float, position_avg: float,
          par: float, position_par_median: float, positive_news_count: int) -> str:
    if is_rookie:
        return "Rookie Watch"
    if risk_tier == "High" and projected_points > position_avg * 1.15:
        return "Bust Risk"
    if positive_news_count > 0 and par < position_par_median * 1.5:
        return "Sleeper"
    if par >= position_par_median and projected_points < position_avg:
        return "Value Pick"
    if risk_tier == "Low":
        return "Safe Floor"
    return "Depth Piece"


def run_analysis() -> dict:
    with db.connect(config.db_path) as conn:
        players = conn.execute("SELECT * FROM players").fetchall()

        stats_by_player: dict[str, dict] = {}
        for row in conn.execute("SELECT * FROM player_stats WHERE season != 0"):
            stats_by_player[row["player_id"]] = json.loads(row["stats_json"])

        college_by_player: dict[str, dict] = {}
        for row in conn.execute("SELECT * FROM player_stats WHERE season = 0"):
            college_by_player[row["player_id"]] = json.loads(row["stats_json"])

        schedule_by_team: dict[str, list] = {}
        for row in conn.execute("SELECT * FROM schedule"):
            schedule_by_team.setdefault(row["team"], []).append(dict(row))

        news_by_player: dict[str, list] = {}
        for row in conn.execute("SELECT * FROM news_items"):
            if row["player_id"]:
                news_by_player.setdefault(row["player_id"], []).append(dict(row))

        # Positional averages (raw, pre-SOS) computed from veterans only, used
        # for regression-to-mean and for the tag heuristics' baselines.
        position_points: dict[str, list[float]] = {}
        raw_projection: dict[str, float] = {}
        for p in players:
            pos = p["position"]
            if p["player_id"] in stats_by_player:
                s = stats_by_player[p["player_id"]]
                games = s.get("games_played") or FULL_SEASON_GAMES
                per_game = s.get("fantasy_points", 0.0) / max(games, 1)
                position_points.setdefault(pos, []).append(per_game * FULL_SEASON_GAMES)

        position_avg = {pos: statistics.mean(vals) for pos, vals in position_points.items() if vals}

        records = []
        for p in players:
            pos = p["position"]
            pid = p["player_id"]
            is_rookie = bool(p["is_rookie"])
            avg_for_pos = position_avg.get(pos, 100.0)

            if is_rookie and pid in college_by_player:
                projected = _project_rookie(college_by_player[pid], pos)
                games_played = None
            elif pid in stats_by_player:
                s = stats_by_player[pid]
                projected = _project_veteran(s, avg_for_pos)
                games_played = s.get("games_played")
            else:
                projected = avg_for_pos * 0.5
                games_played = None

            team_schedule = schedule_by_team.get(p["team"], [])
            sos_adj = _sos_adjustment(team_schedule, pos)
            projected_adj = round(projected * (1 + sos_adj), 1)

            player_news = news_by_player.get(pid, [])
            negative_count = sum(1 for n in player_news if n["sentiment"] == "negative")
            positive_count = sum(1 for n in player_news if n["sentiment"] == "positive")

            risk_tier, _risk_score = _risk_tier(p["age"], pos, is_rookie, games_played, negative_count)

            baseline = avg_for_pos * 0.5  # rough replacement-level stand-in, refined below
            par = round(projected_adj - baseline, 1)

            top_headline = player_news[0]["title"] if player_news else None

            records.append(
                {
                    "player_id": pid,
                    "name": p["name"],
                    "position": pos,
                    "team": p["team"],
                    "projected_points": projected_adj,
                    "sos_adjustment": sos_adj,
                    "risk_tier": risk_tier,
                    "is_rookie": is_rookie,
                    "par": par,
                    "position_avg": avg_for_pos,
                    "positive_news_count": positive_count,
                    "negative_news_count": negative_count,
                    "top_headline": top_headline,
                }
            )

        # Refine PAR using an actual replacement-level rank cut within each position.
        by_position: dict[str, list[dict]] = {}
        for r in records:
            by_position.setdefault(r["position"], []).append(r)
        for pos, group in by_position.items():
            group.sort(key=lambda r: r["projected_points"], reverse=True)
            cutoff = REPLACEMENT_RANK.get(pos, 12)
            replacement_points = group[min(cutoff, len(group) - 1)]["projected_points"] if group else 0.0
            for rank, r in enumerate(group, start=1):
                r["position_rank"] = rank
                r["par"] = round(r["projected_points"] - replacement_points, 1)

        for pos, group in by_position.items():
            median_par = statistics.median(r["par"] for r in group) if group else 0.0
            for r in group:
                r["tag"] = _tag(
                    r["is_rookie"], r["risk_tier"], r["projected_points"], r["position_avg"],
                    r["par"], median_par, r["positive_news_count"],
                )

        records.sort(key=lambda r: r["par"], reverse=True)
        for rank, r in enumerate(records, start=1):
            r["overall_rank"] = rank

        run_timestamp = datetime.now(timezone.utc).isoformat()
        for r in records:
            notes_parts = [f"SOS {'+' if r['sos_adjustment'] >= 0 else ''}{r['sos_adjustment']*100:.1f}%"]
            if r["top_headline"]:
                notes_parts.append(r["top_headline"])
            notes = " | ".join(notes_parts)

            conn.execute(
                """INSERT INTO rankings_history
                   (run_timestamp, player_id, name, position, team, projected_points,
                    sos_adjustment, risk_tier, tag, overall_rank, position_rank, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    run_timestamp, r["player_id"], r["name"], r["position"], r["team"],
                    r["projected_points"], r["sos_adjustment"], r["risk_tier"], r["tag"],
                    r["overall_rank"], r["position_rank"], notes,
                ),
            )

    return {"run_timestamp": run_timestamp, "players_ranked": len(records)}


def main() -> None:
    summary = run_analysis()
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
