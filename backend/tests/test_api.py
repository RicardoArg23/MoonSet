"""Tests básicos. Correr desde backend/:  pytest"""
from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)
INICIO = "2027-01-01T00:00:00Z"


def test_salud():
    assert cliente.get("/salud").json() == {"estado": "ok"}


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
