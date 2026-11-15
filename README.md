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

"Exportar misión (CSV)", en el panel del sitio, descarga la misión elegida con una fila por hora (Sol, Tierra, luz,
contacto, energía y batería, fechas en UTC) y los datos del sistema arriba. "Exportar comparación (CSV)", en la vista
Comparar, descarga una fila por escenario fijado. Con la interfaz en castellano el separador es ";" y la coma decimal
(Excel en castellano lo abre con doble clic); en inglés, "," y punto decimal. Los nombres de columna no cambian. Se arma
en `frontend/src/v2/exportar.js`.

Las líneas del principio que empiezan con `#` son metadatos (sitio, coordenadas, perfil, batería, criterio de luz y
contacto…), no datos: después viene el encabezado y una fila por hora o por escenario. Para leerlo en Python, se
saltean con `comment="#"`, y `encoding="utf-8-sig"` quita la marca BOM del principio (la que pone el
archivo para que Excel lea bien los acentos):

```python
import pandas

pandas.read_csv(archivo, sep=";", decimal=",", comment="#", encoding="utf-8-sig")  # interfaz en castellano
pandas.read_csv(archivo, sep=",", comment="#", encoding="utf-8-sig")               # interfaz en inglés
```

Desde el panel del sitio, "Ver en herramientas de NASA" abre NASA Moon Trek y LROC QuickMap centrados en el sitio
(en vista polar sur al sur de 80° S, con la misma proyección que el mapa 2D) y, en el perfil planificar, las tablas de
JPL Horizons del Sol y de la Tierra (cada hora de la misión, con los mismos parámetros que
`backend/scripts/validar_horizons.py`). Los enlaces se arman en `frontend/src/v2/enlaces.js`. El panel muestra además
el sello "Validado contra JPL Horizons", que abre [docs/VALIDACION.md](docs/VALIDACION.md).

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
python scripts/descargar_datos.py          # kernels JPL (~18 MB) y DEM LOLA 80 m (115 MB)
uvicorn app.main:app --reload              # http://127.0.0.1:8000/docs

# Terminal 2 — frontend
cd frontend
echo "VITE_API_URL=http://127.0.0.1:8000" > .env
npm install
npm run dev
```

Para una demo, corré el backend sin `--reload` (`uvicorn app.main:app`). Al arrancar carga los kernels, scipy y
el DEM de `data/raw` (unos segundos, lo muestra en la consola) para que el primer punto no espere; con `--reload`
cada cambio de archivo reinicia el proceso y se pierde eso.

Si los puertos 8000/5173 están ocupados, usá otros: `uvicorn ... --port 8010`, `npm run dev -- --port 5174`.
En desarrollo el backend acepta cualquier puerto de `localhost`/`127.0.0.1`. En producción, fijá los orígenes
permitidos con `MOONSET_CORS` (por ejemplo `MOONSET_CORS="https://moonset.ejemplo.org"`): si está definida,
solo se aceptan esos.

`npm run dev` y `npm run build` copian `data/precalculado` y `data/anual` a `frontend/public/` solos.

### Regenerar datos (opcional)

Los resultados ya están commiteados. Solo hace falta si cambian los sitios o el algoritmo:

```bash
cd backend
python scripts/precalcular_sitios.py     # horizonte y métricas por sitio
python scripts/precalcular_anual.py      # año 2027, cada hora, Sol/Tierra por sitio
python scripts/precalcular_vecindad.py   # grillas de alrededores (sitios polares)
python scripts/generar_mapa_polo.py      # fondo del mapa 2D del polo sur (usa el DEM si está)
node ../frontend/scripts/copiar-datos.mjs
```

Para el relieve real al sur de 80°S hace falta el DEM de LOLA de 80 m (115 MB) en `data/raw/`.
`python scripts/descargar_datos.py` lo baja junto con los kernels (con `--sin-dem`, solo los kernels).

Sin ese archivo el horizonte se calcula sobre la esfera lisa (sin relieve). Tests: `cd backend && pytest`.

Con el DEM descargado, `python scripts/generar_mapa_polo.py` reemplaza el fondo del mapa 2D (que viene
de la textura LROC, en baja resolución) por el relieve sombreado de LOLA a 80 m. Después hay que commitear
`data/mapa/polo_sur.jpg` y `data/mapa/polo_sur.json`.

## Deploy

El frontend es estático y el backend es opcional: sin backend la página funciona con los 13 sitios
precalculados; con backend se suman los puntos propios (`GET /anual`).

### Frontend en Vercel

- Proyecto con **Root Directory** `frontend`, framework **Vite** (build `npm run build`, salida `dist`).
- Variable de entorno **`VITE_API_URL`** con la URL del backend, sin barra final
  (por ejemplo `https://moonset-api-xxxxx.southamerica-east1.run.app`). Se lee en el build: después de
  cambiarla hay que volver a desplegar. Vacía o sin definir, la app queda en modo estático.
- Publicado en https://moon-set.vercel.app.

### Backend en Google Cloud Run

`backend/Dockerfile` (Python 3.12 slim) instala las dependencias y, en el build, baja los kernels de JPL y el DEM
LOLA 80 m con `scripts/descargar_datos.py`: quedan dentro de la imagen y el contenedor no descarga nada al
arrancar. Escucha en `$PORT` (8000 si no está), corre sin `--reload`, como usuario sin privilegios, y no escribe
en disco (solo podría usar `/tmp`). Desde la raíz del repo:

```bash
gcloud run deploy moonset-api --source backend --region southamerica-east1   --memory 1Gi --cpu 1 --min-instances 1 --allow-unauthenticated   --set-env-vars MOONSET_CORS=https://moon-set.vercel.app
```

- `MOONSET_CORS` es la lista exacta de orígenes permitidos, separada por comas (las vistas previas de Vercel,
  `moon-set-git-….vercel.app`, no entran si no se agregan). Sin la variable solo se acepta `localhost`.
- Memoria: unos 500 MB con el DEM cargado y después de varios pedidos; entra en 1 GiB.
- **`--min-instances 1` evita que se duerma, pero consume crédito todo el tiempo.** Configurá una alerta de
  presupuesto en Billing → Budgets & alerts antes de dejarlo andando. Con `--min-instances 0` es gratis en reposo,
  pero el primer pedido después de un rato espera el arranque (unos segundos más el precalentado).
- La imagen solo ve la carpeta `backend/`: por eso lleva una copia de `data/sitios.json` en
  `backend/datos/sitios.json`. Si cambia la lista, copiala (`pytest` avisa si quedaron distintas).

Probar la imagen en local (con Docker):

```bash
docker build -t moonset-api backend
docker run --rm -p 8000:8000 --read-only --tmpfs /tmp -e MOONSET_CORS=https://moon-set.vercel.app moonset-api
curl http://localhost:8000/salud
curl "http://localhost:8000/anual?lat=-89.45&lon=222.69" -o /dev/null -w "%{http_code} %{size_download}
"
```

### Alternativa sin tarjeta: Render

Un **Web Service** de tipo Docker con el mismo `Dockerfile` (Root Directory `backend`), la variable
`MOONSET_CORS=https://moon-set.vercel.app` y Health Check Path `/salud`. Render pasa el puerto en `$PORT`.
El plan gratis duerme el servicio tras unos minutos sin pedidos: para evitarlo, un monitor externo (por ejemplo
UptimeRobot o cron-job.org) que llame a `https://<servicio>.onrender.com/salud` cada 10 minutos.
**Ojo con la memoria:** el backend usa unos 500 MB con el DEM cargado; si el plan tiene 512 MB queda al límite y
puede reiniciarse por memoria. Revisá el límite del plan antes de elegirlo.

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
