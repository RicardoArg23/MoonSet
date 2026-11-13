"""Máscara de horizonte: para cada azimut (0..359°), qué tan alto se ve el horizonte desde un sitio.

Dos fuentes:
- `horizonte_esfera`: sin relieve. El horizonte queda un poco debajo de 0° porque la Luna es
  redonda ("borde de la esfera"). Sirve para cualquier sitio y como respaldo.
- `horizonte_dem`: con el relieve real de un DEM de LOLA (GeoTIFF). Traza 360 "rayos" desde el
  sitio y se queda, en cada dirección, con el punto del terreno que se ve más alto.

La Luna no tiene atmósfera, así que no hay refracción: no se corrige nada por eso.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np

from . import config

R = config.RADIO_LUNA_M
AZIMUTS = np.arange(360.0)

# Niveles de detalle: cerca del sitio se usa la resolución completa y lejos una más gruesa.
# (radio en metros, factor de reducción de resolución). Con 5 m/píxel: 5 m, 30 m y 150 m.
NIVELES = ((5_000.0, 1), (30_000.0, 6), (None, 30))


def horizonte_esfera(altura_m: float = 2.0) -> np.ndarray:
    """Horizonte sin relieve para un observador a `altura_m` sobre el suelo: -sqrt(2a/R) en grados."""
    caida = np.degrees(np.sqrt(2.0 * max(altura_m, 0.0) / R))
    return np.full(360, -caida)


def _distancias(paso_m: float, alcance_m: float) -> np.ndarray:
    """Distancias a muestrear en cada rayo: finas cerca, gruesas lejos."""
    tramos = [
        np.arange(paso_m, min(2_000.0, alcance_m), paso_m),
        np.arange(2_000.0, min(20_000.0, alcance_m), 4 * paso_m),
        np.arange(20_000.0, alcance_m, 20 * paso_m),
    ]
    return np.concatenate([t for t in tramos if t.size])


def _destinos(lat: float, lon: float, dist_m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Lat/lon de los puntos a `dist_m` del sitio en cada uno de los 360 azimuts (sobre la esfera).

    Devuelve matrices de forma (360, n_distancias).
    """
    f1, l1 = np.radians(lat), np.radians(lon)
    th = np.radians(AZIMUTS)[:, None]
    d = (dist_m / R)[None, :]
    f2 = np.arcsin(np.sin(f1) * np.cos(d) + np.cos(f1) * np.sin(d) * np.cos(th))
    l2 = l1 + np.arctan2(np.sin(th) * np.sin(d) * np.cos(f1), np.cos(d) - np.sin(f1) * np.sin(f2))
    return np.degrees(f2), np.degrees(l2)


def _elevacion_angular(h0: float, h: np.ndarray, dist_m: np.ndarray) -> np.ndarray:
    """Ángulo (°) con que se ve un punto del terreno, con la curvatura de la Luna incluida.

    Observador a radio R+h0 y punto a radio R+h, separados por el ángulo central d/R.
    """
    delta = dist_m / R
    r_obs, r_pto = R + h0, R + h
    return np.degrees(np.arctan2(r_pto * np.cos(delta) - r_obs, r_pto * np.sin(delta)))


def horizonte_dem(ruta_dem: str | Path, lat: float, lon: float, altura_m: float = 2.0,
                  alcance_km: float = 150.0, escala_altura: float | None = None) -> np.ndarray:
    """Máscara de horizonte a partir de un DEM GeoTIFF (por ejemplo LOLA 5 m/píxel del polo sur).

    Lee solo ventanas alrededor del sitio, en tres niveles de resolución, así que funciona con el
    mosaico completo de 3 GB sin cargarlo entero en memoria.
    """
    import rasterio
    from affine import Affine
    from pyproj import CRS, Transformer
    from rasterio.enums import Resampling
    from rasterio.windows import Window, from_bounds
    from scipy.ndimage import map_coordinates

    escala = config.DEM_ESCALA_ALTURA if escala_altura is None else escala_altura
    alcance_m = alcance_km * 1_000.0

    with rasterio.open(ruta_dem) as ds:
        crs_dem = CRS.from_user_input(ds.crs)
        crs_geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
        a_dem = Transformer.from_crs(crs_geo, crs_dem, always_xy=True)
        paso_m = abs(ds.transform.a)

        x0, y0 = a_dem.transform(lon, lat)
        dist = _distancias(paso_m, alcance_m)
        lat_p, lon_p = _destinos(lat, lon, dist)
        xs, ys = a_dem.transform(lon_p, lat_p)

        def leer_nivel(radio_m: float, factor: int):
            ventana = from_bounds(x0 - radio_m, y0 - radio_m, x0 + radio_m, y0 + radio_m, ds.transform)
            ventana = ventana.round_offsets().round_lengths()
            ventana = ventana.intersection(Window(0, 0, ds.width, ds.height))
            alto = max(1, int(np.ceil(ventana.height / factor)))
            ancho = max(1, int(np.ceil(ventana.width / factor)))
            datos = ds.read(1, window=ventana, out_shape=(alto, ancho),
                            resampling=Resampling.average, masked=True)
            datos = datos.astype("float64").filled(np.nan) * escala
            transf = ds.window_transform(ventana) @ Affine.scale(ventana.width / ancho, ventana.height / alto)
            return datos, ~transf

        def muestrear(datos, inversa, x, y):
            col, fila = inversa @ (x, y)
            # bilineal; los centros de píxel están en +0.5
            return map_coordinates(datos, [np.asarray(fila) - 0.5, np.asarray(col) - 0.5],
                                   order=1, cval=np.nan, mode="constant")

        alturas = np.full(xs.shape, np.nan)
        h0 = np.nan
        radio_previo = 0.0
        for radio, factor in NIVELES:
            radio = alcance_m if radio is None else min(radio, alcance_m)
            datos, inversa = leer_nivel(radio, factor)
            if np.isnan(h0):
                h0 = float(muestrear(datos, inversa, np.array([x0]), np.array([y0]))[0])
            en_tramo = (dist > radio_previo) & (dist <= radio)
            if en_tramo.any():
                alturas[:, en_tramo] = muestrear(datos, inversa, xs[:, en_tramo], ys[:, en_tramo])
            radio_previo = radio
            if radio >= alcance_m:
                break

    base = horizonte_esfera(altura_m)
    if np.isnan(h0):
        return base  # el sitio está fuera del DEM

    angulos = _elevacion_angular(h0 + altura_m, alturas, dist[None, :])
    with np.errstate(all="ignore"):
        maximo = np.nanmax(np.where(np.isnan(angulos), -np.inf, angulos), axis=1)
    return np.maximum(maximo, base)  # nunca por debajo del borde de la esfera


@lru_cache(maxsize=2)
def _cargar_img_lola(ruta: str, escala: float) -> np.ndarray:
    """Carga un LDEM polar de LOLA en formato PDS .IMG (cuadrado, int16 LSB) como alturas en metros."""
    crudo = np.fromfile(ruta, dtype="<i2")
    n = int(round(np.sqrt(crudo.size)))
    if n * n != crudo.size:
        raise ValueError(f"{ruta}: se esperaba una imagen cuadrada de int16, hay {crudo.size} muestras.")
    return crudo.reshape(n, n).astype("float32") * escala


def _polar_sur_xy(lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Estereográfica polar sur esférica de LOLA (centro lat -90°, lon 0°): metros desde el polo.

    Para lon 0° el punto queda sobre +y; el este (lon 90°) es +x.
    """
    r = 2.0 * R * np.tan(np.pi / 4.0 + np.radians(lat) / 2.0)
    lam = np.radians(lon)
    return r * np.sin(lam), r * np.cos(lam)


def horizonte_img_lola(ruta_img: str | Path, lat: float, lon: float, altura_m: float = 2.0,
                       alcance_km: float = 250.0, paso_m: float | None = None,
                       escala: float | None = None) -> np.ndarray:
    """Máscara de horizonte desde un LDEM polar de LOLA en .IMG (por ejemplo LDEM_80S_80M).

    No necesita rasterio ni pyproj. Los puntos que caen fuera del DEM se ignoran, así que un sitio
    cerca del borde (80°S) tiene relieve real solo hacia el polo.
    """
    from scipy.ndimage import map_coordinates

    paso = config.DEM_80S_PASO_M if paso_m is None else paso_m
    dem = _cargar_img_lola(str(ruta_img), config.DEM_80S_ESCALA if escala is None else escala)
    n = dem.shape[0]

    def muestrear(la, lo):
        x, y = _polar_sur_xy(la, lo)
        col = x / paso + n / 2.0 - 0.5  # píxel-registrado: el centro del píxel 0 está a medio paso
        fila = n / 2.0 - 0.5 - y / paso
        return map_coordinates(dem, [fila, col], order=1, cval=np.nan, mode="constant")

    h0 = float(muestrear(np.array([lat]), np.array([lon]))[0])
    base = horizonte_esfera(altura_m)
    if np.isnan(h0):
        return base  # el sitio está fuera del DEM

    alcance_m = alcance_km * 1_000.0
    dist = np.concatenate([
        np.arange(paso, 5_000.0, paso),
        np.arange(5_000.0, 30_000.0, 2 * paso),
        np.arange(30_000.0, alcance_m, 4 * paso),
    ])
    lat_p, lon_p = _destinos(lat, lon, dist)
    alturas = muestrear(lat_p, lon_p)
    angulos = _elevacion_angular(h0 + altura_m, alturas, dist[None, :])
    validos = ~np.isnan(angulos)
    with np.errstate(all="ignore"):
        maximo = np.max(np.where(validos, angulos, -np.inf), axis=1)
    # Desde una cresta el horizonte real queda por debajo del de la esfera lisa: ahí manda el relieve.
    # Solo se recurre a la esfera en las direcciones donde el rayo se sale del DEM.
    completo = validos.mean(axis=1) > 0.98
    return np.where(completo, maximo, np.maximum(maximo, base))


@lru_cache(maxsize=128)
def _horizonte_cache(lat: float, lon: float, altura_m: float) -> tuple[tuple[float, ...], str]:
    if lat <= config.DEM_POLO_SUR_LAT_MAX and config.DEM_POLO_SUR.exists():
        return tuple(horizonte_dem(config.DEM_POLO_SUR, lat, lon, altura_m)), "dem_lola_polo_sur"
    if lat <= config.DEM_80S_LAT_MAX and config.DEM_80S.exists():
        return tuple(horizonte_img_lola(config.DEM_80S, lat, lon, altura_m)), "dem_lola_80s_80m"
    # TODO: sumar un DEM global (más grueso) para sitios fuera del polo sur
    return tuple(horizonte_esfera(altura_m)), "esfera"


def obtener_horizonte(lat: float, lon: float, altura_m: float = 2.0) -> tuple[np.ndarray, str]:
    """Elige la mejor fuente disponible para el sitio. Devuelve (360 alturas en grados, fuente)."""
    valores, fuente = _horizonte_cache(round(lat, 6), round(lon, 6), round(altura_m, 3))
    return np.array(valores), fuente


def altura_en_azimut(horizonte: np.ndarray, azimut: np.ndarray) -> np.ndarray:
    """Altura del horizonte en cualquier azimut, interpolando entre los 360 valores."""
    return np.interp(np.mod(azimut, 360.0), np.arange(361.0), np.append(horizonte, horizonte[0]))
