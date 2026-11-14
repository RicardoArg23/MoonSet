"""Valida nuestras efemerides (app/efemerides.py) contra JPL Horizons.

Para cada sitio de data/sitios.json y unas fechas repartidas en 2027 pide a Horizons el azimut y
la elevacion aparentes del Sol y la Tierra vistos desde la superficie lunar, y los compara con
calcular_posiciones en los mismos instantes UTC.

- Las respuestas crudas quedan en data/validacion/cache/ y no se vuelven a pedir (Horizons tiene
  limites de uso: una consulta por vez y con pausa entre pedidos). La app nunca consulta Horizons.
- Resultado detallado: data/validacion/horizons.json. Resumen: docs/VALIDACION.md.
- Se marca todo caso con error mayor al umbral (0,05 grados por defecto).

Uso (desde la carpeta backend/):
    python scripts/validar_horizons.py
    python scripts/validar_horizons.py --sin-red      # solo usa la cache
"""
import argparse
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402
from app.efemerides import calcular_posiciones  # noqa: E402
from app.sitios import cargar_sitios  # noqa: E402

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
VALIDACION_DIR = config.DATA_DIR / "validacion"
CACHE_DIR = VALIDACION_DIR / "cache"
RESUMEN_MD = config.REPO_DIR / "docs" / "VALIDACION.md"

CUERPOS = {"sol": "10", "tierra": "399"}

# Cinco instantes UTC repartidos en 2027, con horas distintas para no muestrear siempre la misma fase
FECHAS = [
    datetime(2027, 1, 15, 0, 0, tzinfo=timezone.utc),
    datetime(2027, 3, 29, 6, 0, tzinfo=timezone.utc),
    datetime(2027, 6, 10, 12, 0, tzinfo=timezone.utc),
    datetime(2027, 8, 22, 18, 0, tzinfo=timezone.utc),
    datetime(2027, 11, 3, 3, 30, tzinfo=timezone.utc),
]


def _parametros(lat: float, lon: float, cuerpo: str) -> dict:
    """Consulta OBSERVER desde un punto de la superficie lunar (coord@301), longitud este."""
    tlist = " ".join(f"'{f:%Y-%m-%d %H:%M}'" for f in FECHAS)
    return {
        "format": "json",
        "COMMAND": f"'{CUERPOS[cuerpo]}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "TLIST": tlist,
        "TLIST_TYPE": "'CAL'",
        "TIME_TYPE": "'UT'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
    }


def consultar(sitio_id: str, lat: float, lon: float, cuerpo: str, pausa: float, sin_red: bool) -> tuple[str, bool]:
    """Texto de la respuesta de Horizons, desde la cache si ya se pidio con los mismos parametros.

    Devuelve (texto, vino_de_la_red).
    """
    params = _parametros(lat, lon, cuerpo)
    clave = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:12]
    archivo = CACHE_DIR / f"{sitio_id}_{cuerpo}.json"
    if archivo.exists():
        guardado = json.loads(archivo.read_text(encoding="utf-8"))
        if guardado.get("clave") == clave:
            return guardado["respuesta"]["result"], False
    if sin_red:
        raise SystemExit(f"Falta en la cache: {archivo.name} (correlo sin --sin-red)")

    time.sleep(pausa)
    url = API_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as r:
        respuesta = json.load(r)
    if "error" in respuesta or "$$SOE" not in respuesta.get("result", ""):
        raise RuntimeError(f"Horizons respondio con error para {sitio_id}/{cuerpo}: "
                           f"{respuesta.get('error') or respuesta.get('result', '')[:500]}")
    archivo.write_text(json.dumps({
        "clave": clave,
        "pedido_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "parametros": params,
        "respuesta": respuesta,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return respuesta["result"], True


def parsear(texto: str) -> list[dict]:
    """Filas entre $$SOE y $$EOE: fecha UTC, azimut y elevacion aparentes (grados)."""
    cuerpo = texto.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    filas = []
    for linea in cuerpo.strip().splitlines():
        campos = [c.strip() for c in linea.split(",")]
        fecha = datetime.strptime(campos[0], "%Y-%b-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
        filas.append({"tiempo": fecha, "azimut": float(campos[3]), "elevacion": float(campos[4])})
    return filas


def encabezado(texto: str, campo: str) -> str:
    for linea in texto.splitlines():
        if linea.startswith(campo):
            return linea.split(":", 1)[1].strip()
    return ""


def nuestro_calculo(lat: float, lon: float) -> dict:
    """Azimut y elevacion de app/efemerides.py en cada instante de FECHAS."""
    salida = {"sol": [], "tierra": []}
    for f in FECHAS:
        p = calcular_posiciones(lat, lon, f, dias=1 / 24, paso_horas=1.0)
        for cuerpo in salida:
            salida[cuerpo].append({"azimut": float(p[cuerpo]["azimut"][0]),
                                   "elevacion": float(p[cuerpo]["elevacion"][0])})
    return salida


def separacion(az1, el1, az2, el2) -> float:
    """Distancia angular entre dos direcciones del cielo (grados). No sufre el problema del
    azimut cerca del cenit, donde un error chico en posicion da un error grande en azimut."""
    az1, el1, az2, el2 = map(np.radians, (az1, el1, az2, el2))
    c = np.sin(el1) * np.sin(el2) + np.cos(el1) * np.cos(el2) * np.cos(az1 - az2)
    return float(np.degrees(np.arccos(np.clip(c, -1.0, 1.0))))


def dif_azimut(a: float, b: float) -> float:
    """a - b llevado a -180..180."""
    return (a - b + 180.0) % 360.0 - 180.0


def resumir(valores: list[float]) -> dict:
    v = np.abs(np.array(valores))
    return {"max": float(v.max()), "medio": float(v.mean())}


def escribir_md(resultado: dict, umbral: float) -> None:
    m = resultado["metadatos"]
    lineas = [
        "# Validación contra JPL Horizons",
        "",
        "Generado por `backend/scripts/validar_horizons.py`. No editar a mano.",
        "",
        f"- Horizons: efemérides {m['horizons_efemerides']}, marco lunar `{m['horizons_marco']}`, "
        f"consultado {m['horizons_consultado']}.",
        "- Nosotros: skyfield + DE421, marco `MOON_ME_DE421` (`backend/app/efemerides.py`).",
        f"- {len(resultado['sitios'])} sitios × {len(FECHAS)} instantes UTC × Sol y Tierra: "
        + ", ".join(f"{f:%Y-%m-%d %H:%M}" for f in FECHAS) + ".",
        "- Errores en grados, nosotros − Horizons. **Sep.** es la distancia angular entre las dos "
        "direcciones (no depende de lo mal definido que está el azimut cerca del cenit).",
        f"- Umbral: {umbral}°.",
        "",
        "## Resumen por sitio",
        "",
        "| Sitio | Lat | Lon E | Cuerpo | Δaz máx | Δaz medio | Δel máx | Δel medio | Sep. máx |",
        "|---|---:|---:|---|---:|---:|---:|---:|---:|",
    ]
    for s in resultado["sitios"]:
        for cuerpo in CUERPOS:
            r = s["resumen"][cuerpo]
            lineas.append(
                f"| {s['id']} | {s['lat']:.4f} | {s['lon']:.4f} | {cuerpo} "
                f"| {r['azimut']['max']:.5f} | {r['azimut']['medio']:.5f} "
                f"| {r['elevacion']['max']:.5f} | {r['elevacion']['medio']:.5f} "
                f"| {r['separacion']['max']:.5f} |")
    g = resultado["global"]
    lineas += [
        "",
        "## Global",
        "",
        "| Cuerpo | Δaz máx | Δaz medio | Δel máx | Δel medio | Sep. máx |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for cuerpo in CUERPOS:
        r = g[cuerpo]
        lineas.append(f"| {cuerpo} | {r['azimut']['max']:.5f} | {r['azimut']['medio']:.5f} "
                      f"| {r['elevacion']['max']:.5f} | {r['elevacion']['medio']:.5f} "
                      f"| {r['separacion']['max']:.5f} |")
    lineas += ["", f"## Casos sobre {umbral}°", ""]
    if resultado["fuera_de_umbral"]:
        lineas += ["| Sitio | Cuerpo | Fecha UTC | Δaz | Δel | Sep. | El. Horizons |", "|---|---|---|---:|---:|---:|---:|"]
        for c in resultado["fuera_de_umbral"]:
            lineas.append(f"| {c['sitio']} | {c['cuerpo']} | {c['tiempo']} | {c['dif_azimut']:.5f} "
                          f"| {c['dif_elevacion']:.5f} | {c['separacion']:.5f} | {c['elevacion_horizons']:.3f} |")
    else:
        lineas.append("Ninguno.")
    RESUMEN_MD.write_text("\n".join(lineas) + "\n", encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pausa", type=float, default=2.0, help="Segundos entre consultas a Horizons")
    ap.add_argument("--umbral", type=float, default=0.05, help="Error en grados a partir del cual se marca")
    ap.add_argument("--sin-red", action="store_true", help="No consultar Horizons, usar solo la cache")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # la consola de Windows no es UTF-8 por defecto

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    sitios = cargar_sitios()
    salida_sitios, fuera, todos = [], [], {c: {"azimut": [], "elevacion": [], "separacion": []} for c in CUERPOS}
    meta = {}

    for sitio in sitios:
        sid, lat, lon = sitio["id"], sitio["lat"], sitio["lon"]
        nuestro = nuestro_calculo(lat, lon)
        registro = {"id": sid, "lat": lat, "lon": lon, "cuerpos": {}, "resumen": {}}
        for cuerpo in CUERPOS:
            texto, de_red = consultar(sid, lat, lon, cuerpo, args.pausa, args.sin_red)
            print(f"{sid:20s} {cuerpo:6s} {'Horizons' if de_red else 'cache'}")
            if not meta:
                meta = {"horizons_efemerides": encabezado(texto, "Target body name").split("source:")[-1].strip(" }"),
                        "horizons_marco": encabezado(texto, "Center pole/equ").split("{")[0].strip()}
            filas = parsear(texto)
            if len(filas) != len(FECHAS):
                raise RuntimeError(f"{sid}/{cuerpo}: Horizons devolvio {len(filas)} filas, se esperaban {len(FECHAS)}")
            muestras, daz, dele, sep = [], [], [], []
            for f, h, n in zip(FECHAS, filas, nuestro[cuerpo]):
                if abs((h["tiempo"] - f).total_seconds()) > 0.5:
                    raise RuntimeError(f"{sid}/{cuerpo}: instante distinto ({h['tiempo']} vs {f})")
                m = {"tiempo": f"{f:%Y-%m-%dT%H:%M:%SZ}",
                     "horizons": {"azimut": h["azimut"], "elevacion": h["elevacion"]},
                     "nuestro": n,
                     "dif_azimut": dif_azimut(n["azimut"], h["azimut"]),
                     "dif_elevacion": n["elevacion"] - h["elevacion"],
                     "separacion": separacion(n["azimut"], n["elevacion"], h["azimut"], h["elevacion"])}
                muestras.append(m)
                daz.append(m["dif_azimut"]); dele.append(m["dif_elevacion"]); sep.append(m["separacion"])
                if max(abs(m["dif_azimut"]), abs(m["dif_elevacion"]), m["separacion"]) > args.umbral:
                    fuera.append({"sitio": sid, "cuerpo": cuerpo, "tiempo": m["tiempo"],
                                  "dif_azimut": m["dif_azimut"], "dif_elevacion": m["dif_elevacion"],
                                  "separacion": m["separacion"], "elevacion_horizons": h["elevacion"]})
            registro["cuerpos"][cuerpo] = muestras
            registro["resumen"][cuerpo] = {"azimut": resumir(daz), "elevacion": resumir(dele), "separacion": resumir(sep)}
            todos[cuerpo]["azimut"] += daz; todos[cuerpo]["elevacion"] += dele; todos[cuerpo]["separacion"] += sep
        salida_sitios.append(registro)

    pedidos = sorted(json.loads(p.read_text(encoding="utf-8"))["pedido_utc"] for p in CACHE_DIR.glob("*.json"))
    meta["horizons_consultado"] = pedidos[-1][:10] if pedidos else ""
    meta["nuestro"] = "skyfield + DE421, MOON_ME_DE421"
    meta["umbral_deg"] = args.umbral
    meta["fechas_utc"] = [f"{f:%Y-%m-%dT%H:%M:%SZ}" for f in FECHAS]

    resultado = {
        "metadatos": meta,
        "global": {c: {k: resumir(v) for k, v in todos[c].items()} for c in CUERPOS},
        "fuera_de_umbral": fuera,
        "sitios": salida_sitios,
    }
    (VALIDACION_DIR / "horizons.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    escribir_md(resultado, args.umbral)

    for c in CUERPOS:
        g = resultado["global"][c]
        print(f"{c:6s} az máx {g['azimut']['max']:.5f}°  el máx {g['elevacion']['max']:.5f}°  "
              f"sep máx {g['separacion']['max']:.5f}°")
    print(f"{len(fuera)} casos sobre {args.umbral}°" + (": ver docs/VALIDACION.md" if fuera else ""))
