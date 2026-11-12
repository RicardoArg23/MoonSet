"""Descarga los kernels de NASA/JPL que necesita el backend (~20 MB) en backend/kernels/.

Uso (desde la carpeta backend/):
    python scripts/descargar_datos.py

El DEM del polo sur (3,3 GB) se descarga a mano, ver el README del backend.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.efemerides import _contexto  # noqa: E402

if __name__ == "__main__":
    print(f"Descargando kernels en {config.KERNELS_DIR} ...")
    _contexto()
    for f in sorted(config.KERNELS_DIR.iterdir()):
        print(f"  {f.name:40s} {f.stat().st_size / 1e6:6.1f} MB")
    estado = "encontrado" if config.DEM_POLO_SUR.exists() else "NO encontrado (se usa horizonte sin relieve)"
    print(f"\nDEM del polo sur: {config.DEM_POLO_SUR} -> {estado}")
