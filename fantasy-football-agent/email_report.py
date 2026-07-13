#!/usr/bin/env python3
"""email_report.py — Report generation & delivery stage.

Builds a Markdown + HTML analysis report from the latest ranking snapshot,
choosing pre-season (draft prep: sleepers/busts/value picks) or in-season
(weekly recap: waiver targets, matchup previews, start/sit) framing based on
today's date via src/scheduler_logic.get_phase(). Sends it over SMTP if
credentials are configured (see config.example.json / .env.example);
otherwise prints the preview to the console, which is also what happens on
`--dry-run` even when SMTP *is* configured.

Usage:
    python email_report.py                 # send if configured, else preview
    python email_report.py --dry-run        # always just preview
"""
from __future__ import annotations

import argparse
import json
import smtplib
import sys
from datetime import date, datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src import db, scheduler_logic
from src.config import config

TOP_N = 10
WAIVER_TAGS = {"Sleeper", "Value Pick", "Rookie Watch"}


def _latest_records() -> tuple[list[dict], str | None]:
    with db.connect(config.db_path) as conn:
        run_timestamp = db.latest_run_timestamp(conn)
        if not run_timestamp:
            return [], None
        rows = db.fetch_rankings_for_run(conn, run_timestamp)
    return [dict(r) for r in rows], run_timestamp


def _current_phase() -> scheduler_logic.Phase:
    sched = config.scheduler_cfg
    return scheduler_logic.get_phase(
        date.today(),
        sched.get("draft_season_start", "2026-08-01"),
        sched.get("season_kickoff", "2026-09-09"),
        sched.get("season_end", "2027-01-05"),
    )


def _build_preseason_markdown(records: list[dict], run_timestamp: str, phase: scheduler_logic.Phase) -> str:
    top = records[:TOP_N]
    sleepers = [r for r in records if r["tag"] == "Sleeper"][:5]
    busts = [r for r in records if r["tag"] == "Bust Risk"][:5]
    values = [r for r in records if r["tag"] == "Value Pick"][:5]
    rookies = [r for r in records if r["tag"] == "Rookie Watch"][:5]

    lines = [
        f"# Fantasy Football Draft Prep — {phase.name}",
        f"_League: {config.league.get('name', 'Fantasy League')} · Generated {run_timestamp} UTC_",
        "",
        "## Top Overall Rankings",
        "",
        "| Rank | Player | Pos | Team | Proj Pts | Risk |",
        "|---|---|---|---|---|---|",
    ]
    for r in top:
        lines.append(f"| {r['overall_rank']} | {r['name']} | {r['position']} | {r['team']} | {r['projected_points']} | {r['risk_tier']} |")

    def _section(title: str, items: list[dict]) -> list[str]:
        out = [f"\n## {title}\n"]
        if not items:
            out.append("_None flagged this run._")
            return out
        for r in items:
            note = f" — {r['notes']}" if r.get("notes") else ""
            out.append(f"- **{r['name']}** ({r['position']}, {r['team']}), proj {r['projected_points']} pts{note}")
        return out

    lines += _section("🛌 Sleepers", sleepers)
    lines += _section("💣 Bust Risks", busts)
    lines += _section("💰 Value Picks", values)
    lines += _section("🌱 Rookie Watch", rookies)

    lines.append(
        "\n---\n_Full rankings: see the attached `fantasy_rankings_2026.csv` / `.xlsx`. "
        "This is a heuristic model for draft prep, not betting/financial advice._"
    )
    return "\n".join(lines)


def _build_inseason_markdown(records: list[dict], run_timestamp: str, phase: scheduler_logic.Phase) -> str:
    top = records[:TOP_N]
    waiver_targets = [r for r in records if r["tag"] in WAIVER_TAGS and r["overall_rank"] > 24][:8]
    start_candidates = [r for r in records if r["risk_tier"] == "Low"][:6]
    sit_candidates = [r for r in records if r["risk_tier"] == "High"][:6]

    lines = [
        f"# Weekly Fantasy Football Report — {phase.name}",
        f"_League: {config.league.get('name', 'Fantasy League')} · Generated {run_timestamp} UTC_",
        "",
        "## This Week's Top Performers (Season Rankings)",
        "",
        "| Rank | Player | Pos | Team | Proj Pts | Risk |",
        "|---|---|---|---|---|---|",
    ]
    for r in top:
        lines.append(f"| {r['overall_rank']} | {r['name']} | {r['position']} | {r['team']} | {r['projected_points']} | {r['risk_tier']} |")

    lines.append("\n## 🎯 Waiver Wire Targets\n")
    if waiver_targets:
        for r in waiver_targets:
            note = f" — {r['notes']}" if r.get("notes") else ""
            lines.append(f"- **{r['name']}** ({r['position']}, {r['team']}), proj {r['projected_points']} pts{note}")
    else:
        lines.append("_No standout widely-available targets flagged this run._")

    lines.append("\n## ✅ Start With Confidence\n")
    for r in start_candidates:
        lines.append(f"- {r['name']} ({r['position']}, {r['team']}) — Low risk, {r['projected_points']} proj pts")

    lines.append("\n## ⚠️ Consider Sitting / Bench Watch\n")
    if sit_candidates:
        for r in sit_candidates:
            note = f" — {r['notes']}" if r.get("notes") else ""
            lines.append(f"- {r['name']} ({r['position']}, {r['team']}) — High risk{note}")
    else:
        lines.append("_No high-risk starters flagged this run._")

    lines.append(
        "\n---\n_Full rankings: see the attached `fantasy_rankings_2026.csv` / `.xlsx`. "
        "Matchup/SOS notes reflect the remaining full-season schedule, not just next week's opponent._"
    )
    return "\n".join(lines)


def build_report_markdown() -> tuple[str, scheduler_logic.Phase]:
    records, run_timestamp = _latest_records()
    phase = _current_phase()
    if not records:
        return (
            f"# Fantasy Football Report — {phase.name}\n\nNo ranking data found yet. "
            f"Run `python fetch.py && python analyze.py` first.",
            phase,
        )
    if phase.report_mode == "preseason":
        md = _build_preseason_markdown(records, run_timestamp, phase)
    else:
        md = _build_inseason_markdown(records, run_timestamp, phase)
    return md, phase


def _markdown_to_html(md: str) -> str:
    """Minimal, dependency-free Markdown->HTML good enough for this report's
    fixed structure (headers, tables, bullet lists, bold, hr, italics)."""
    html_lines: list[str] = []
    in_table = False
    in_list = False

    def close_list():
        nonlocal in_list
        if in_list:
            html_lines.append("</ul>")
            in_list = False

    def close_table():
        nonlocal in_table
        if in_table:
            html_lines.append("</table>")
            in_table = False

    def inline(text: str) -> str:
        import re
        text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
        text = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*(?!\*)", r"<i>\1</i>", text)
        text = re.sub(r"_(.+?)_", r"<i>\1</i>", text)
        return text

    for raw_line in md.split("\n"):
        line = raw_line.rstrip()
        if line.startswith("# "):
            close_list(); close_table()
            html_lines.append(f"<h1>{inline(line[2:])}</h1>")
        elif line.startswith("## "):
            close_list(); close_table()
            html_lines.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("|"):
            close_list()
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(set(c) <= {"-"} for c in cells):
                continue  # markdown table separator row
            if not in_table:
                html_lines.append('<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">')
                in_table = True
                tag = "th"
            else:
                tag = "td"
            row_html = "".join(f"<{tag}>{inline(c)}</{tag}>" for c in cells)
            html_lines.append(f"<tr>{row_html}</tr>")
        elif line.startswith("- "):
            close_table()
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            html_lines.append(f"<li>{inline(line[2:])}</li>")
        elif line == "---":
            close_list(); close_table()
            html_lines.append("<hr>")
        elif line == "":
            close_list(); close_table()
        else:
            close_list(); close_table()
            html_lines.append(f"<p>{inline(line)}</p>")

    close_list(); close_table()
    body = "\n".join(html_lines)
    return f"""<html><body style="font-family:Arial,Helvetica,sans-serif;max-width:800px;margin:auto;color:#1a1a1a">{body}</body></html>"""


def send_email(subject: str, markdown_body: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config.smtp_from
    msg["To"] = ", ".join(config.smtp_to)
    msg.attach(MIMEText(markdown_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=15) as server:
        if config.smtp_use_tls:
            server.starttls()
        server.login(config.smtp_username, config.smtp_password)
        server.sendmail(config.smtp_from, config.smtp_to, msg.as_string())


def markdown_to_html(md: str) -> str:
    return _markdown_to_html(md)


def deliver_report(markdown_body: str, phase: scheduler_logic.Phase, dry_run: bool) -> None:
    """Prints the console preview, then sends over SMTP unless dry_run is
    set or SMTP isn't configured (in which case it stays preview-only)."""
    html_body = _markdown_to_html(markdown_body)
    subject = f"[Fantasy Football] {phase.name} Report — {date.today().isoformat()}"

    print("=" * 72)
    print(f"SUBJECT: {subject}")
    print(f"PHASE:   {phase.name} (cadence={phase.cadence}, mode={phase.report_mode})")
    print("=" * 72)
    print(markdown_body)
    print("=" * 72)

    if dry_run:
        print("[dry-run] Email not sent.")
        return

    if not config.smtp_is_configured():
        print("[preview only] SMTP is not configured (see config.json / .env). Email not sent.")
        return

    send_email(subject, markdown_body, html_body)
    print(f"[sent] Email delivered to {', '.join(config.smtp_to)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and send/preview the fantasy football report email.")
    parser.add_argument("--dry-run", action="store_true", help="Always print the preview; never send over SMTP.")
    args = parser.parse_args()

    markdown_body, phase = build_report_markdown()
    deliver_report(markdown_body, phase, args.dry_run)


if __name__ == "__main__":
    main()
