"""Métricas de energía y comunicación a partir de las posiciones y el horizonte."""
from __future__ import annotations

import numpy as np

from . import config
from .horizonte import altura_en_azimut


def _racha_maxima(mascara: np.ndarray) -> int:
    mejor = actual = 0
    for v in mascara:
        actual = actual + 1 if v else 0
        mejor = max(mejor, actual)
    return mejor


def _eventos(tiempos: list[str], visible: np.ndarray, sale: str, pone: str) -> list[dict]:
    """Momentos en que el objeto aparece o se esconde detrás del horizonte."""
    cambios = np.flatnonzero(visible[1:] != visible[:-1]) + 1
    return [{"tipo": sale if visible[i] else pone, "t": tiempos[i], "indice": int(i)} for i in cambios]


def _horas_hasta(mascara_cambio: np.ndarray, paso_horas: float) -> float | None:
    """Horas desde el inicio hasta el primer cambio; None si no cambia en todo el período."""
    idx = np.flatnonzero(mascara_cambio)
    return float(idx[0] * paso_horas) if idx.size else None


def calcular(pos: dict, horizonte: np.ndarray, paso_horas: float) -> dict:
    sol_el, sol_az = pos["sol"]["elevacion"], pos["sol"]["azimut"]
    tie_el, tie_az = pos["tierra"]["elevacion"], pos["tierra"]["azimut"]

    margen_sol = sol_el - altura_en_azimut(horizonte, sol_az)
    margen_tierra = tie_el - altura_en_azimut(horizonte, tie_az)

    # Hay luz si asoma al menos el borde del disco solar
    luz = margen_sol > -config.RADIO_APARENTE_SOL_DEG
    senal = margen_tierra > 0
    # Fracción visible del disco solar (0 a 1), aproximación lineal
    fraccion_sol = np.clip((margen_sol + config.RADIO_APARENTE_SOL_DEG) / (2 * config.RADIO_APARENTE_SOL_DEG), 0, 1)

    n = len(luz)
    metricas = {
        "porcentaje_luz": round(100 * luz.mean(), 1),
        "porcentaje_senal": round(100 * senal.mean(), 1),
        "porcentaje_luz_y_senal": round(100 * (luz & senal).mean(), 1),
        "oscuridad_mas_larga_h": _racha_maxima(~luz) * paso_horas,
        "sin_senal_mas_largo_h": _racha_maxima(~senal) * paso_horas,
        "elevacion_solar_max": round(float(sol_el.max()), 3),
        "elevacion_solar_media_con_luz": round(float(sol_el[luz].mean()), 3) if luz.any() else None,
        # Desde el inicio del período: cuánto falta para que se ponga el Sol o la Tierra
        "horas_hasta_puesta_sol": _horas_hasta(~luz, paso_horas) if luz[0] else 0.0,
        "horas_hasta_puesta_tierra": _horas_hasta(~senal, paso_horas) if senal[0] else 0.0,
        "muestras": n,
    }
    serie = {
        "margen_sol": np.round(margen_sol, 3),
        "margen_tierra": np.round(margen_tierra, 3),
        "fraccion_disco_solar": np.round(fraccion_sol, 3),
        "luz": luz,
        "senal": senal,
    }
    eventos = (_eventos(pos["tiempos"], luz, "salida_sol", "puesta_sol")
               + _eventos(pos["tiempos"], senal, "salida_tierra", "puesta_tierra"))
    eventos.sort(key=lambda e: e["indice"])
    return {"metricas": metricas, "serie": serie, "eventos": eventos}
