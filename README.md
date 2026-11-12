# MoonSet

**Know when the Sun and Earth set, anywhere on the Moon.**

Compare lunar landing sites and dates at a glance: see when the Sun and Earth rise and set over the
real terrain, for power and direct-to-Earth communication planning.

Project for the **NASA Space Apps Challenge 2026** — challenge: *Lunar Landing Site Navigator*.

## Qué hace

Para cualquier punto de la Luna y cualquier fecha, MoonSet calcula dónde están el Sol y la Tierra
en el cielo, los compara con el relieve del horizonte y responde:

- ¿hay **luz** para los paneles solares? ¿cuánto falta para que el Sol se ponga?
- ¿se ve la **Tierra** para comunicarse sin satélite relé? ¿cuánto falta para que se esconda?
- ¿qué sitio conviene, y qué pasa si la misión se atrasa?

Tiene dos modos: **Explorador** (simple, para el público y docentes) y **Planificador**
(números exactos, para equipos de misión).

## Arquitectura

```
data/sitios.json ──► backend (Python + FastAPI) ──► JSON ──► frontend (React + Vite)
DE421 (JPL)      ──►   efemérides + horizonte                  vista 360°, estado,
DEM LOLA         ──►   + métricas                              línea de tiempo, comparación
```

- `backend/` — cálculo y API. Ver [backend/README.md](backend/README.md).
- `frontend/` — interfaz. Ver [frontend/README.md](frontend/README.md).
- `data/` — lista curada de sitios y resultados precalculados.
- `prototipos/` — primeras pruebas (script de un sitio y página HTML con globo 3D).

## Inicio rápido

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
python scripts/descargar_datos.py
uvicorn app.main:app --reload   # http://127.0.0.1:8000/docs

# Frontend (otra terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

## Datos

- Efemérides: NASA/JPL DE421 y orientación lunar `moon_pa_de421_1900-2050` (vía skyfield).
- Relieve: LOLA (Lunar Reconnaissance Orbiter), mosaico del polo sur a 5 m/píxel —
  https://pgda.gsfc.nasa.gov/products/81

Los archivos pesados no se guardan en el repo; se descargan con `backend/scripts/descargar_datos.py`.

## Equipo

- Ricardo Argüello
- ...

## Licencia

MIT
