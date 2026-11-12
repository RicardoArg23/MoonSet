"""Rutas y constantes del proyecto. Se pueden cambiar con variables de entorno."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent

# Kernels de NASA/JPL (efemérides y orientación de la Luna). No van al repo.
KERNELS_DIR = Path(os.getenv("MOONSET_KERNELS", BACKEND_DIR / "kernels"))

# Datos del proyecto
DATA_DIR = Path(os.getenv("MOONSET_DATA", REPO_DIR / "data"))
SITIOS_JSON = DATA_DIR / "sitios.json"
PRECALCULADO_DIR = DATA_DIR / "precalculado"
RAW_DIR = DATA_DIR / "raw"  # DEM pesados, no van al repo

# DEM del polo sur (LOLA 5 m/píxel, 87°S a 90°S). Si no existe, se usa horizonte sin relieve.
DEM_POLO_SUR = Path(os.getenv("MOONSET_DEM_POLO_SUR", RAW_DIR / "ldem_87s_5mpp.tif"))
DEM_POLO_SUR_LAT_MAX = -87.0
# Multiplicador para pasar las alturas del archivo a metros (1.0 si ya vienen en metros).
DEM_ESCALA_ALTURA = float(os.getenv("MOONSET_DEM_ESCALA", "1.0"))

# Constantes físicas
RADIO_LUNA_M = 1_737_400.0  # radio de referencia de LOLA
RADIO_APARENTE_SOL_DEG = 0.267  # medio diámetro del disco solar visto desde la Luna

# Límites de las consultas, para que nadie pida un año con paso de 1 minuto
MAX_DIAS = 366
MAX_MUESTRAS = 10_000

# Orígenes permitidos para el frontend (Vite usa el 5173)
CORS_ORIGINS = os.getenv("MOONSET_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
