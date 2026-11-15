// Solo texto: enlaces a herramientas de NASA posicionadas en un sitio. Sin React, se prueba con Node.
//
// - JPL Horizons: la API en formato texto, que el navegador muestra como tabla. Mismos parámetros que
//   backend/scripts/validar_horizons.py, salvo dos: un intervalo (llegada a fin de misión, cada hora)
//   y CSV_FORMAT='NO', para que se lea como tabla de columnas alineadas y no como CSV.
// - Moon Trek y LROC QuickMap: deep links con el formato deducido de URLs reales de cada visor (ver
//   enlaceMoonTrek y enlaceQuickmap). Al sur de 80° S, en vista polar sur (estereográfica): el centro
//   sale de proyectarSur, la misma proyección del mapa 2D y del globo. Al norte, vista geográfica.
//   La interfaz ofrece igual copiar las coordenadas para el buscador, como respaldo.
import { invertirSur, proyectarSur } from "./globo/teselas.js";


export const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const MOON_TREK = "https://trek.nasa.gov/moon/";
export const QUICKMAP = "https://quickmap.lroc.im-ldi.com/";
export const CUERPOS_HORIZONS = { sol: "10", tierra: "399" };
// Validación de nuestras efemérides contra Horizons (docs/VALIDACION.md, tabla "Global"): error máximo
// de 0.00006° (Δaz de la Tierra); el sello dice "< 0,0001°". tests/enlaces.test.js lee el documento y
// falla si estos valores dejan de coincidir con él.
export const VALIDACION_URL = "https://github.com/RicardoArg23/MoonSet/blob/main/docs/VALIDACION.md";
export const VALIDACION_ERROR_MAX_DEG = 0.00006;
export const VALIDACION_ERROR_TOPE_DEG = 0.0001;
export const LAT_POLAR_SUR = -80; // al sur de esto conviene la proyección polar sur
export const ZOOM_MOON_TREK = 8; // geográfica: con z=1 se ven ~430° de ancho; cada nivel acerca al doble
// Polar: con z=8 Moon Trek muestra unos 40 km de ancho (de la URL real: e = 40,7 x 21,2 km con z=8).
export const ZOOM_MOON_TREK_POLAR = 8;
export const MOON_TREK_POLAR_SUR = "urn:ogc:def:crs:IAU2000::30120"; // estereográfica polar sur
export const QUICKMAP_POLAR_SUR = "27"; // estereográfica polar sur (proj=10 es la cilíndrica simple)
const QUICKMAP_POLAR_ANCHO_M = 40_000; // rectángulo de ~40 x 25 km alrededor del sitio
const QUICKMAP_POLAR_ALTO_M = 25_000;
const M_POR_GRADO = (1_737_400 * Math.PI) / 180; // cilíndrica simple de QuickMap (proj=10)
const QUICKMAP_MEDIO_ANCHO_GRADOS = 2; // rectángulo de ~4° x 2° alrededor del sitio
const QUICKMAP_MEDIO_ALTO_GRADOS = 1;

const dos = (n) => String(n).padStart(2, "0");

/** Longitud este en 0..360, como la espera SITE_COORD de Horizons. */
export function lonEste360(lon) {
  const l = ((lon % 360) + 360) % 360;
  return Number(l.toFixed(6));
}

/** Fecha UTC en el formato de Horizons: "2027-05-02 00:00". */
export function fechaHorizons(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** Azimut y elevación aparentes del Sol o la Tierra desde (lat, lon), cada hora entre inicio y fin. */
export function enlaceHorizons({ lat, lon, inicioMs, finMs, cuerpo = "sol" }) {
  const p = new URLSearchParams({
    format: "text",
    COMMAND: `'${CUERPOS_HORIZONS[cuerpo]}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${lonEste360(lon)},${lat},0'`,
    START_TIME: `'${fechaHorizons(inicioMs)}'`,
    STOP_TIME: `'${fechaHorizons(finMs)}'`,
    STEP_SIZE: "'1 h'",
    TIME_TYPE: "'UT'",
    QUANTITIES: "'4'",
    CSV_FORMAT: "'NO'",
    ANG_FORMAT: "'DEG'",
    EXTRA_PREC: "'YES'",
  });
  return `${HORIZONS_API}?${p}`;
}

/** Proyección que corresponde al sitio en los visores de mapas. */
export function proyeccion(lat) {
  return lat < LAT_POLAR_SUR ? "polar-sur" : "equirectangular";
}

/** Longitud este en -180..180, como la usan los visores de mapas. */
export function lonEste180(lon) {
  const l = lonEste360(lon);
  return l > 180 ? Number((l - 360).toFixed(6)) : l;
}

/** Coordenadas para el buscador de QuickMap ("lat, lon", ofrece "Go to … LAT, … LON"): "-89.45, -137.31". */
export function textoCoordenadas(lat, lon) {
  return `${Number(lat.toFixed(4))}, ${Number(lonEste180(lon).toFixed(4))}`;
}

/** Centro del sitio en la estereográfica polar sur de los visores, en metros (x hacia 90° E, y hacia 0°). */
export function centroPolar(lat, lon) {
  const [x, y] = proyectarSur(lat, lon);
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

/** Inversa de centroPolar, para comprobar los enlaces: { lat, lon } con lon este en 0..360. */
export const desproyectarPolar = (x, y) => invertirSur(x, y);

// Moon Trek: #v=0.1&x=..&y=..&z=<zoom>&p=<proyección>&b=moon. Se omite e (extensión visible): el visor
// la calcula a partir del centro y el zoom.
// - geográfica (EPSG:104903): x = lon este -180..180, y = lat, en grados;
// - polar sur (IAU2000:30120): x, y = centro en metros de la estereográfica.
export function enlaceMoonTrek({ lat, lon }) {
  const polar = proyeccion(lat) === "polar-sur";
  const c = polar ? centroPolar(lat, lon) : { x: lonEste180(lon), y: lat };
  const p = new URLSearchParams({
    v: "0.1",
    x: String(c.x),
    y: String(c.y),
    z: String(polar ? ZOOM_MOON_TREK_POLAR : ZOOM_MOON_TREK),
    p: polar ? MOON_TREK_POLAR_SUR : "urn:ogc:def:crs:EPSG::104903",
    d: "",
    locale: "",
    b: "moon",
    sfz: "",
    w: "",
  });
  return { url: `${MOON_TREK}#${p}`, vista: polar ? "polar-sur" : "geografica" };
}

// QuickMap: ?prjExtent=xmin,ymin,xmax,ymax&proj=.. (en metros). stack y defs (capas) se omiten: queda
// la capa por defecto.
// - polar sur (proj=27): rectángulo de ~40 x 25 km centrado en el sitio;
// - geográfica (proj=10, cilíndrica simple): ~4° x 2°, corrido para no salirse de ±90° de latitud.
export function enlaceQuickmap({ lat, lon }) {
  if (proyeccion(lat) === "polar-sur") {
    const { x, y } = centroPolar(lat, lon);
    const dx = QUICKMAP_POLAR_ANCHO_M / 2;
    const dy = QUICKMAP_POLAR_ALTO_M / 2;
    const extension = [x - dx, y - dy, x + dx, y + dy].map((v) => v.toFixed(1)).join(",");
    return { url: `${QUICKMAP}?${new URLSearchParams({ prjExtent: extension, proj: QUICKMAP_POLAR_SUR })}`, vista: "polar-sur" };
  }
  const x = lonEste180(lon) * M_POR_GRADO;
  const tope = 90 - QUICKMAP_MEDIO_ALTO_GRADOS;
  const y = Math.max(-tope, Math.min(tope, lat)) * M_POR_GRADO;
  const dx = QUICKMAP_MEDIO_ANCHO_GRADOS * M_POR_GRADO;
  const dy = QUICKMAP_MEDIO_ALTO_GRADOS * M_POR_GRADO;
  const extension = [x - dx, y - dy, x + dx, y + dy].map((v) => v.toFixed(1)).join(",");
  const p = new URLSearchParams({ prjExtent: extension, proj: "10" });
  return { url: `${QUICKMAP}?${p}`, vista: "geografica" };
}

/** Todos los enlaces del sitio para una misión que va de inicioMs a finMs (UTC). */
export function enlacesNasa({ lat, lon, inicioMs, finMs }) {
  return {
    horizons: {
      sol: enlaceHorizons({ lat, lon, inicioMs, finMs, cuerpo: "sol" }),
      tierra: enlaceHorizons({ lat, lon, inicioMs, finMs, cuerpo: "tierra" }),
    },
    moonTrek: enlaceMoonTrek({ lat, lon }),
    quickmap: enlaceQuickmap({ lat, lon }),
    coordenadas: textoCoordenadas(lat, lon),
  };
}
