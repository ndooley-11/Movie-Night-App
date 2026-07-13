"""College football metrics for rookies, via the College Football Data API.

CollegeFootballData (https://collegefootballdata.com) has a free tier that
requires a personal API key (unlike Sleeper/RSS, it isn't fully anonymous),
so it's optional here: set `apis.college_football_data_api_key` in
config.json or CFBD_API_KEY in .env to enable it. Without a key, or if the
request fails, we fall back to the bundled fixture of rookie prospects.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests

from src.config import config

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "fixtures"
TIMEOUT_SECONDS = 10
CFBD_BASE_URL = "https://api.collegefootballdata.com"


def _load_fixture() -> list[dict]:
    with open(FIXTURES_DIR / "college_rookies.json", "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_rookie_college_metrics(rookie_names: list[str], season: int) -> tuple[list[dict[str, Any]], str]:
    """Returns (rookie_records, source_label)."""
    api_key = config.cfbd_api_key
    if not api_key:
        return _load_fixture(), "fixture"

    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        records = []
        for name in rookie_names:
            resp = requests.get(
                f"{CFBD_BASE_URL}/player/search",
                params={"searchTerm": name, "year": season - 1},
                headers=headers,
                timeout=TIMEOUT_SECONDS,
            )
            resp.raise_for_status()
            matches = resp.json()
            if matches:
                records.append(matches[0])
        if not records:
            raise ValueError("CFBD returned no matches for any rookie")
        return records, "live"
    except Exception:
        return _load_fixture(), "fixture"
