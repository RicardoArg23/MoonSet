# MoonSet — estado del proyecto

Resumen para el equipo de lo que trae la rama `relieve-lola-80m` respecto de `main`, cómo funciona y qué falta.
Cómo levantarlo está en el [README](../README.md).

## En una frase

MoonSet responde a **"si mando una misión a este punto de la Luna en esta fecha, ¿sobrevive la noche?"**.
Calcula dónde están el Sol y la Tierra en el cielo del sitio, los compara con el relieve del horizonte y
cruza el resultado con la duración de la misión y la autonomía de la batería.

## Qué cambia respecto de `main`

| | `main` | Esta rama |
|---|---|---|
| Horizonte | Esfera lisa en los 11 sitios (el DEM de 5 m pesa 3,3 GB y no estaba) | **Relieve real de LOLA a 80 m** para los sitios al sur de 80°S (5 de 13). El resto sigue en esfera lisa |
| Sitios | 11 | **13**: se suman `borde-shackleton` y `borde-de-gerlache` (puntos elevados elegidos sobre el DEM) |
| Datos | 30 días, resumen de métricas por sitio | **Año 2027 completo, cada hora** (`data/anual/`): horizonte + elevación y azimut del Sol y la Tierra |
| API | `/salud`, `/sitios`, `/sitios/{id}`, `/evaluar` | Lo mismo **+ `GET /anual?lat=&lon=`** para coordenadas propias |
| Interfaz | Explorador / Planificador (`src/`) | **Interfaz nueva `src/v2/`**, la principal. La anterior **no se borró**: sigue en `/?clasico` |
| Textura | — | Mosaico LROC 4k para el globo (`frontend/public/texturas/`) |

Los JSON de `data/precalculado/` de los sitios polares cambiaron porque ahora se calculan con relieve:
**los números de `main` para esos sitios ya no valen**.

## Qué tiene

- **Cabina sin scroll** con cuatro vistas:
  - **Globo**: Luna 3D (React Three Fiber) con los sitios y el punto subsolar/subterrestre en la fecha elegida.
  - **Horizonte**: panorama de 360° con el relieve, el Sol y la Tierra.
  - **Alrededores**: grilla de puntos cercanos al sitio (4 sitios polares) y cuál conviene para la misma misión.
  - **Comparar**: hasta N escenarios fijados lado a lado.
- **Misión parametrizable**: fecha de llegada, duración y horas de batería. Dice si sobrevive, cuánto le sobra o
  le falta de batería, y propone **esperar a otra fecha** o **ir a otro sitio** si no sobrevive.
- **Puntos propios**: clic en el globo para evaluar cualquier coordenada (requiere backend con `VITE_API_URL`).
- Funciona **sin backend** con los 13 sitios precalculados.

## Cómo funciona

```
data/sitios.json ─► backend/scripts/precalcular_*.py ─► data/anual/*.json ─► frontend/public/ ─► navegador
   (skyfield + DE421, DEM LOLA)                          (se copian con copiar-datos.mjs)
```

1. **Backend (Python/FastAPI)**: `efemerides.py` calcula elevación y azimut del Sol y la Tierra (skyfield, DE421).
   `horizonte.py` arma la máscara de horizonte (360 valores) trazando rayos sobre el DEM; si no hay DEM usa la esfera.
   `anual.py` junta ambos en el formato que consume la interfaz.
2. **Precálculo offline**: `precalcular_anual.py` y `precalcular_vecindad.py` guardan un año de datos por sitio.
   Los rasters pesados nunca llegan al navegador.
3. **Frontend**: `v2/calculo.js` deriva **en el navegador** las métricas a partir de esas series:
   - hay **luz** si asoma al menos el borde del disco solar sobre el relieve (radio solar 0,267°);
   - hay **señal** si el centro de la Tierra está sobre el relieve;
   - **viable** si la noche más larga de la misión es menor que la autonomía de la batería.
   Como luz y señal no se guardan, cambiar duración o batería no necesita recalcular nada.
4. Las coordenadas propias pasan por `/anual`, que genera el mismo formato al vuelo.

## Qué NO está bien todavía (importante para la presentación)

- **Los números no se validaron contra valores publicados.** Nunca se cruzaron con papers ni con otra herramienta.
  Antes de mostrar cifras concretas hay que hacerlo.
- **8 de 13 sitios usan esfera lisa** (los 6 Apollo, Chang'e 4 y Chandrayaan-3): no hay DEM cargado fuera del
  polo sur. Ahí el horizonte es plano y las noches/señal son aproximados. El código lo marca con
  `horizonte_fuente: "esfera"`; **falta mostrarlo en la UI**.
- **Coordenadas aproximadas** (`aproximado: true` en `data/sitios.json`): Chang'e 4, Chandrayaan-3, IM-1,
  Connecting Ridge, Malapert, y los dos bordes elegidos sobre el DEM. Todas con "verificar".
- Cerca de 80°S el relieve solo cubre hacia el polo; fuera del DEM se cae a la esfera.
- Los puntos propios **no tienen mapa de alrededores** y **se pierden al recargar**.
- **Solo año 2027.**
- La vista Horizonte deja espacio vacío en pantallas altas; el celular no se revisó en detalle.
- Hay dos interfaces conviviendo (`src/` y `src/v2/`): conviene decidir si se borra la clásica antes de la entrega.
- Tests: 7 pasan, 1 se saltea (necesita `rasterio`/`pyproj`). Cubren backend y horizonte; **la lógica de
  `v2/calculo.js` no tiene tests**.

## Qué falta / próximos pasos sugeridos

1. Validar números (luz, noche más larga, señal) en 2–3 sitios contra fuentes publicadas.
2. Verificar y corregir las coordenadas marcadas como aproximadas.
3. Mostrar en la UI qué sitios tienen relieve real y cuáles no (el requisito de la guía: lo sintético debe verse).
4. Un DEM global más grueso para sitios fuera del polo sur (hay un `TODO` en `horizonte.py`).
5. Tests de `calculo.js` (viabilidad, racha de noche, cambios de estado).
6. Pulido: persistir puntos propios, Horizonte en pantallas altas, revisión en celular.
7. Definir la estética final: se exploró otro sistema visual (negro cálido, Space Grotesk) que se **descartó**;
   la app queda con "B · Atmósfera".

## Dónde mirar en el código

| Qué | Dónde |
|---|---|
| Efemérides Sol/Tierra | `backend/app/efemerides.py` |
| Horizonte con DEM | `backend/app/horizonte.py` (`horizonte_img_lola`) |
| Rutas y API | `backend/app/main.py` |
| Formato anual | `backend/app/anual.py`, `backend/scripts/precalcular_anual.py` |
| Métricas de misión | `frontend/src/v2/calculo.js` |
| Pantalla principal | `frontend/src/v2/App.jsx` |
| Globo / Horizonte / Alrededores | `frontend/src/v2/Globo.jsx`, `VistaHorizonte.jsx`, `Vecindad.jsx` |
