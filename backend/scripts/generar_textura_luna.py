"""Genera la textura local del globo a partir del mismo mosaico que usan las teselas en línea.

Fuente: NASA Moon Trek (WMTS), capa LRO_WAC_Mosaic_Global_303ppd_v02 (mosaico global LROC WAC, ~100 m/px).
Proyección equirectangular, longitud -180..180 de izquierda a derecha, latitud 90..-90 de arriba abajo.
Nivel 3: 16 x 8 teselas de 256 px -> 4096 x 2048 px (~2,7 km por píxel en el ecuador).

El globo muestra esta imagen mientras cargan las teselas finas y cuando no hay internet, así se ve la
misma Luna a cualquier distancia. Las teselas bajadas quedan en data/raw/teselas_wac/ (fuera de git).

Uso:  python backend/scripts/generar_textura_luna.py
"""
from __future__ import annotations

import io
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
CRUDO = RAIZ / "data" / "raw" / "teselas_wac"
SALIDA = RAIZ / "frontend" / "public" / "texturas" / "luna_wac_4k.jpg"
URL = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{fila}/{col}.jpg"
NIVEL = 3
LADO = 256


def bajar(fila: int, col: int) -> Image.Image:
    archivo = CRUDO / f"{NIVEL}_{fila}_{col}.jpg"
    if not archivo.exists():
        pedido = urllib.request.Request(URL.format(z=NIVEL, fila=fila, col=col), headers={"User-Agent": "generic-client"})
        with urllib.request.urlopen(pedido, timeout=60) as respuesta:
            archivo.write_bytes(respuesta.read())
    imagen = Image.open(io.BytesIO(archivo.read_bytes())).convert("L")
    if imagen.size != (LADO, LADO):
        raise ValueError(f"Tesela {NIVEL}/{fila}/{col}: tamaño inesperado {imagen.size}")
    return imagen


def main() -> None:
    CRUDO.mkdir(parents=True, exist_ok=True)
    filas, cols = 2**NIVEL, 2 ** (NIVEL + 1)
    posiciones = [(fila, col) for fila in range(filas) for col in range(cols)]
    with ThreadPoolExecutor(max_workers=6) as grupo:
        teselas = list(grupo.map(lambda p: bajar(*p), posiciones))
    mosaico = Image.new("L", (cols * LADO, filas * LADO))
    for (fila, col), tesela in zip(posiciones, teselas):
        mosaico.paste(tesela, (col * LADO, fila * LADO))
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    mosaico.save(SALIDA, quality=90)
    print(f"{SALIDA.relative_to(RAIZ)}: {mosaico.size[0]} x {mosaico.size[1]} px, {SALIDA.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
