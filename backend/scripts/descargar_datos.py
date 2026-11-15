"""Descarga los datos que necesita el backend: los kernels de NASA/JPL (~18 MB) y el DEM de LOLA 80 m del
polo sur (LDEM_80S_80M.IMG, 115 MB).

Uso (desde la carpeta backend/):
    python scripts/descargar_datos.py            # kernels + DEM de 80 m
    python scripts/descargar_datos.py --sin-dem  # solo kernels

Destinos: config.KERNELS_DIR y config.DEM_80S (se cambian con MOONSET_KERNELS y MOONSET_DEM_80S). Lo que ya
está y tiene el tamaño correcto no se vuelve a bajar. El Dockerfile lo corre en el build, así la imagen lleva
todo y el contenedor no descarga nada al arrancar.

El DEM de 5 m (3,3 GB, opcional) se descarga a mano, ver el README del backend.
"""
import argparse
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.efemerides import _contexto  # noqa: E402

DEM_80S_URL = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG"
DEM_80S_BYTES = 115_520_000  # 7600 x 7600 muestras int16
INTENTOS = 4


def descargar(url: str, destino: Path, tamano: int) -> None:
    """Baja `url` a `destino` pasando por un .part, con reintentos; falla si el tamaño no es el esperado."""
    if destino.exists() and destino.stat().st_size == tamano:
        print(f"  ya está: {destino}")
        return
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    for intento in range(1, INTENTOS + 1):
        try:
            print(f"  bajando {url} (intento {intento}) ...", flush=True)
            pedido = urllib.request.Request(url, headers={"User-Agent": "moonset-descarga/1.0"})
            with urllib.request.urlopen(pedido, timeout=60) as r, open(parcial, "wb") as f:
                while bloque := r.read(1 << 20):
                    f.write(bloque)
            bajado = parcial.stat().st_size
            if bajado != tamano:
                raise IOError(f"se bajaron {bajado} bytes y se esperaban {tamano}")
            parcial.replace(destino)
            return
        except Exception as e:  # noqa: BLE001 — cualquier falla de red se reintenta
            print(f"  falló: {e}", flush=True)
            parcial.unlink(missing_ok=True)
            if intento == INTENTOS:
                raise SystemExit(f"No se pudo descargar {url}") from e
            time.sleep(5 * intento)


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--sin-dem", action="store_true", help="bajar solo los kernels")
    opciones = args.parse_args()

    print(f"Kernels en {config.KERNELS_DIR} ...")
    _contexto()  # skyfield baja lo que falte
    for f in sorted(config.KERNELS_DIR.iterdir()):
        print(f"  {f.name:40s} {f.stat().st_size / 1e6:6.1f} MB")

    if not opciones.sin_dem:
        print(f"\nDEM LOLA 80 m del polo sur en {config.DEM_80S} ...")
        descargar(DEM_80S_URL, config.DEM_80S, DEM_80S_BYTES)
        print(f"  {config.DEM_80S.name:40s} {config.DEM_80S.stat().st_size / 1e6:6.1f} MB")

    estado = "encontrado" if config.DEM_POLO_SUR.exists() else "no está (opcional; se usa el de 80 m)"
    print(f"\nDEM de 5 m: {config.DEM_POLO_SUR} -> {estado}")
