# MoonSet — Backend

API en Python + FastAPI que calcula, para cualquier punto de la Luna:

- dónde están el **Sol** y la **Tierra** en el cielo (azimut y elevación), hora por hora;
- la **máscara de horizonte** (qué tan alto se ve el relieve en cada dirección);
- las **métricas**: % de luz, % de señal con la Tierra, rachas más largas sin cada una,
  elevación solar y horas hasta la puesta del Sol y de la Tierra.

## Instalación

Desde la carpeta `backend/`:

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
python scripts/descargar_datos.py   # baja ~20 MB de kernels de NASA/JPL a backend/kernels/
```

## Uso

```bash
uvicorn app.main:app --reload
```

- API: http://127.0.0.1:8000
- Documentación interactiva (para probar los endpoints desde el navegador): http://127.0.0.1:8000/docs

### Endpoints

| Método | Ruta | Qué devuelve |
| --- | --- | --- |
| GET | `/salud` | `{"estado": "ok"}` |
| GET | `/sitios` | Lista curada de `data/sitios.json` |
| GET | `/sitios/{id}?inicio=2027-01-01T00:00:00Z&dias=30&paso_horas=1&altura_m=2` | Evaluación completa de un sitio de la lista |
| POST | `/evaluar` con `{"lat", "lon", "inicio", "dias", "paso_horas", "altura_m"}` | Lo mismo para coordenadas libres |

### Formato de la respuesta

```jsonc
{
  "sitio": { "id": "apollo-11", "nombre": "...", "lat": 0.674, "lon": 23.473 },
  "parametros": { "inicio": "2027-01-01T00:00:00Z", "dias": 30, "paso_horas": 1, "altura_m": 2 },
  "horizonte": { "fuente": "esfera" | "dem_lola_polo_sur", "grados": [/* 360 valores, uno por azimut */] },
  "metricas": {
    "porcentaje_luz": 49.6, "porcentaje_senal": 100.0, "porcentaje_luz_y_senal": 49.6,
    "oscuridad_mas_larga_h": 357, "sin_senal_mas_largo_h": 0,
    "elevacion_solar_max": 89.1, "elevacion_solar_media_con_luz": 41.2,
    "horas_hasta_puesta_sol": 120,      // null = no se pone en todo el período; 0 = ya está oculto
    "horas_hasta_puesta_tierra": null,
    "muestras": 720
  },
  "eventos": [ { "tipo": "puesta_sol", "t": "2027-01-06T00:00:00Z", "indice": 120 } ],
  "serie": {               // un valor por muestra, alineados con "tiempos"
    "tiempos": ["2027-01-01T00:00:00Z", "..."],
    "sol_elevacion": [], "sol_azimut": [], "tierra_elevacion": [], "tierra_azimut": [],
    "margen_sol": [],      // grados por encima del relieve (> 0 = visible)
    "margen_tierra": [],
    "fraccion_disco_solar": [],  // 0 a 1
    "luz": [], "senal": [],      // 0/1
    "subsolar_lat": [], "subsolar_lon": [],         // para iluminar el globo 3D
    "subterrestre_lat": [], "subterrestre_lon": []
  }
}
```

Convenciones: latitud negativa = sur; longitud en grados **este** (negativa = oeste);
azimut 0° = norte, 90° = este; todas las fechas en UTC.

## Precalcular los sitios curados

```bash
python scripts/precalcular_sitios.py --inicio 2027-01-01 --dias 30 --paso 1
```

Genera un JSON por sitio en `data/precalculado/` más un `indice.json`. El frontend puede leerlos
directamente, sin servidor.

## Relieve real (DEM de LOLA)

Sin DEM, el horizonte se calcula **sin relieve** (solo el borde de la esfera lunar) y la API lo
indica con `"fuente": "esfera"`.

Para el polo sur:

1. Descargar el mosaico de 5 m/píxel desde https://pgda.gsfc.nasa.gov/products/81
   (el archivo de alturas, ~3,3 GB).
2. Guardarlo como `data/raw/ldem_87s_5mpp.tif` (o indicar otra ruta con la variable de entorno
   `MOONSET_DEM_POLO_SUR`).
3. Verificar en la documentación del producto si las alturas vienen en metros. Si vienen en
   kilómetros, usar `MOONSET_DEM_ESCALA=1000`.

A partir de ahí, los sitios al sur de 87°S usan `"fuente": "dem_lola_polo_sur"`.
Pendiente: un DEM global más grueso para sitios fuera del polo.

El algoritmo está en `app/horizonte.py`: traza 360 rayos desde el sitio, lee el terreno en tres
niveles de resolución (5 m hasta 5 km, 30 m hasta 30 km, 150 m hasta 150 km) y calcula el ángulo
de cada punto con la curvatura de la Luna incluida.

## Tests

```bash
pytest
```

Prueban Apollo 11 (Sol alto, Tierra siempre visible), el polo sur (Sol rasante), Chang'e 4
(cara oculta, sin señal) y la máscara de horizonte con un DEM sintético.

## Estructura

```
backend/
├── app/
│   ├── main.py         # endpoints de FastAPI
│   ├── servicio.py     # une todo y arma la respuesta
│   ├── efemerides.py   # Sol y Tierra vistos desde la Luna (skyfield)
│   ├── horizonte.py    # máscara de horizonte (esfera o DEM)
│   ├── metricas.py     # % luz, % señal, rachas, puestas
│   ├── sitios.py       # lee data/sitios.json
│   └── config.py       # rutas y constantes
├── scripts/
│   ├── descargar_datos.py
│   └── precalcular_sitios.py
├── tests/
└── requirements.txt
```

## Pendientes

- [ ] Confirmar las coordenadas de los sitios con `"aproximado": true` en `data/sitios.json`
- [ ] Sumar las regiones candidatas de Artemis y más destinos CLPS
- [ ] Probar con el DEM real del polo sur
- [ ] DEM global para sitios fuera del polo
- [ ] Validar un sitio contra JPL Horizons
