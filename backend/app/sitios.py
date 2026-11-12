"""Lista curada de sitios de alunizaje (data/sitios.json)."""
from __future__ import annotations

import json
from functools import lru_cache

from . import config


@lru_cache(maxsize=1)
def cargar_sitios() -> list[dict]:
    with open(config.SITIOS_JSON, encoding="utf-8") as f:
        return json.load(f)["sitios"]


def buscar_sitio(sitio_id: str) -> dict | None:
    return next((s for s in cargar_sitios() if s["id"] == sitio_id), None)
