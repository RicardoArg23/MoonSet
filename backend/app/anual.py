"""Datos de un año para un sitio: horizonte + posición horaria del Sol y la Tierra.

Es el formato que consume el frontend (frontend/src/v2), que deriva las métricas de misión en el
navegador. Lo usan el script scripts/precalcular_anual.py (sitios curados) y la API (coordenadas
personalizadas).
"""
from __future__ import annotations

from datetime import datetime

import numpy as np

from .efemerides import calcular_posiciones
from .horizonte import obtener_horizonte

DIAS_MAX = 400  # 365 más margen para misiones que empiezan a fin de año


def _lista(arr, decimales: int) -> list:
    return np.round(np.asarray(arr, dtype="float64"), decimales).tolist()


def construir_anual(sitio: dict, inicio: datetime, dias: int = DIAS_MAX, altura_m: float = 2.0) -> tuple[dict, dict]:
    """Devuelve (datos del sitio listos para JSON, posiciones crudas)."""
    pos = calcular_posiciones(sitio["lat"], sitio["lon"], inicio, dias, 1.0)
    horizonte, fuente = obtener_horizonte(sitio["lat"], sitio["lon"], altura_m)
    datos = {
        "sitio": sitio,
        "inicio": pos["tiempos"][0],
        "paso_horas": 1,
        "muestras": len(pos["tiempos"]),
        "altura_m": altura_m,
        "horizonte": {"fuente": fuente, "grados": _lista(horizonte, 3)},
        "sol_el": _lista(pos["sol"]["elevacion"], 3),
        "sol_az": _lista(pos["sol"]["azimut"], 2),
        "tierra_el": _lista(pos["tierra"]["elevacion"], 3),
        "tierra_az": _lista(pos["tierra"]["azimut"], 2),
    }
    return datos, pos


def geometria(pos: dict) -> dict:
    """Puntos de la Luna con el Sol y la Tierra en el cenit. No dependen del sitio."""
    return {
        "inicio": pos["tiempos"][0], "paso_horas": 1,
        "sol_lat": _lista(pos["subsolar"]["lat"], 2), "sol_lon": _lista(pos["subsolar"]["lon"], 1),
        "tierra_lat": _lista(pos["subterrestre"]["lat"], 2), "tierra_lon": _lista(pos["subterrestre"]["lon"], 2),
    }
