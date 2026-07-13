#!/usr/bin/env python3
"""fetch.py — Data Aggregation stage of the Deep Research Agent.

Pulls player bios, season stats, news/sentiment, rookie college metrics, and
the 2026 schedule/SOS from the sources in src/sources/, normalizes them, and
persists everything into the local SQLite database (see src/db.py). Each
source tries a live free/no-key endpoint first and transparently falls back
to a bundled fixture on any failure, so this script always succeeds and
always leaves the DB in a usable state — that's what makes it safe to call
from an unattended scheduler.

Usage:
    python fetch.py                  # fetch everything, print a summary
    python fetch.py --season 2025    # override the stats season fetched
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src import db
from src.config import config
from src.sources import college_source, news_source, schedule_source, sleeper_source


def run_fetch(season: int) -> dict:
    """Fetches everything and writes it to SQLite. Returns a summary dict."""
    summary: dict = {"season": season, "sources": {}}

    players, players_source = sleeper_source.fetch_players()
    summary["sources"]["players"] = {"source": players_source, "count": len(players)}

    stats_by_id, stats_source = sleeper_source.fetch_season_stats(season)
    summary["sources"]["stats"] = {"source": stats_source, "count": len(stats_by_id)}

    player_names = [p["name"] for p in players]
    news_items, news_source_label = news_source.fetch_news(player_names)
    summary["sources"]["news"] = {"source": news_source_label, "count": len(news_items)}

    rookie_names = [p["name"] for p in players if p.get("is_rookie")]
    rookie_metrics, rookie_source = college_source.fetch_rookie_college_metrics(rookie_names, season)
    summary["sources"]["college"] = {"source": rookie_source, "count": len(rookie_metrics)}

    schedule_by_team, schedule_source_label = schedule_source.fetch_schedule(season)
    summary["sources"]["schedule"] = {"source": schedule_source_label, "teams": len(schedule_by_team)}

    now = datetime.now(timezone.utc).isoformat()

    with db.connect(config.db_path) as conn:
        for p in players:
            conn.execute(
                """INSERT INTO players (player_id, name, position, team, age, is_rookie, college, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(player_id) DO UPDATE SET
                       name=excluded.name, position=excluded.position, team=excluded.team,
                       age=excluded.age, is_rookie=excluded.is_rookie, college=excluded.college,
                       updated_at=excluded.updated_at""",
                (
                    p["player_id"], p["name"], p["position"], p.get("team"),
                    p.get("age"), int(bool(p.get("is_rookie"))), p.get("college"), now,
                ),
            )

        for player_id, stats in stats_by_id.items():
            if not isinstance(stats, dict):
                continue
            conn.execute(
                """INSERT INTO player_stats (player_id, season, games_played, fantasy_points, stats_json, source)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(player_id, season, source) DO UPDATE SET
                       games_played=excluded.games_played, fantasy_points=excluded.fantasy_points,
                       stats_json=excluded.stats_json""",
                (
                    player_id, stats.get("season", season), stats.get("games_played"),
                    stats.get("fantasy_points"), json.dumps(stats), stats_source,
                ),
            )

        name_to_id = {p["name"]: p["player_id"] for p in players}
        for item in news_items:
            conn.execute(
                """INSERT INTO news_items (player_id, title, summary, link, published, sentiment, source, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    name_to_id.get(item.get("player_name")), item.get("title"), item.get("summary"),
                    item.get("link"), item.get("published"), item.get("sentiment"),
                    item.get("source"), item.get("fetched_at"),
                ),
            )

        for team, games in schedule_by_team.items():
            for game in games:
                conn.execute(
                    """INSERT INTO schedule (team, week, opponent, is_home, opponent_def_rank)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(team, week) DO UPDATE SET
                           opponent=excluded.opponent, is_home=excluded.is_home,
                           opponent_def_rank=excluded.opponent_def_rank""",
                    (team, game["week"], game["opponent"], int(game["is_home"]), game["opponent_def_rank"]),
                )

        # Rookie college metrics feed analyze.py directly via the fixture/API
        # response rather than a dedicated table, since the schema varies by
        # source; stash it as JSON on the player's stats row (season=0 marks
        # "college", not an NFL season) so it round-trips through SQLite too.
        for record in rookie_metrics:
            player_name = record.get("player_name") or record.get("name")
            player_id = name_to_id.get(player_name)
            if not player_id:
                continue
            conn.execute(
                """INSERT INTO player_stats (player_id, season, games_played, fantasy_points, stats_json, source)
                   VALUES (?, 0, NULL, NULL, ?, ?)
                   ON CONFLICT(player_id, season, source) DO UPDATE SET stats_json=excluded.stats_json""",
                (player_id, json.dumps(record), rookie_source),
            )

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch fantasy football data into the local SQLite DB.")
    parser.add_argument("--season", type=int, default=config.league.get("season_year", 2026) - 1,
                         help="Season year of stats to fetch (defaults to the year before the league's season_year).")
    args = parser.parse_args()

    summary = run_fetch(args.season)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
