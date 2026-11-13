"""Precalcula un año de posiciones del Sol y la Tierra por sitio, para que el frontend calcule
las métricas en el navegador sin backend.

Por cada sitio de data/sitios.json guarda data/anual/<id>.json con:
- la máscara de horizonte (360 valores, grados),
- elevación y azimut del Sol y de la Tierra, cada hora.

La luz, la señal, las noches y la viabilidad de una misión NO se guardan: dependen de los
parámetros de la misión y el frontend las deriva de estas series (frontend/src/v2/calculo.js).

Uso (desde la carpeta backend/):
    python scripts/precalcular_anual.py --inicio 2027-01-01 --dias 400
"""
import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.anual import construir_anual, geometria  # noqa: E402
from app.sitios import cargar_sitios  # noqa: E402

ANUAL_DIR = config.DATA_DIR / "anual"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--inicio", default="2027-01-01", help="Fecha de inicio UTC (AAAA-MM-DD)")
    ap.add_argument("--dias", type=int, default=400, help="365 más margen para misiones que empiezan a fin de año")
    ap.add_argument("--altura", type=float, default=2.0, help="Altura del panel/antena en metros")
    args = ap.parse_args()

    inicio = datetime.fromisoformat(args.inicio)
    ANUAL_DIR.mkdir(parents=True, exist_ok=True)
    indice = []
    hay_geometria = False
    for sitio in cargar_sitios():
        t0 = time.time()
        salida, pos = construir_anual(sitio, inicio, args.dias, args.altura)
        fuente = salida["horizonte"]["fuente"]
        if not hay_geometria:
            (ANUAL_DIR / "geometria.json").write_text(json.dumps(geometria(pos), separators=(",", ":")), encoding="utf-8")
            hay_geometria = True
        destino = ANUAL_DIR / f"{sitio['id']}.json"
        destino.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        indice.append({**sitio, "horizonte_fuente": fuente, "archivo": destino.name})
        print(f"{sitio['id']:20s} {fuente:18s} {destino.stat().st_size / 1e3:6.0f} kB  ({time.time() - t0:.1f} s)")
    (ANUAL_DIR / "indice.json").write_text(
        json.dumps({"inicio": f"{args.inicio}T00:00:00Z", "dias": args.dias, "paso_horas": 1,
                    "altura_m": args.altura, "sitios": indice}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nListo: {len(indice)} sitios en {ANUAL_DIR}")
