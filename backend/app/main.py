"""API de MoonSet.

Correr en desarrollo (desde la carpeta backend/):
    uvicorn app.main:app --reload
Documentación interactiva: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config
from .servicio import ConsultaInvalida, evaluar
from .sitios import buscar_sitio, cargar_sitios

app = FastAPI(
    title="MoonSet API",
    description="Posición del Sol y la Tierra sobre el horizonte lunar, con métricas de energía "
                "y comunicación. NASA Space Apps 2026 — Lunar Landing Site Navigator.",
    version="0.1.0",
)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class Pedido(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitud lunar en grados (negativa = sur)")
    lon: float = Field(..., ge=-180, le=360, description="Longitud lunar en grados este")
    inicio: datetime = Field(..., description="Fecha y hora de inicio en UTC, ej. 2027-01-01T00:00:00Z")
    dias: float = Field(30, gt=0, le=config.MAX_DIAS)
    paso_horas: float = Field(1, ge=0.25, le=24)
    altura_m: float = Field(2, ge=0, le=100, description="Altura del panel o antena sobre el suelo")


def _ejecutar(**kwargs) -> dict:
    try:
        return evaluar(**kwargs)
    except ConsultaInvalida as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/salud")
def salud():
    return {"estado": "ok"}


@app.get("/sitios")
def listar_sitios():
    """Lista curada de sitios (Apollo, CLPS, Artemis, otros países)."""
    return cargar_sitios()


@app.get("/sitios/{sitio_id}")
def evaluar_sitio(
    sitio_id: str,
    inicio: datetime = Query(..., description="Inicio en UTC, ej. 2027-01-01T00:00:00Z"),
    dias: float = Query(30, gt=0, le=config.MAX_DIAS),
    paso_horas: float = Query(1, ge=0.25, le=24),
    altura_m: float = Query(2, ge=0, le=100),
):
    """Posiciones, horizonte y métricas para un sitio de la lista curada."""
    sitio = buscar_sitio(sitio_id)
    if sitio is None:
        raise HTTPException(status_code=404, detail=f"No existe el sitio '{sitio_id}'.")
    return _ejecutar(lat=sitio["lat"], lon=sitio["lon"], inicio=inicio, dias=dias,
                     paso_horas=paso_horas, altura_m=altura_m, sitio=sitio)


@app.post("/evaluar")
def evaluar_coordenadas(p: Pedido):
    """Lo mismo que /sitios/{id}, pero para coordenadas cualesquiera."""
    return _ejecutar(lat=p.lat, lon=p.lon, inicio=p.inicio, dias=p.dias,
                     paso_horas=p.paso_horas, altura_m=p.altura_m)
