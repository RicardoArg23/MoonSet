# API de MoonSet para Cloud Run o Render. Se construye con la carpeta backend/ como contexto:
#   docker build -t moonset-api backend
#   docker run --rm -p 8000:8000 -e MOONSET_CORS=https://moon-set.vercel.app moonset-api
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MOONSET_KERNELS=/app/kernels \
    MOONSET_DATA=/app/datos \
    MOONSET_DEM_80S=/app/datos/raw/LDEM_80S_80M.IMG

WORKDIR /app

# Dependencias (sin las de los tests).
COPY requirements.txt .
RUN grep -viE '^(pytest|httpx)' requirements.txt > /tmp/requisitos.txt \
    && pip install -r /tmp/requisitos.txt \
    && rm /tmp/requisitos.txt

# Kernels de JPL y DEM LOLA 80 m dentro de la imagen: el contenedor no descarga nada al arrancar.
# Solo se copia lo que usa el script, así un cambio en la API no vuelve a bajar 130 MB.
COPY app/__init__.py app/config.py app/efemerides.py ./app/
COPY scripts/descargar_datos.py ./scripts/
RUN python scripts/descargar_datos.py

COPY app ./app
COPY datos/sitios.json ./datos/sitios.json
# Bytecode compilado en el build: en ejecución no se escribe nada (salvo lo que haga falta en /tmp).
RUN python -m compileall -q app \
    && useradd --uid 10001 --no-create-home --home-dir /tmp moonset

USER moonset
ENV HOME=/tmp
EXPOSE 8000
# Cloud Run y Render pasan el puerto en $PORT; sin él, 8000. Sin --reload.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
