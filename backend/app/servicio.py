"""Une efemérides + horizonte + métricas en una respuesta lista para el frontend."""
from __future__ import annotations

from datetime import datetime

import numpy as np

from . import config, metricas
from .efemerides import calcular_posiciones
from .horizonte import obtener_horizonte


class ConsultaInvalida(ValueError):
    pass


def _lista(arr, decimales: int = 3) -> list:
    arr = np.asarray(arr)
    if arr.dtype == bool:
        return arr.astype(int).tolist()  # 0/1 ocupa menos que true/false
    return np.round(arr, decimales).tolist()


def evaluar(lat: float, lon: float, inicio: datetime, dias: float, paso_horas: float,
            altura_m: float = 2.0, sitio: dict | None = None) -> dict:
    if not -90 <= lat <= 90:
        raise ConsultaInvalida("La latitud tiene que estar entre -90 y 90.")
    if not 0 < dias <= config.MAX_DIAS:
        raise ConsultaInvalida(f"Los días tienen que estar entre 0 y {config.MAX_DIAS}.")
    if dias * 24 / paso_horas > config.MAX_MUESTRAS:
        raise ConsultaInvalida(
            f"Demasiadas muestras ({int(dias * 24 / paso_horas)}). Subí el paso o bajá los días "
            f"(máximo {config.MAX_MUESTRAS}).")

    pos = calcular_posiciones(lat, lon, inicio, dias, paso_horas)
    horizonte, fuente = obtener_horizonte(lat, lon, altura_m)
    res = metricas.calcular(pos, horizonte, paso_horas)

    return {
        "sitio": sitio or {"id": "personalizado", "nombre": f"Coordenadas {lat:.2f}°, {lon:.2f}°E", "lat": lat, "lon": lon},
        "parametros": {"inicio": pos["tiempos"][0] if pos["tiempos"] else None, "dias": dias,
                       "paso_horas": paso_horas, "altura_m": altura_m},
        "horizonte": {"fuente": fuente, "grados": _lista(horizonte)},
        "metricas": res["metricas"],
        "eventos": res["eventos"],
        "serie": {
            "tiempos": pos["tiempos"],
            "sol_elevacion": _lista(pos["sol"]["elevacion"]),
            "sol_azimut": _lista(pos["sol"]["azimut"], 2),
            "tierra_elevacion": _lista(pos["tierra"]["elevacion"]),
            "tierra_azimut": _lista(pos["tierra"]["azimut"], 2),
            "margen_sol": _lista(res["serie"]["margen_sol"]),
            "margen_tierra": _lista(res["serie"]["margen_tierra"]),
            "fraccion_disco_solar": _lista(res["serie"]["fraccion_disco_solar"]),
            "luz": _lista(res["serie"]["luz"]),
            "senal": _lista(res["serie"]["senal"]),
            "subsolar_lat": _lista(pos["subsolar"]["lat"]),
            "subsolar_lon": _lista(pos["subsolar"]["lon"], 2),
            "subterrestre_lat": _lista(pos["subterrestre"]["lat"]),
            "subterrestre_lon": _lista(pos["subterrestre"]["lon"], 2),
        },
    }
