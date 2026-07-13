"""Loads config.json (falling back to config.example.json) and overlays .env values.

Nothing sensitive lives in git: config.json and .env are both gitignored. This
module is the single place the rest of the codebase reads settings from.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent

load_dotenv(ROOT_DIR / ".env")


def _load_json_config() -> dict[str, Any]:
    real = ROOT_DIR / "config.json"
    example = ROOT_DIR / "config.example.json"
    path = real if real.exists() else example
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _bool_env(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


class Config:
    def __init__(self) -> None:
        self._raw = _load_json_config()

        smtp = self._raw.get("smtp", {})
        self.smtp_host = os.getenv("SMTP_HOST", smtp.get("host", ""))
        self.smtp_port = int(os.getenv("SMTP_PORT", smtp.get("port", 587)))
        self.smtp_use_tls = _bool_env(os.getenv("SMTP_USE_TLS"), smtp.get("use_tls", True))
        self.smtp_username = os.getenv("SMTP_USERNAME", smtp.get("username", ""))
        self.smtp_password = os.getenv("SMTP_PASSWORD", smtp.get("password", ""))
        self.smtp_from = os.getenv("SMTP_FROM_ADDRESS", smtp.get("from_address", ""))
        env_to = os.getenv("SMTP_TO_ADDRESSES")
        if env_to:
            self.smtp_to = [addr.strip() for addr in env_to.split(",") if addr.strip()]
        else:
            self.smtp_to = smtp.get("to_addresses", [])

        apis = self._raw.get("apis", {})
        self.cfbd_api_key = os.getenv("CFBD_API_KEY", apis.get("college_football_data_api_key", ""))

        self.league = self._raw.get("league", {})
        self.sources = self._raw.get("sources", {})
        self.scheduler_cfg = self._raw.get("scheduler", {})

        paths = self._raw.get("paths", {})
        self.db_path = ROOT_DIR / paths.get("database", "data/fantasy.db")
        self.csv_output = ROOT_DIR / paths.get("csv_output", "data/output/fantasy_rankings_2026.csv")
        self.xlsx_output = ROOT_DIR / paths.get("xlsx_output", "data/output/fantasy_rankings_2026.xlsx")

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.csv_output.parent.mkdir(parents=True, exist_ok=True)

    def smtp_is_configured(self) -> bool:
        placeholder_markers = ("your-email@gmail.com", "your-app-password-here", "")
        return (
            bool(self.smtp_host)
            and self.smtp_username not in placeholder_markers
            and self.smtp_password not in placeholder_markers
            and bool(self.smtp_to)
        )


config = Config()
