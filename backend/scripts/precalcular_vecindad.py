"""Precalcula el horizonte de una grilla de puntos alrededor de cada sitio polar, para mostrar
cuánto cambia la misión al moverse unos cientos de metros.

Por cada sitio al sur de --lat-max guarda data/anual/vecindad-<id>.json con una grilla de n x n
puntos separados --paso metros (filas de norte a sur, columnas de oeste a este), y por punto:
- la altura del terreno (m, relativa al radio de referencia),
- la máscara de horizonte (360 valores, grados).

El frontend combina cada máscara con la posición del Sol y la Tierra del sitio central. Es una
aproximación: a 2 km la dirección de los astros cambia menos de 0,07°.

Uso (desde la carpeta backend/):
    python scripts/precalcular_vecindad.py --n 11 --paso 400
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.horizonte import _cargar_img_lola, _polar_sur_xy, horizonte_img_lola  # noqa: E402
from app.sitios import cargar_sitios  # noqa: E402

R = config.RADIO_LUNA_M


def destino(lat: float, lon: float, este_m: float, norte_m: float) -> tuple[float, float]:
    """Lat/lon del punto desplazado (este, norte) metros desde el sitio, sobre la esfera."""
    dist = float(np.hypot(este_m, norte_m))
    if dist == 0:
        return lat, lon
    rumbo = np.arctan2(este_m, norte_m)
    f1, l1, d = np.radians(lat), np.radians(lon), dist / R
    f2 = np.arcsin(np.sin(f1) * np.cos(d) + np.cos(f1) * np.sin(d) * np.cos(rumbo))
    l2 = l1 + np.arctan2(np.sin(rumbo) * np.sin(d) * np.cos(f1), np.cos(d) - np.sin(f1) * np.sin(f2))
    return float(np.degrees(f2)), float(np.degrees(l2))


def altura_terreno(lat: float, lon: float) -> float:
    dem = _cargar_img_lola(str(config.DEM_80S), config.DEM_80S_ESCALA)
    n = dem.shape[0]
    x, y = _polar_sur_xy(np.array([lat]), np.array([lon]))
    fila = int(round(n / 2.0 - 0.5 - y[0] / config.DEM_80S_PASO_M))
    col = int(round(x[0] / config.DEM_80S_PASO_M + n / 2.0 - 0.5))
    return float(dem[fila, col]) if 0 <= fila < n and 0 <= col < n else float("nan")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=11, help="Puntos por lado (impar)")
    ap.add_argument("--paso", type=float, default=400.0, help="Separación entre puntos, en metros")
    ap.add_argument("--lat-max", type=float, default=-85.0, help="Solo sitios al sur de esta latitud")
    ap.add_argument("--altura", type=float, default=2.0)
    args = ap.parse_args()

    if not config.DEM_80S.exists():
        sys.exit(f"Falta el DEM: {config.DEM_80S}")
    destino_dir = config.DATA_DIR / "anual"
    medio = args.n // 2
    for sitio in cargar_sitios():
        if sitio["lat"] > args.lat_max:
            continue
        t0 = time.time()
        alturas, horizontes = [], []
        for fila in range(args.n):  # norte -> sur
            for col in range(args.n):  # oeste -> este
                lat, lon = destino(sitio["lat"], sitio["lon"], (col - medio) * args.paso, (medio - fila) * args.paso)
                alturas.append(round(altura_terreno(lat, lon), 1))
                horizontes.append(np.round(horizonte_img_lola(config.DEM_80S, lat, lon, args.altura), 2).tolist())
        salida = {"sitio_id": sitio["id"], "n": args.n, "paso_m": args.paso, "altura_m": args.altura,
                  "fuente": "dem_lola_80s_80m", "alturas": alturas, "horizontes": horizontes}
        archivo = destino_dir / f"vecindad-{sitio['id']}.json"
        archivo.write_text(json.dumps(salida, separators=(",", ":")), encoding="utf-8")
        print(f"{sitio['id']:20s} {args.n}x{args.n} puntos  {archivo.stat().st_size / 1e3:5.0f} kB  ({time.time() - t0:.0f} s)")
