"""Genera la imagen de fondo del mapa 2D del polo sur (vista Mapa del frontend).

Proyección: estereográfica polar sur esférica, la misma que usa backend/app/horizonte.py
(`_polar_sur_xy`): centro en el polo, lon 0° hacia arriba y lon 90° E hacia la derecha.
Así los sitios del mapa caen exactamente donde los calcula el backend.

Dos fuentes posibles:
- dem      relieve sombreado a partir del DEM de LOLA de 80 m (data/raw/LDEM_80S_80M.IMG). Recomendada.
- textura  respaldo de baja resolución: reproyecta el casquete polar de la textura LROC 4k del globo.
- auto     (por defecto) usa el DEM si está; si no, la textura.

Guarda data/mapa/polo_sur.jpg y data/mapa/polo_sur.json (metadatos que lee el frontend).

Uso (desde la carpeta backend/):
    python scripts/generar_mapa_polo.py
    python scripts/generar_mapa_polo.py --fuente dem --lado 2048
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, uniform_filter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402

R = config.RADIO_LUNA_M
TEXTURA = config.REPO_DIR / "frontend" / "public" / "texturas" / "luna_lroc_4k.jpg"
FONDO = 0  # negro fuera del círculo, igual que el fondo de la interfaz


def radio_de_latitud(lat: float) -> float:
    """Distancia al polo (m) en la estereográfica polar sur para una latitud."""
    return 2.0 * R * np.tan(np.pi / 4.0 + np.radians(lat) / 2.0)


def grilla(lado: int, extension_m: float):
    """Coordenadas x, y (m) del centro de cada píxel de la imagen de salida. Fila 0 = arriba (+y)."""
    paso = 2.0 * extension_m / lado
    centros = -extension_m + (np.arange(lado) + 0.5) * paso
    x = centros[None, :].repeat(lado, axis=0)
    y = -centros[:, None].repeat(lado, axis=1)
    return x, y, paso


def a_latlon(x: np.ndarray, y: np.ndarray):
    """Inversa de la estereográfica polar sur: (x, y) en metros -> lat, lon en grados (lon -180..180)."""
    r = np.hypot(x, y)
    lat = np.degrees(2.0 * np.arctan(r / (2.0 * R)) - np.pi / 2.0)
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


def desde_dem(lado: int, extension_m: float) -> np.ndarray:
    from app.horizonte import _cargar_img_lola

    dem = _cargar_img_lola(str(config.DEM_80S), config.DEM_80S_ESCALA)
    n = dem.shape[0]
    paso_dem = config.DEM_80S_PASO_M
    x, y, paso = grilla(lado, extension_m)

    # Suavizar antes de reducir para evitar aliasing (cada píxel de salida abarca varios del DEM)
    factor = max(1, int(round(paso / paso_dem)))
    if factor > 1:
        dem = uniform_filter(np.nan_to_num(dem, nan=float(np.nanmean(dem))), size=factor)
    col = x / paso_dem + n / 2.0 - 0.5
    fila = n / 2.0 - 0.5 - y / paso_dem
    z = map_coordinates(dem, [fila, col], order=1, cval=np.nan, mode="constant")

    # Relieve sombreado clásico: luz desde el noroeste de la imagen, 35° de altura.
    # No es la iluminación real (en el polo el Sol está a 1-2°): sirve para leer el terreno.
    zz = np.nan_to_num(z, nan=float(np.nanmean(z)))
    dzdy, dzdx = np.gradient(zz, paso)  # filas crecen hacia abajo (-y)
    dzdy = -dzdy
    az, alt = np.radians(315.0), np.radians(35.0)
    lx, ly, lz = np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt)
    norma = np.sqrt(dzdx**2 + dzdy**2 + 1.0)
    sombra = np.clip((-dzdx * lx - dzdy * ly + lz) / norma, 0, 1)

    # Un poco de color por altura para distinguir cráteres profundos de las crestas
    lo, hi = np.nanpercentile(z, [2, 98])
    rel = np.clip((zz - lo) / (hi - lo), 0, 1)
    gris = 0.12 + 0.78 * sombra * (0.55 + 0.45 * rel)
    rgb = np.stack([gris * 1.0, gris * 0.97, gris * 0.92], axis=-1)
    rgb[np.isnan(z)] = FONDO / 255.0
    return rgb


def desde_textura(lado: int, extension_m: float) -> np.ndarray:
    tex = np.asarray(Image.open(TEXTURA).convert("RGB"), dtype="float32") / 255.0
    alto, ancho, _ = tex.shape
    x, y, _ = grilla(lado, extension_m)
    lat, lon = a_latlon(x, y)
    # Textura equirectangular centrada en lon 0° (igual que el globo de Globo.jsx)
    u = (lon + 180.0) / 360.0 * ancho - 0.5
    v = (90.0 - lat) / 180.0 * alto - 0.5
    canales = np.stack([map_coordinates(tex[..., c], [v, u], order=1, mode="wrap") for c in range(3)], axis=-1)
    # La textura es de albedo y sale muy pareja: se estira el contraste para que se lean los cráteres
    gris = canales.mean(axis=-1)
    dentro = np.hypot(x, y) <= extension_m
    lo, hi = np.percentile(gris[dentro], [1, 99])
    g = np.clip((gris - lo) / (hi - lo), 0, 1) ** 1.15
    g = 0.10 + 0.72 * g
    return np.stack([g * 1.0, g * 0.97, g * 0.92], axis=-1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fuente", choices=["auto", "dem", "textura"], default="auto")
    ap.add_argument("--lado", type=int, default=None, help="Píxeles por lado (por defecto 2048 con DEM, 1024 con textura)")
    ap.add_argument("--lat-limite", type=float, default=config.DEM_80S_LAT_MAX, help="Borde del mapa (por defecto -80)")
    args = ap.parse_args()

    fuente = args.fuente
    if fuente == "auto":
        fuente = "dem" if config.DEM_80S.exists() else "textura"
    if fuente == "dem" and not config.DEM_80S.exists():
        sys.exit(f"Falta el DEM: {config.DEM_80S}. Ver README para descargarlo.")
    lado = args.lado or (2048 if fuente == "dem" else 1024)
    extension = float(radio_de_latitud(args.lat_limite))

    rgb = desde_dem(lado, extension) if fuente == "dem" else desde_textura(lado, extension)

    # Fuera del círculo de la latitud límite, fondo liso
    x, y, _ = grilla(lado, extension)
    rgb[np.hypot(x, y) > extension] = FONDO / 255.0

    destino = config.DATA_DIR / "mapa"
    destino.mkdir(parents=True, exist_ok=True)
    imagen = destino / "polo_sur.jpg"
    Image.fromarray((np.clip(rgb, 0, 1) * 255).astype("uint8")).save(imagen, quality=86, optimize=True)

    meta = {
        "imagen": imagen.name,
        "proyeccion": "estereografica_polar_sur",
        "nota_proyeccion": "x = r·sin(lon), y = r·cos(lon), r = 2R·tan(45° + lat/2); lon 0° arriba, lon 90° E a la derecha",
        "radio_luna_m": R,
        "lat_limite": args.lat_limite,
        "extension_m": round(extension, 1),
        "lado_px": lado,
        "fuente": "dem_lola_80s_80m" if fuente == "dem" else "textura_lroc_4k",
        "descripcion": ("Relieve sombreado del DEM de LOLA a 80 m (luz cartográfica, no la iluminación real)"
                        if fuente == "dem" else
                        "Respaldo de baja resolución: casquete polar de la textura LROC 4k reproyectado"),
    }
    (destino / "polo_sur.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {imagen} ({imagen.stat().st_size / 1e6:.1f} MB, {lado}x{lado}, fuente {meta['fuente']})")
