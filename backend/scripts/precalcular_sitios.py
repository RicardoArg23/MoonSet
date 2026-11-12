"""Precalcula todos los sitios de data/sitios.json y guarda un JSON por sitio en data/precalculado/.

Uso (desde la carpeta backend/):
    python scripts/precalcular_sitios.py --inicio 2027-01-01 --dias 30 --paso 1
"""
import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.servicio import evaluar  # noqa: E402
from app.sitios import cargar_sitios  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--inicio", default="2027-01-01", help="Fecha de inicio UTC (AAAA-MM-DD)")
    ap.add_argument("--dias", type=float, default=30)
    ap.add_argument("--paso", type=float, default=1, help="Paso en horas")
    ap.add_argument("--altura", type=float, default=2, help="Altura del panel/antena en metros")
    args = ap.parse_args()

    inicio = datetime.fromisoformat(args.inicio)
    config.PRECALCULADO_DIR.mkdir(parents=True, exist_ok=True)
    indice = []
    for sitio in cargar_sitios():
        t0 = time.time()
        res = evaluar(sitio["lat"], sitio["lon"], inicio, args.dias, args.paso, args.altura, sitio=sitio)
        destino = config.PRECALCULADO_DIR / f"{sitio['id']}.json"
        destino.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        m = res["metricas"]
        indice.append({**sitio, "metricas": m, "horizonte_fuente": res["horizonte"]["fuente"],
                       "archivo": destino.name})
        print(f"{sitio['id']:20s} luz {m['porcentaje_luz']:5.1f}%  señal {m['porcentaje_senal']:5.1f}%  "
              f"({res['horizonte']['fuente']}, {time.time() - t0:.1f} s)")
    (config.PRECALCULADO_DIR / "indice.json").write_text(
        json.dumps({"parametros": vars(args), "sitios": indice}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nListo: {len(indice)} sitios en {config.PRECALCULADO_DIR}")
