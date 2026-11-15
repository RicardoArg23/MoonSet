"""Precalentar el backend al arrancar: lo que el primer pedido pagaría si no.

- los kernels de efemérides (skyfield),
- scipy.ndimage, que usa el horizonte con relieve,
- el DEM de LOLA 80 m de data/raw (231 MB en memoria), si está.

Si el DEM no está, el backend arranca igual y esos sitios usan el horizonte sin relieve.
"""
from __future__ import annotations

import logging
import time

from . import config

log = logging.getLogger("uvicorn.error")  # el logger que uvicorn ya muestra en la consola


def precalentar() -> dict[str, float]:
    """Carga todo y devuelve cuánto tardó cada parte, en segundos."""
    tiempos: dict[str, float] = {}

    t0 = time.perf_counter()
    from .efemerides import _contexto
    _contexto()
    tiempos["kernels"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    import scipy.ndimage  # noqa: F401
    tiempos["scipy"] = time.perf_counter() - t0

    if config.DEM_80S.exists():
        t0 = time.perf_counter()
        from .horizonte import _cargar_img_lola
        _cargar_img_lola(str(config.DEM_80S), config.DEM_80S_ESCALA)  # mismo cache que usan los pedidos
        tiempos["dem_80s"] = time.perf_counter() - t0
    else:
        log.info("MoonSet: no está %s; los sitios polares usan el horizonte sin relieve.", config.DEM_80S)

    detalle = ", ".join(f"{k} {v:.2f} s" for k, v in tiempos.items())
    log.info("MoonSet precalentado en %.2f s (%s)", sum(tiempos.values()), detalle)
    return tiempos
