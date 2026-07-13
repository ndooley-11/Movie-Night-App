#!/usr/bin/env python3
"""main.py — Runs the full Deep Research Agent pipeline once:

    fetch.py -> analyze.py -> export.py -> email_report.py

This is what the scheduler (scheduler.py) calls on each cadence tick, and
it's also the single command you run by hand to test everything end to end.

Usage:
    python main.py                 # full run, email sent if SMTP configured
    python main.py --dry-run       # full run, email always just previewed
    python main.py --season 2025   # override the stats season fetched
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze
import email_report
import export
import fetch
from src.config import config


def run_pipeline(season: int, dry_run: bool) -> None:
    print(f"\n[1/4] Fetching data (stats season={season})...")
    fetch_summary = fetch.run_fetch(season)
    for name, info in fetch_summary["sources"].items():
        print(f"      {name}: source={info['source']} count={info.get('count', info.get('teams'))}")

    print("\n[2/4] Analyzing & ranking...")
    analyze_summary = analyze.run_analysis()
    print(f"      ranked {analyze_summary['players_ranked']} players @ {analyze_summary['run_timestamp']}")

    print("\n[3/4] Exporting spreadsheet...")
    export_summary = export.run_export()
    print(f"      CSV:  {export_summary['csv_path']}")
    print(f"      XLSX: {export_summary['xlsx_path']}")

    print("\n[4/4] Building & sending/previewing email report...")
    markdown_body, phase = email_report.build_report_markdown()
    email_report.deliver_report(markdown_body, phase, dry_run)

    print("\nDone.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the full fantasy football research agent pipeline once.")
    parser.add_argument("--season", type=int, default=config.league.get("season_year", 2026) - 1)
    parser.add_argument("--dry-run", action="store_true", help="Never send email, only preview.")
    args = parser.parse_args()
    run_pipeline(args.season, args.dry_run)


if __name__ == "__main__":
    main()
