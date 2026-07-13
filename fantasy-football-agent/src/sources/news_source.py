"""News, injury reports, and social sentiment via free public RSS feeds.

No paid sentiment API is used (per project constraints): sentiment is a
lightweight keyword-based heuristic over headline + summary text. It's not
research-grade NLP, but it's enough to flag "this player has recent
negative buzz" vs "positive buzz" for the report, and it's free and local.

Reddit's per-subreddit ``.rss`` endpoint and most sports outlets' RSS feeds
require no key either, which is why RSS is the second real (non-mock)
source in this project. Falls back to the bundled fixture on any failure.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import feedparser

from src.config import config

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "fixtures"
TIMEOUT_SECONDS = 10

POSITIVE_WORDS = {
    "breakout", "dazzles", "praised", "elite", "cleared", "healthy", "dominant",
    "impressing", "buzz", "explosive", "rising", "no restrictions", "full-go",
    "full go", "star", "upside", "steal", "value",
}
NEGATIVE_WORDS = {
    "held out", "soreness", "injury", "injured", "limited", "concern",
    "questionable", "doubtful", "out", "suspended", "controversy", "dust-up",
    "attitude", "trade rumors", "benched", "fumble", "declining", "regression",
}


def score_sentiment(text: str) -> str:
    lowered = text.lower()
    pos = sum(1 for w in POSITIVE_WORDS if w in lowered)
    neg = sum(1 for w in NEGATIVE_WORDS if w in lowered)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _load_fixture() -> list[dict]:
    with open(FIXTURES_DIR / "news.json", "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_news(player_names: list[str]) -> tuple[list[dict[str, Any]], str]:
    """Returns (news_items, source_label). Matches feed entries to known
    player names by substring so items can be linked back to players."""
    feeds = config.sources.get("news_rss_feeds", [])
    items: list[dict[str, Any]] = []
    any_feed_succeeded = False

    for feed_url in feeds:
        try:
            parsed = feedparser.parse(feed_url, request_headers={"User-Agent": "fantasy-research-agent/1.0"})
            if parsed.bozo and not parsed.entries:
                continue
            any_feed_succeeded = True
            for entry in parsed.entries[:50]:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                matched = next((name for name in player_names if name.lower() in (title + " " + summary).lower()), None)
                if not matched:
                    continue
                items.append(
                    {
                        "player_name": matched,
                        "title": title,
                        "summary": summary,
                        "link": entry.get("link", ""),
                        "published": entry.get("published", ""),
                        "source": feed_url,
                    }
                )
        except Exception:
            continue

    if not any_feed_succeeded or not items:
        items = _load_fixture()
        source_label = "fixture"
    else:
        source_label = "live"

    for item in items:
        item["sentiment"] = score_sentiment(item.get("title", "") + " " + item.get("summary", ""))
        item.setdefault("fetched_at", datetime.now(timezone.utc).isoformat())

    return items, source_label
