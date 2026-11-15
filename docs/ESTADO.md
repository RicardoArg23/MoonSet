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
| Interfaz | Explorador / Planificador (`src/`) | **Interfaz `src/v2/`** (la anterior, `src/`, se borró) |
| Textura | — | Mosaico LROC WAC 4k para el globo (`frontend/public/texturas/luna_wac_4k.jpg`) |

Los JSON de `data/precalculado/` de los sitios polares cambiaron porque ahora se calculan con relieve:
**los números de `main` para esos sitios ya no valen**.

## Qué tiene

- **Cabina sin scroll** con cinco vistas:
  - **Globo**: Luna 3D (React Three Fiber) con los sitios y el punto subsolar/subterrestre en la fecha elegida.
  - **Mapa** (rama `mapa-2d`): el polo sur visto desde arriba, en estereográfica polar (la misma proyección que
    `horizonte.py`). Sitios coloreados según si sirven en la fecha elegida, zoom y arrastre, clic para probar un
    punto, brújula con la dirección del Sol y la Tierra, y la grilla de alrededores al acercarse a un sitio.
    El fondo sale de `backend/scripts/generar_mapa_polo.py`: relieve LOLA 80 m si está el DEM; si no, la textura
    LROC reproyectada (baja resolución). Componente: `frontend/src/v2/MapaPolar.jsx`.
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

## Asistente "Planificá tu misión" (15/11, rama `asistente-mision`)

Asistente de decisión con reglas, sin IA ni red: responde "¿dónde y cuándo conviene mi misión?" con las funciones
que ya existían (`evaluarMision`, `evaluarEnergia`, `fechaViableEnergia`, `capacidadMinima`, `panelesMinimos`,
`evaluarVecindadEnergia`, `horasHastaCambio`). Ningún número está escrito a mano.

- **Botón del astronauta**, a la derecha del logo: abre el modo planificación en el panel izquierdo (en pantalla
  angosta, como hoja desde abajo). Arriba del panel aparecen las pestañas **Sitio | Planificar**.
- **Planificar no cambia la app** (sitio, fecha, duración, perfil) hasta tocar "Ver en la app". La X cierra el modo
  sin perder las respuestas.
- **Cuatro preguntas** (qué llevás, dónde, cuándo ± tolerancia, cuánto dura) y un **ranking** de los sitios
  precalculados de la región, con la mejor llegada de cada uno dentro de la tolerancia. Llegadas a las 00:00 UTC.
- **Explicaciones** (`frontend/src/v2/explicar.js`): hasta tres frases por veredicto, cada una con su número real.
  También se ven en el panel del sitio, debajo del veredicto. Las horas de noche que cubre la batería son hasta
  tocar la reserva: capacidad usable × (1 − reserva) × √eficiencia / consumo de noche.
- **Preguntas rápidas** con estilo de chat; cada respuesta dice con qué función se calculó.
- **La Luna sigue a la vista**: globo y mapa marcan en verde los sitios que sobreviven y en rojo los que no; pasar
  por una tarjeta gira el globo hasta ese sitio.
- "Comparar los 3 mejores" los fija en Comparar con la duración y el perfil del plan; si había escenarios fijados
  avisa cuántos reemplazó y ofrece "Deshacer".
- **Paso 1 editable**: "Ajustar" despliega los mismos campos del sistema de energía (`CamposSistema`, en
  `Sistema.jsx`). Cambiar algo crea "Personalizado (planificador)", que vive solo en el planificador hasta "Ver en la
  app". Si la app ya tenía un perfil personalizado al abrir, aparece como opción.
- **La duración es una sola** (decidido el 16/11): la de la barra. El deslizador del planificador la lee y la cambia, y si
  ya había un ranking a la vista se recalcula solo 350 ms después del último cambio (`buscarSitios(true)` conserva la
  tarjeta abierta). Antes el plan tenía su propia duración y el ranking quedaba desactualizado al tocar la barra. El resto
  de las respuestas (perfil, región, fecha) siguen aisladas hasta «Ver sitio».
- **Línea de tiempo en vista previa**: con un ranking a la vista, el dock muestra el sitio de la tarjeta (o la que
  tiene el mouse encima) con el perfil y la duración del plan, la ventana de tolerancia y la mejor llegada, con el
  rótulo "Vista previa". Llega por props (`Dock previa=…`): el estado de la app no cambia.
- **El astronauta alterna** abrir y cerrar; tolerancia libre de 0 a 30 días (por defecto 7) y duración con un
  deslizador de 1 a 30 (por defecto 14). El estado del planificador está en funciones puras de `planificar.js`.
- Código: `planificar.js` (ranking y preguntas, sin React), `explicar.js`, `Planificador.jsx`, `planificador.css`.
  Tests: `tests/planificar.test.js` y `tests/explicar.test.js`. Prototipo de referencia: `prototipos/planifica-tu-mision.html`.

## Cajón de personalización y perfiles (15/11)

- **Cajón** (`frontend/src/v2/Cajon.jsx`, estilos en `cajon.css`): se abre con el engranaje de la barra o la tecla P,
  a la derecha. Lista secciones (Panel de respuesta, Vistas, Barra y línea de tiempo, Misión); al pasar el mouse por
  una fila su pantalla aparece flotando al costado (en táctil, con un toque; en pantalla angosta, una pantalla por
  vez). Todo sale de la lista `secciones` del componente: un ajuste nuevo es una entrada más y queda buscable solo.
- **Configuración** (`frontend/src/v2/ajustes.js`, sin React, con tests): qué vistas, herramientas y bloques del
  panel se ven, el orden de los bloques y qué cifras. Los perfiles `explorar` y `planificar` son los de la pantalla
  de inicio. Cualquier cambio crea el perfil **personalizado**, que se guarda en `localStorage`
  (`moonset.personalizado`) y se valida al leerlo. El tacho del cajón lo borra.
- **Asas** (`Asa.jsx`): el panel de respuesta y la línea de tiempo se pliegan con la pestaña curva de su borde.
  Plegar es momentáneo y no cambia el perfil; ocultar del todo se hace desde el cajón.
- El logo de la barra vuelve al inicio y el idioma está arriba del cajón. Se borró la interfaz anterior (`src/`,
  `?clasico`) y el menú lateral.
- Chequeos: `npm test` (incluye `tests/ajustes.test.js`), `node scripts/probar-i18n.mjs`, `npm run build`.

## Más sitios (rama `mas-sitios`)

- El catálogo pasa de 13 a **25 sitios**: IM-2 Athena, Blue Ghost M1, IM-3, JAXA SLIM, Hakuto-R M1 y M2, Chang'e 3, 5 y 6,
  Chandrayaan-2 Vikram, Luna-25 y Beresheet. Los marcados «· impacto» se estrellaron: quedan para comparar.
- **Con relieve LOLA: 6** (se suma IM-2 Athena, a 84,79° S). Alrededores sigue en 4 (solo al sur de 85° S).
- Chang'e 4, Chandrayaan-3 e IM-1 pasan a coordenadas verificadas en LROC NAC (`aproximado: false`).
- `backend/datos/sitios.json` es la copia para la imagen de Docker; `pytest` avisa si difiere de `data/sitios.json`.
- Sitios de impacto: `"estado": "impacto"` en los 5 que se estrellaron. La app muestra la etiqueta «Impacto» / «Crash site»
  (`EtiquetaImpacto`, en `Planificador.jsx`) en el panel del sitio y en la tarjeta del ranking; no cambia ningún cálculo.
- Validación contra Horizons de los 25 sitios (`docs/VALIDACION.md`, 250 comparaciones): error máximo 0,00006°, ninguno
  sobre 0,05°. Solo se consultaron los 12 nuevos y Chandrayaan-3; el resto salió de la caché.
- `data/precalculado/` (de `precalcular_sitios.py`) ya no lo usa la app y quedó con los 13 sitios.

## Página de validación (16/11)

El sello «Validado contra JPL Horizons» abre `validacion.html`, una página de la propia app (resumen, tablas global y por
sitio, y el detalle por instante, en es/en). La genera `frontend/scripts/generar-validacion.mjs` desde
`data/validacion/horizons.json` en cada `dev` y `build` (no se versiona: `public/validacion.html`). Antes llevaba al
markdown del repo en GitHub.

## Notebooks chicas (16/11)

Medido con `.herramientas/pw/medidas.mjs` (líneas de la barra, desborde del panel y de la página, en es-AR): el panel de
Planificar entra sin scroll en 1440×900, 1233×790, 1280×720, 1366×650 y 1920×960. Para eso, por alto: hasta ~1010 px
el veredicto muestra solo su razón principal, hasta 800/740/680 px se compactan tipografía y bloques, y el alto mínimo de
la cabina bajó de 680 a 600 px. Por ancho: hasta 1320 px la barra se compacta, hasta 1320 px el sistema de energía queda solo con su ícono, hasta 1180 px el panel pasa a 350 px y la
línea de tiempo usa leyendas cortas, y hasta 1060 px la barra va en dos líneas (herramientas arriba, vistas abajo).

## Tutorial guiado (15/11)

- **Qué es** (`frontend/src/v2/Tutorial.jsx`, estilos en `tutorial.css`): la primera visita muestra una invitación
  chica abajo a la derecha, que no bloquea. El botón «?» de la barra lo abre cuando se quiera. Cada paso oscurece
  todo menos un control y, si pide una acción, avanza solo cuando se la hace (o con «Siguiente»).
- **Pasos** (`frontend/src/v2/tutorial.js`, sin React, con tests): una lista por perfil, 5 en explorar y 8 en
  planificar. Cada paso dice qué control señala (`data-tutorial="…"` en el componente), qué acción lo completa y
  qué tiene que estar a la vista. Los textos van en i18n (`tutorial.pasos.<id>`). La cabina avisa las acciones con
  `tutorial.cumplir("…")`. Si el control está oculto desde Personalizar, el paso se saltea solo.
- Se recuerda en `localStorage` (`moonset.tutorial`) que la invitación ya se mostró.
- **Explorar enseña a sumar herramientas**: el paso «Sumá lo que te falte» señala el cajón (`objetivo` puede ser una lista;
  `lugar: "izquierda"` aparta el cartel) y se completa al prender la línea de tiempo; el siguiente la usa. Solo ese paso
  deja el cajón por encima del oscurecido (`.tutorial-cajon`).
- **Dos recorridos con distinta profundidad**: Explorar (6 pasos) presenta el astronauta como atajo opcional, sin
  abrirlo, porque sus preguntas (batería, paneles) son técnicas; Planificar (12 pasos) suma la explicación de las
  cinco vistas (`lista` en el paso), Mis puntos, y hace abrir el astronauta y explica su ranking. Los pasos que no
  son del planificador cierran su modo si estaba abierto (`necesita: "plan"` lo abre).

## Idioma y globo con detalle (14/11)

- **Español / inglés**: los textos de la interfaz están en `frontend/src/v2/i18n/es.js` y `en.js`, agrupados por
  apartado. En los componentes se usa `const { t, f } = useIdioma()`: `t("panel.sobrevive")` para textos y `f` para
  números, fechas, coordenadas y nombres de sitios (`frontend/src/v2/formato.js`). **Un texto nuevo va en los dos
  archivos, no en el componente.** `calculo.js` devuelve solo números.
- **Globo con detalle progresivo**: a cualquier distancia se ve el mismo mosaico; sobre la textura local
  (`texturas/luna_wac_4k.jpg`, generada con `backend/scripts/generar_textura_luna.py` desde ese mosaico) se cargan teselas de NASA Moon Trek
  (`frontend/src/v2/globo/`): mosaico LROC WAC global (hasta ~83 m/px) y mosaico LROC NAC del polo sur
  (85,5° S al polo, hasta ~4 m/px). El botón "Acercar al sitio" lleva la cámara sobre el sitio elegido y la pista
  dice qué imagen se está viendo y a qué resolución. **Necesita internet**; sin red queda la textura local de 4k.
  El mosaico polar es una foto promedio: sus sombras no son las de la fecha elegida.
- Chequeos rápidos: `node scripts/probar-i18n.mjs` y `node scripts/probar-teselas.mjs` (desde `frontend/`).

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
