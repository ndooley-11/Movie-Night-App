"""SQLite storage for players, per-run rankings history, and news items.

Keeping rankings in a history table (rather than overwriting a single row)
is what makes the spreadsheet "auto-updating" meaningful: every run appends a
new snapshot tagged with run_timestamp, so trends over time are queryable.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    player_id       TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    position        TEXT NOT NULL,
    team            TEXT,
    age             INTEGER,
    is_rookie       INTEGER DEFAULT 0,
    college         TEXT,
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS player_stats (
    player_id       TEXT NOT NULL,
    season          INTEGER NOT NULL,
    games_played    INTEGER,
    fantasy_points  REAL,
    stats_json      TEXT,
    source          TEXT,
    PRIMARY KEY (player_id, season, source)
);

CREATE TABLE IF NOT EXISTS news_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id       TEXT,
    title           TEXT,
    summary         TEXT,
    link            TEXT,
    published       TEXT,
    sentiment       TEXT,
    source          TEXT,
    fetched_at      TEXT
);

CREATE TABLE IF NOT EXISTS schedule (
    team            TEXT NOT NULL,
    week            INTEGER NOT NULL,
    opponent        TEXT,
    is_home         INTEGER,
    opponent_def_rank REAL,
    PRIMARY KEY (team, week)
);

CREATE TABLE IF NOT EXISTS rankings_history (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_timestamp       TEXT NOT NULL,
    player_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    position            TEXT,
    team                TEXT,
    projected_points     REAL,
    sos_adjustment      REAL,
    risk_tier            TEXT,
    tag                 TEXT,
    overall_rank         INTEGER,
    position_rank        INTEGER,
    notes                TEXT
);

CREATE INDEX IF NOT EXISTS idx_rankings_run ON rankings_history(run_timestamp);
CREATE INDEX IF NOT EXISTS idx_news_player ON news_items(player_id);
"""


def get_connection(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path) -> None:
    conn = get_connection(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def connect(db_path: Path) -> Iterator[sqlite3.Connection]:
    init_db(db_path)
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def latest_run_timestamp(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        "SELECT run_timestamp FROM rankings_history ORDER BY run_timestamp DESC LIMIT 1"
    ).fetchone()
    return row["run_timestamp"] if row else None


def fetch_rankings_for_run(conn: sqlite3.Connection, run_timestamp: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM rankings_history WHERE run_timestamp = ? ORDER BY overall_rank ASC",
        (run_timestamp,),
    ).fetchall()
