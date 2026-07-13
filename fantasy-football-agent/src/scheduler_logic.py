"""Pure date-math for the three-phase run cadence. No I/O, fully unit-testable.

Phase 1 (now .. draft_season_start)     : weekly   — offseason, low churn
Phase 2 (draft_season_start .. kickoff) : daily    — peak draft season
Phase 3 (kickoff .. season_end)         : weekly   — in-season management
Outside all ranges (post season_end)    : weekly   — treated like phase 1/3
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class Phase:
    number: int
    name: str
    cadence: str  # "weekly" or "daily"
    report_mode: str  # "preseason" or "in_season"


def _parse(d: str | date) -> date:
    if isinstance(d, date):
        return d
    return datetime.strptime(d, "%Y-%m-%d").date()


def get_phase(today: date, draft_season_start: str | date, season_kickoff: str | date,
              season_end: str | date) -> Phase:
    draft_start = _parse(draft_season_start)
    kickoff = _parse(season_kickoff)
    end = _parse(season_end)

    if today < draft_start:
        return Phase(1, "Offseason Prep", "weekly", "preseason")
    if draft_start <= today < kickoff:
        return Phase(2, "Peak Draft Season", "daily", "preseason")
    if kickoff <= today <= end:
        return Phase(3, "In-Season Management", "weekly", "in_season")
    # After the season ends, fall back to weekly offseason-style cadence.
    return Phase(1, "Offseason Prep", "weekly", "preseason")


def should_run_today(today: date, draft_season_start: str | date, season_kickoff: str | date,
                      season_end: str | date, weekly_run_weekday: int) -> bool:
    """weekly_run_weekday: Monday=0 .. Sunday=6 (Python's date.weekday())."""
    phase = get_phase(today, draft_season_start, season_kickoff, season_end)
    if phase.cadence == "daily":
        return True
    return today.weekday() == weekly_run_weekday


WEEKDAY_NAME_TO_INT = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def cron_expressions(draft_season_start: str | date, season_kickoff: str | date,
                      season_end: str | date, weekly_run_time: str, daily_run_time: str,
                      weekly_run_weekday_name: str) -> list[dict]:
    """Human-facing reference: the crontab lines that correspond to each
    phase, annotated with the date range they apply to. Real automation
    should use the single always-on wrapper-script entry (see scheduler.py
    --print-cron) since plain cron can't switch its own schedule on a date;
    these are provided for documentation / manual crontab editing.
    """
    wh, wm = weekly_run_time.split(":")
    dh, dm = daily_run_time.split(":")
    python_weekday = WEEKDAY_NAME_TO_INT.get(weekly_run_weekday_name.lower(), 0)
    # cron's day-of-week field is Sunday=0..Saturday=6; Python's date.weekday()
    # is Monday=0..Sunday=6. Convert so e.g. "monday" renders as cron's 1, not 0.
    weekday_num = (python_weekday + 1) % 7

    return [
        {
            "phase": 1,
            "label": "Offseason Prep (weekly)",
            "applies": f"until {draft_season_start}",
            "cron": f"{wm} {wh} * * {weekday_num}",
        },
        {
            "phase": 2,
            "label": "Peak Draft Season (daily)",
            "applies": f"{draft_season_start} .. {season_kickoff}",
            "cron": f"{dm} {dh} * * *",
        },
        {
            "phase": 3,
            "label": "In-Season Management (weekly)",
            "applies": f"{season_kickoff} .. {season_end}",
            "cron": f"{wm} {wh} * * {weekday_num}",
        },
    ]
