"""Tests básicos. Correr desde backend/:  pytest"""
from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)
INICIO = "2027-01-01T00:00:00Z"


def test_salud():
    assert cliente.get("/salud").json() == {"estado": "ok"}


def test_cors_en_desarrollo_acepta_cualquier_puerto_de_localhost():
    """Sin MOONSET_CORS, el frontend puede correr en cualquier puerto local; un origen externo no pasa."""
    for origen in ("http://localhost:5173", "http://localhost:5180", "http://127.0.0.1:4173"):
        r = cliente.get("/salud", headers={"Origin": origen})
        assert r.headers.get("access-control-allow-origin") == origen
    r = cliente.get("/salud", headers={"Origin": "http://ejemplo.com:5173"})
    assert "access-control-allow-origin" not in r.headers


def test_lista_de_sitios():
    sitios = cliente.get("/sitios").json()
    assert any(s["id"] == "apollo-11" for s in sitios)


def test_apollo_11_sol_alto():
    """Cerca del ecuador el Sol sube mucho y hay luz más o menos la mitad del tiempo."""
    r = cliente.get("/sitios/apollo-11", params={"inicio": INICIO, "dias": 30}).json()
    m = r["metricas"]
    assert m["elevacion_solar_max"] > 80
    assert 40 < m["porcentaje_luz"] < 60
    assert m["porcentaje_senal"] == 100  # desde el lado visible la Tierra siempre se ve


def test_polo_sur_sol_rasante():
    """En el polo el Sol nunca sube más de ~1,6°."""
    r = cliente.post("/evaluar", json={"lat": -89.45, "lon": 222.69, "inicio": INICIO, "dias": 30}).json()
    assert r["metricas"]["elevacion_solar_max"] < 1.7
    assert len(r["horizonte"]["grados"]) == 360
    assert len(r["serie"]["tiempos"]) == 720


def test_cara_oculta_sin_senal():
    """Chang'e 4 está en la cara oculta: nunca ve la Tierra."""
    r = cliente.get("/sitios/change-4", params={"inicio": INICIO, "dias": 30}).json()
    assert r["metricas"]["porcentaje_senal"] == 0


def test_sitio_inexistente():
    assert cliente.get("/sitios/no-existe", params={"inicio": INICIO}).status_code == 404


def test_demasiadas_muestras():
    r = cliente.post("/evaluar", json={"lat": 0, "lon": 0, "inicio": INICIO, "dias": 366, "paso_horas": 0.25})
    assert r.status_code == 422


def test_anual_igual_sin_subpuntos():
    """/anual no calcula los puntos subsolar y subterrestre, y el resto no cambia."""
    from datetime import datetime

    from app.anual import construir_anual
    from app.efemerides import calcular_posiciones

    inicio = datetime(2027, 1, 1)
    con = calcular_posiciones(-88.5, 100.0, inicio, 2, 1.0)
    sin = calcular_posiciones(-88.5, 100.0, inicio, 2, 1.0, subpuntos=False)
    assert "subsolar" not in sin and "subterrestre" not in sin
    assert con["tiempos"] == sin["tiempos"]
    for cuerpo in ("sol", "tierra"):
        for clave, valores in con[cuerpo].items():
            assert (valores == sin[cuerpo][clave]).all()
    sitio = {"id": "x", "lat": -88.5, "lon": 100.0}
    assert construir_anual(sitio, inicio, 2)[0] == construir_anual(sitio, inicio, 2, subpuntos=False)[0]


def test_precalentar_arranca_sin_dem(monkeypatch, tmp_path):
    from app import config, precalentar

    monkeypatch.setattr(config, "DEM_80S", tmp_path / "no_existe.IMG")
    tiempos = precalentar.precalentar()
    assert "kernels" in tiempos and "scipy" in tiempos and "dem_80s" not in tiempos
    with TestClient(app) as c:  # con el ciclo de vida: arranca igual sin el DEM
        assert c.get("/salud").status_code == 200
