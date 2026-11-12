# MoonSet — Frontend

React 18 + Vite 5. Muestra, para un sitio de la Luna y un momento elegido:

- una **vista 360°** con el relieve, el Sol y la Tierra;
- el **estado** (luz / sombra, señal / sin señal) y **cuánto falta** para la puesta o la salida;
- en modo **Planificador**: azimut, elevación y margen exactos, la **línea de tiempo** del período
  y los parámetros (fecha, días, altura del panel);
- una **tabla de comparación** con todos los sitios cargados.

## Instalación y uso

Desde la carpeta `frontend/` (necesita Node 18 o más nuevo):

```bash
npm install
npm run dev
```

Abre en http://localhost:5173.

### Dos modos de datos

| Modo | Cómo se activa | Qué permite |
| --- | --- | --- |
| Sin servidor | Por defecto | Lee los JSON de `data/precalculado/` (se copian solos a `public/` al correr `npm run dev`). Solo sitios de la lista, enero de 2027, 30 días. |
| Con backend | Crear `frontend/.env` con `VITE_API_URL=http://127.0.0.1:8000` y levantar el backend | Coordenadas personalizadas, cualquier fecha, días y altura del panel. |

El modo sin servidor sirve para trabajar en la interfaz sin depender del backend, y como respaldo
para la demo si el servidor falla.

## Estructura

```
src/
├── App.jsx                     # estado general: sitios, resultados cargados, momento elegido, modo
├── api/datos.js                # único lugar que habla con el backend o lee los JSON
├── utils/tiempo.js             # formatos de fecha/horas, cuenta regresiva, interpolación del horizonte
├── componentes/
│   ├── SelectorSitio.jsx       # lista curada agrupada + coordenadas personalizadas
│   ├── VistaPanoramica.jsx     # canvas 360°: relieve, Sol, Tierra
│   ├── PanelEstado.jsx         # luz/señal + tiempo hasta la puesta
│   ├── LineaDeTiempo.jsx       # canvas: margen sobre el relieve en todo el período
│   ├── Comparacion.jsx         # tabla de sitios cargados
│   └── useCanvas.js            # hook: canvas nítido que se redibuja al cambiar de tamaño
└── estilos.css                 # tokens de color y tipografía (tema claro y oscuro)
```

## Pendientes

- [ ] Globo 3D con `three` + `@react-three/fiber` (ver `prototipos/horizonte-sur.html`)
- [ ] Comparar la misma ubicación en distintas fechas de alunizaje
- [ ] En celular: selector de sitios como desplegable para que la vista quede arriba
- [ ] Mapa 2D del polo con los sitios marcados
- [ ] Deploy (Vercel o GitHub Pages: `npm run build` genera `dist/`)
