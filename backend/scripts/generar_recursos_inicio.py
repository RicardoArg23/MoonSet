"""Genera las imágenes de la pantalla de inicio: la Tierra que se ve a lo lejos y el logo con transparencia.

Tierra: Blue Marble Next Generation con topografía y batimetría, julio de 2004 (NASA Earth Observatory).
  Equirectangular, longitud -180..180, 5400 x 2700 px. Se reduce a 1024 x 512: en pantalla mide unos 100 px.
  El original queda en data/raw/ (fuera de git).
Logo: logo-MoonSet/monseet-imagotipo.jpg (blanco sobre negro). Se recorta y la luminancia pasa a ser la transparencia.

Uso:  python backend/scripts/generar_recursos_inicio.py
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
URL_TIERRA = ("https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/"
              "bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg")
CRUDO_TIERRA = RAIZ / "data" / "raw" / "tierra_bmng_200407.jpg"
SALIDA_TIERRA = RAIZ / "frontend" / "public" / "texturas" / "tierra_bmng_1k.jpg"
LOGO = RAIZ / "logo-MoonSet" / "monseet-imagotipo.jpg"
SALIDA_LOGO = RAIZ / "frontend" / "public" / "marca" / "moonset-imagotipo.png"
ALTO_LOGO = 184  # px: el logo se muestra a 46 px de alto; queda nítido hasta 4x
UMBRAL_RECORTE = 40  # luminancia por debajo de la cual el fondo del logo se considera negro


def generar_tierra() -> None:
    if not CRUDO_TIERRA.exists():
        CRUDO_TIERRA.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(URL_TIERRA, timeout=120) as respuesta:
            CRUDO_TIERRA.write_bytes(respuesta.read())
    imagen = Image.open(CRUDO_TIERRA).convert("RGB")
    if imagen.width != 2 * imagen.height:
        raise ValueError(f"{CRUDO_TIERRA} no es equirectangular 2:1 ({imagen.size})")
    SALIDA_TIERRA.parent.mkdir(parents=True, exist_ok=True)
    imagen.resize((1024, 512), Image.LANCZOS).save(SALIDA_TIERRA, "JPEG", quality=84, optimize=True)
    print(f"{SALIDA_TIERRA.relative_to(RAIZ)}: {SALIDA_TIERRA.stat().st_size / 1024:.0f} KB")


def generar_logo() -> None:
    if not LOGO.exists():
        raise FileNotFoundError(f"Falta {LOGO}")
    gris = Image.open(LOGO).convert("L")
    caja = gris.point(lambda p: 255 if p > UMBRAL_RECORTE else 0).getbbox()
    if caja is None:
        raise ValueError(f"{LOGO} no tiene nada más claro que {UMBRAL_RECORTE}")
    gris = gris.crop(caja)
    gris = gris.resize((round(gris.width * ALTO_LOGO / gris.height), ALTO_LOGO), Image.LANCZOS)
    logo = Image.new("RGBA", gris.size, (255, 255, 255, 0))
    logo.putalpha(gris)
    SALIDA_LOGO.parent.mkdir(parents=True, exist_ok=True)
    logo.save(SALIDA_LOGO, "PNG", optimize=True)
    print(f"{SALIDA_LOGO.relative_to(RAIZ)}: {gris.width} x {gris.height} px, {SALIDA_LOGO.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    generar_tierra()
    generar_logo()
