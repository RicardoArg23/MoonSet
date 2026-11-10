# MoonSet

Compare lunar landing sites and dates at a glance: see when the Sun and Earth rise and set over the real terrain, for power and direct-to-Earth communication planning.

Project for the **NASA Space Apps Challenge 2026** — challenge: *Lunar Landing Site Navigator*.

## Status

🚧 Work in progress.

## Structure

- `backend/` — Python + FastAPI: ephemerides, horizon masks and metrics
- `frontend/` — React + Vite: interactive site comparison, 360° view and 3D globe
- `data/` — curated landing sites and precomputed results

## Data

- Ephemerides: NASA/JPL (DE421)
- Topography: LOLA (Lunar Reconnaissance Orbiter)

Large data files are not stored in the repo; they are downloaded with `scripts/descargar_datos.py`.

## Team

- Ricardo Argüello
- Maximiliano Cristaldo
- Simon Ordeig
- Leonardo Frey
