"""Player + season-stat data from the Sleeper API.

Sleeper (https://docs.sleeper.com) is free and requires no API key or auth,
which is why it's the primary "real" source here. If the request fails for
any reason (offline, rate-limited, schema drift, corporate firewall) we fall
back to the bundled fixture so the rest of the pipeline always has data to
work with.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests

from src.config import config

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "fixtures"
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF", "DST"}
TIMEOUT_SECONDS = 10


def _load_fixture(name: str) -> Any:
    with open(FIXTURES_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_players() -> tuple[list[dict], str]:
    """Returns (players, source_label). source_label is 'live' or 'fixture'."""
    base_url = config.sources.get("sleeper_base_url", "https://api.sleeper.app/v1")
    try:
        resp = requests.get(f"{base_url}/players/nfl", timeout=TIMEOUT_SECONDS)
        resp.raise_for_status()
        raw = resp.json()
        players = []
        for player_id, info in raw.items():
            position = info.get("position")
            if position not in FANTASY_POSITIONS:
                continue
            players.append(
                {
                    "player_id": player_id,
                    "name": info.get("full_name") or f"{info.get('first_name', '')} {info.get('last_name', '')}".strip(),
                    "position": position,
                    "team": info.get("team"),
                    "age": info.get("age"),
                    "is_rookie": (info.get("years_exp") == 0),
                    "college": info.get("college"),
                }
            )
        if not players:
            raise ValueError("Sleeper response parsed but yielded zero fantasy-relevant players")
        return players, "live"
    except Exception:
        return _load_fixture("players.json"), "fixture"


def fetch_season_stats(season: int) -> tuple[dict[str, dict], str]:
    """Returns ({player_id: stats}, source_label)."""
    base_url = config.sources.get("sleeper_base_url", "https://api.sleeper.app/v1")
    try:
        resp = requests.get(
            f"{base_url}/stats/nfl/regular/{season}", timeout=TIMEOUT_SECONDS
        )
        resp.raise_for_status()
        raw = resp.json()
        if not isinstance(raw, dict) or not raw:
            raise ValueError("Sleeper stats response was empty or unexpected shape")
        return raw, "live"
    except Exception:
        fixture = _load_fixture("player_stats.json")
        fixture.pop("_comment", None)
        return fixture, "fixture"
