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
- `docs/` — [estado del proyecto](docs/ESTADO.md): qué hay, qué falta, cómo funciona.
- `prototipos/` — primeras pruebas (script de un sitio y página HTML con globo 3D).

## Inicio rápido

Requisitos: Python 3.11+ y Node 18+.

**Solo la interfaz (sin backend).** Usa los 13 sitios precalculados que ya están en `data/`:

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

**Con backend** (habilita puntos propios: coordenadas libres en `GET /anual?lat=&lon=`):

```bash
# Terminal 1 — backend
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/descargar_datos.py          # kernels JPL (~20 MB)
uvicorn app.main:app --reload              # http://127.0.0.1:8000/docs

# Terminal 2 — frontend
cd frontend
echo "VITE_API_URL=http://127.0.0.1:8000" > .env
npm install
npm run dev
```

Si los puertos 8000/5173 están ocupados, usá otros: `uvicorn ... --port 8010`, `npm run dev -- --port 5174`,
y agregá el origen del frontend en `MOONSET_CORS` (por ejemplo
`MOONSET_CORS="http://localhost:5174" uvicorn app.main:app --port 8010`).

`npm run dev` y `npm run build` copian `data/precalculado` y `data/anual` a `frontend/public/` solos.

### Regenerar datos (opcional)

Los resultados ya están commiteados. Solo hace falta si cambian los sitios o el algoritmo:

```bash
cd backend
python scripts/precalcular_sitios.py     # horizonte y métricas por sitio
python scripts/precalcular_anual.py      # año 2027, cada hora, Sol/Tierra por sitio
python scripts/precalcular_vecindad.py   # grillas de alrededores (sitios polares)
node ../frontend/scripts/copiar-datos.mjs
```

Para el relieve real al sur de 80°S hay que bajar el DEM de LOLA de 80 m (115 MB) a `data/raw/`:

```bash
mkdir -p data/raw
curl -L -o data/raw/LDEM_80S_80M.IMG https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG
```

Sin ese archivo el horizonte se calcula sobre la esfera lisa (sin relieve). Tests: `cd backend && pytest`.

## Datos

- Efemérides: NASA/JPL DE421 y orientación lunar `moon_pa_de421_1900-2050` (vía skyfield).
- Relieve: LOLA (Lunar Reconnaissance Orbiter), DEM del polo sur a 80 m/píxel (80°S–90°S) y,
  opcional, mosaico a 5 m/píxel — https://pgda.gsfc.nasa.gov/products/81
- Textura del globo: mosaico LROC 4k (`frontend/public/texturas/`).
- Algunas coordenadas de `data/sitios.json` son aproximadas y los números aún no se validaron
  contra valores publicados.

Los archivos pesados (`data/raw/`, kernels) no se guardan en el repo.

## Equipo

- Ricardo Argüello
- ...

## Licencia

MIT
