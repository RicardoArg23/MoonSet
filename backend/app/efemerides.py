"""Posición del Sol y la Tierra vistas desde un punto de la superficie lunar.

Usa skyfield con las efemérides DE421 de JPL y la orientación real de la Luna
(marco MOON_ME, que incluye la libración). Es el mismo marco que usan los DEM de LOLA.
"""
from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
from skyfield.api import Loader
from skyfield.planetarylib import PlanetaryConstants

from . import config

KERNEL_EFEMERIDES = "de421.bsp"
KERNELS_LUNA = ("moon_080317.tf", "pck00008.tpc", "moon_pa_de421_1900-2050.bpc")


@lru_cache(maxsize=1)
def _contexto():
    """Carga los kernels una sola vez (tarda ~1 s). Si faltan, skyfield los descarga."""
    config.KERNELS_DIR.mkdir(parents=True, exist_ok=True)
    load = Loader(str(config.KERNELS_DIR), verbose=False)
    ts = load.timescale(builtin=True)
    eph = load(KERNEL_EFEMERIDES)
    pc = PlanetaryConstants()
    pc.read_text(load(KERNELS_LUNA[0]))
    pc.read_text(load(KERNELS_LUNA[1]))
    pc.read_binary(load(KERNELS_LUNA[2]))
    marco = pc.build_frame_named("MOON_ME_DE421")
    return ts, eph, pc, marco


def _a_utc(fecha: datetime) -> datetime:
    return fecha.replace(tzinfo=timezone.utc) if fecha.tzinfo is None else fecha.astimezone(timezone.utc)


def _subpunto(vectores: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Latitud y longitud del punto de la Luna que tiene al objeto justo arriba (en el cenit)."""
    v = vectores / np.linalg.norm(vectores, axis=0)
    lat = np.degrees(np.arcsin(v[2]))
    lon = np.degrees(np.arctan2(v[1], v[0]))
    return lat, lon


def calcular_posiciones(lat: float, lon: float, inicio: datetime, dias: float, paso_horas: float) -> dict:
    """Azimut y elevación del Sol y la Tierra desde (lat, lon), cada `paso_horas`.

    - Azimut: 0° = norte, 90° = este (sentido horario, como una brújula).
    - Elevación: grados sobre el horizonte matemático (plano), sin relieve.
    - Longitud en grados este; se aceptan -180..360.
    """
    ts, eph, pc, marco = _contexto()
    lat = float(np.clip(lat, -89.9999, 89.9999))  # en el polo exacto el azimut no está definido

    inicio = _a_utc(inicio)
    horas = np.arange(0.0, dias * 24.0, paso_horas)
    t = ts.utc(inicio.year, inicio.month, inicio.day, inicio.hour + horas, inicio.minute, inicio.second)

    luna, sol, tierra = eph["moon"], eph["sun"], eph["earth"]
    sitio = luna + pc.build_latlon_degrees(marco, lat, lon)
    desde_sitio = sitio.at(t)

    sol_alt, sol_az, _ = desde_sitio.observe(sol).apparent().altaz()
    tie_alt, tie_az, tie_dist = desde_sitio.observe(tierra).apparent().altaz()

    # Puntos subsolar y subterrestre: útiles para iluminar el globo 3D en el frontend
    sub_sol = _subpunto((sol - luna).at(t).frame_xyz(marco).au)
    sub_tie = _subpunto((tierra - luna).at(t).frame_xyz(marco).au)

    return {
        "tiempos": list(t.utc_strftime("%Y-%m-%dT%H:%M:%SZ")),
        "sol": {"elevacion": sol_alt.degrees, "azimut": sol_az.degrees},
        "tierra": {"elevacion": tie_alt.degrees, "azimut": tie_az.degrees, "distancia_km": tie_dist.km},
        "subsolar": {"lat": sub_sol[0], "lon": sub_sol[1]},
        "subterrestre": {"lat": sub_tie[0], "lon": sub_tie[1]},
    }
