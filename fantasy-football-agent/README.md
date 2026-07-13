# Fantasy Football Deep Research Agent (2026)

A local, no-paid-API pipeline that aggregates player data, ranks your league's
draft board / weekly options, exports a spreadsheet, and emails a formatted
report — on a cadence that automatically switches between weekly and daily
as the 2026 season approaches and unfolds.

## What it does

1. **Fetch** (`fetch.py`) — pulls player bios & prior-season stats (Sleeper
   API, free/no-key), news + injury/sentiment (public RSS feeds), rookie
   college metrics (College Football Data API, free tier, optional key), and
   the season schedule/strength-of-schedule. Every source falls back to a
   bundled fixture in `data/fixtures/` if the live call fails for any reason
   (offline, rate-limited, endpoint not yet published), so the pipeline
   always completes.
2. **Analyze** (`analyze.py`) — turns raw stats into a projection, applies a
   strength-of-schedule adjustment, assigns a Low/Medium/High risk tier, and
   tags each player (Sleeper, Bust Risk, Value Pick, Rookie Watch, Safe
   Floor, Depth Piece). See the module docstring for the exact rules — it's
   a transparent heuristic, not a black box. Every run appends a fresh
   timestamped snapshot to the `rankings_history` table in SQLite instead of
   overwriting, so the spreadsheet is "auto-updating" run over run.
3. **Export** (`export.py`) — writes the latest snapshot to
   `data/output/fantasy_rankings_2026.csv` and a styled
   `fantasy_rankings_2026.xlsx` (color-coded by risk tier, frozen header
   row).
4. **Email report** (`email_report.py`) — builds a Markdown + HTML report.
   Before Aug 1, 2026 and during Aug 1–Sep 9 it uses **pre-season** framing
   (sleepers/busts/value picks/rookie watch). From Sep 9 onward it switches
   to **in-season** framing (waiver targets, start/sit, matchup notes).
   Sends over SMTP if configured; otherwise (or with `--dry-run`) just
   prints the preview to the console.
5. **Scheduler** (`scheduler.py`) — implements the three-phase cadence. See
   below.

## Setup

```bash
cd fantasy-football-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp config.example.json config.json   # or: cp .env.example .env
# edit config.json / .env with your real SMTP credentials (see below)
```

Nothing in `config.json` or `.env` is committed to git (both are
gitignored) — only the `.example` templates are tracked.

### SMTP credentials

Edit `config.json`'s `"smtp"` block (or the `.env` equivalent):

- Gmail: host `smtp.gmail.com`, port `587`, `use_tls: true`. Use an **App
  Password** (Google Account → Security → 2-Step Verification → App
  Passwords), not your real password.
- Any other provider: use whatever host/port/username/password they give you
  for SMTP submission.

If SMTP isn't configured, every run just prints the email preview to the
console instead of failing — this is the default and is what powers the
"test execution" below.

### Optional: College Football Data API key

Rookie college metrics use the [CFBD](https://collegefootballdata.com) free
tier, which requires a personal key (get one free at their site). Without a
key, rookie data comes from the bundled fixture. Set
`apis.college_football_data_api_key` in `config.json` or `CFBD_API_KEY` in
`.env` to enable it.

## Running it

```bash
# Full pipeline once, prints spreadsheet paths + email preview to console
python main.py --dry-run

# Full pipeline once, sends the email for real if SMTP is configured
python main.py

# Individual stages (each also runnable standalone)
python fetch.py
python analyze.py
python export.py
python email_report.py --dry-run
```

## The dynamic schedule

| Phase | Date range (2026) | Cadence | Report framing |
|---|---|---|---|
| 1 — Offseason Prep | now → Aug 1 | Weekly | Pre-season (draft prep) |
| 2 — Peak Draft Season | Aug 1 → Sep 9 | **Daily** | Pre-season (draft prep) |
| 3 — In-Season Management | Sep 9 → season end | Weekly | In-season (weekly recap) |

The date boundaries live in `config.json`'s `"scheduler"` block, so you can
adjust them without touching code.

Two ways to actually run it on that schedule:

**A. Long-running daemon** (a machine that's always on):

```bash
python scheduler.py --daemon
```

Uses the lightweight `schedule` library. It re-checks the current phase
every day at 00:05 and reconfigures the job's cadence automatically as the
calendar crosses Aug 1 / Sep 9 — no manual intervention needed.

**B. Plain OS cron** (a machine that isn't always on, e.g. a home server
that sleeps): cron can't change its own schedule mid-flight, so install
**one** always-on daily crontab entry that calls this script in
"check-and-run-once" mode. It silently no-ops on days outside the current
phase's cadence (every day counts in Phase 2; only the configured weekly day
counts in Phases 1 & 3):

```bash
python scheduler.py --print-cron
```

prints the exact line to add via `crontab -e`, plus a phase-by-phase
reference table of what cron expression corresponds to each phase (for
documentation — the single wrapper line above is what you actually want to
install, since plain cron entries can't switch themselves off automatically
between phases).

## File structure

```
fantasy-football-agent/
├── README.md
├── requirements.txt
├── config.example.json      # copy to config.json (gitignored)
├── .env.example              # or copy to .env (gitignored)
├── main.py                   # runs fetch -> analyze -> export -> email once
├── fetch.py                  # Stage 1: data aggregation
├── analyze.py                # Stage 2: ranking / risk engine
├── export.py                 # Stage 3: CSV + XLSX spreadsheet
├── email_report.py           # Stage 4: report + SMTP send / console preview
├── scheduler.py               # Phase-aware daemon + cron helper
├── src/
│   ├── config.py              # loads config.json/.env
│   ├── db.py                  # SQLite schema + helpers
│   ├── scheduler_logic.py     # pure phase/cadence date-math (unit-testable)
│   └── sources/
│       ├── sleeper_source.py   # players + season stats (Sleeper API)
│       ├── news_source.py      # RSS news + keyword sentiment
│       ├── schedule_source.py  # 2026 schedule + strength-of-schedule
│       └── college_source.py   # rookie college metrics (CFBD API)
└── data/
    ├── fixtures/               # bundled offline fallback data (tracked in git)
    ├── fantasy.db              # SQLite DB (gitignored, created on first run)
    └── output/                 # generated CSV/XLSX (gitignored, created on first run)
```

## Notes & constraints

- No paid APIs. Sleeper and RSS feeds are free and keyless; CFBD's free tier
  needs a key but works without one (fixture fallback).
- Every fixture in `data/fixtures/` is clearly-labeled demo/placeholder data
  (a few rookies use invented names) meant to exercise the pipeline
  end-to-end when live sources are unreachable — swap in real data by
  letting the live fetchers succeed (e.g. run this from a network that
  isn't behind a restrictive proxy).
- The ranking model is an intentionally simple, documented heuristic (see
  `analyze.py`'s docstring) — good for organizing your own research, not a
  substitute for expert consensus rankings.
