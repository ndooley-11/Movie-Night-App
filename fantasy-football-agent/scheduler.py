#!/usr/bin/env python3
"""scheduler.py — Dynamic scheduler for the three-phase run cadence.

    Phase 1  (now .. Aug 1, 2026)        : once a week   (offseason prep)
    Phase 2  (Aug 1 .. Sep 9, 2026)      : once a day    (peak draft season)
    Phase 3  (Sep 9, 2026 .. season end) : once a week   (in-season mgmt)

Two ways to run this, pick whichever fits your setup:

1. Long-running daemon (good for a machine that's always on):

       python scheduler.py --daemon

   Uses the `schedule` library. Every day at midnight it re-checks which
   phase we're in and reconfigures the job's cadence (daily vs. weekly)
   automatically — the schedule updates itself as the calendar crosses
   Aug 1 / Sep 9 without you touching anything.

2. Plain OS cron (good for a machine that isn't always on): cron itself
   can't change its own schedule mid-flight, so instead install ONE
   always-on daily crontab entry that calls this script in
   `--check-and-run-once` mode; it fetches/analyzes/exports/emails only on
   days should_run_today() says to (every day in Phase 2, once a week
   otherwise) and no-ops silently the rest of the time:

       python scheduler.py --print-cron

   prints the exact crontab line plus a phase-by-phase reference table.
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import schedule as schedule_lib

import main as pipeline
from src import scheduler_logic
from src.config import config

SCHED_CFG = config.scheduler_cfg
DRAFT_SEASON_START = SCHED_CFG.get("draft_season_start", "2026-08-01")
SEASON_KICKOFF = SCHED_CFG.get("season_kickoff", "2026-09-09")
SEASON_END = SCHED_CFG.get("season_end", "2027-01-05")
WEEKLY_RUN_DAY = SCHED_CFG.get("weekly_run_day", "monday").lower()
WEEKLY_RUN_TIME = SCHED_CFG.get("weekly_run_time", "07:00")
DAILY_RUN_TIME = SCHED_CFG.get("daily_run_time", "07:00")


def _run_pipeline_job(dry_run: bool) -> None:
    season = config.league.get("season_year", 2026) - 1
    print(f"\n[scheduler] Triggering pipeline run at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    pipeline.run_pipeline(season, dry_run)


def _configure_job(dry_run: bool) -> scheduler_logic.Phase:
    """(Re)configures the recurring job to match today's phase. Returns the
    phase so callers can log/print what changed."""
    schedule_lib.clear("agent-job")
    phase = scheduler_logic.get_phase(date.today(), DRAFT_SEASON_START, SEASON_KICKOFF, SEASON_END)

    if phase.cadence == "daily":
        schedule_lib.every().day.at(DAILY_RUN_TIME).do(_run_pipeline_job, dry_run).tag("agent-job")
    else:
        day_attr = getattr(schedule_lib.every(), WEEKLY_RUN_DAY, schedule_lib.every().monday)
        day_attr.at(WEEKLY_RUN_TIME).do(_run_pipeline_job, dry_run).tag("agent-job")

    print(f"[scheduler] Phase: {phase.name} -> cadence={phase.cadence}")
    return phase


def run_daemon(dry_run: bool) -> None:
    current_phase = _configure_job(dry_run)
    # Reconciler: once a day, check whether we've crossed a phase boundary
    # and reconfigure the job if so (e.g. today became Aug 1 or Sep 9).
    schedule_lib.every().day.at("00:05").do(lambda: _configure_job(dry_run)).tag("agent-job-reconciler")

    print("[scheduler] Daemon started. Ctrl+C to stop.")
    try:
        while True:
            schedule_lib.run_pending()
            time.sleep(30)
    except KeyboardInterrupt:
        print("\n[scheduler] Stopped.")


def check_and_run_once(dry_run: bool) -> None:
    """For plain-cron installs: no-ops unless today matches the current
    phase's cadence (always True in Phase 2, weekly-day-match otherwise)."""
    weekday_num = scheduler_logic.WEEKDAY_NAME_TO_INT.get(WEEKLY_RUN_DAY, 0)
    should_run = scheduler_logic.should_run_today(
        date.today(), DRAFT_SEASON_START, SEASON_KICKOFF, SEASON_END, weekday_num
    )
    phase = scheduler_logic.get_phase(date.today(), DRAFT_SEASON_START, SEASON_KICKOFF, SEASON_END)
    if not should_run:
        print(f"[scheduler] {date.today()}: phase={phase.name} ({phase.cadence}) — not a scheduled run day, skipping.")
        return
    print(f"[scheduler] {date.today()}: phase={phase.name} ({phase.cadence}) — running now.")
    _run_pipeline_job(dry_run)


def print_cron_reference() -> None:
    rows = scheduler_logic.cron_expressions(
        DRAFT_SEASON_START, SEASON_KICKOFF, SEASON_END, WEEKLY_RUN_TIME, DAILY_RUN_TIME, WEEKLY_RUN_DAY
    )
    print("Reference: what each phase's cadence maps to as a crontab line")
    print("(informational only — see the recommended single always-on line below)\n")
    for row in rows:
        print(f"  Phase {row['phase']} — {row['label']:<30} {row['applies']:<30} cron: {row['cron']}")

    project_dir = Path(__file__).resolve().parent
    print("\nRecommended: ONE always-on crontab line that self-adjusts across all three phases.")
    print("It runs daily and calls this script in --check-and-run-once mode, which no-ops")
    print("on days outside the current phase's cadence:\n")
    print(f"  0 7 * * * cd {project_dir} && /usr/bin/env python3 scheduler.py --check-and-run-once >> data/scheduler.log 2>&1")
    print("\nEdit with: crontab -e")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dynamic phase-aware scheduler for the fantasy football agent.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--daemon", action="store_true", help="Run forever, self-adjusting cadence as phases change.")
    mode.add_argument("--check-and-run-once", action="store_true", help="Run once now only if today matches the current phase's cadence (for plain cron).")
    mode.add_argument("--print-cron", action="store_true", help="Print crontab reference lines and exit.")
    parser.add_argument("--dry-run", action="store_true", help="Never send email, only preview.")
    args = parser.parse_args()

    if args.print_cron:
        print_cron_reference()
    elif args.daemon:
        run_daemon(args.dry_run)
    elif args.check_and_run_once:
        check_and_run_once(args.dry_run)


if __name__ == "__main__":
    main()
