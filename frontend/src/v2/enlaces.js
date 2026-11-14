// Solo texto: enlaces a herramientas de NASA posicionadas en un sitio. Sin React, se prueba con Node.
//
// - JPL Horizons: la API en formato texto, que el navegador muestra como tabla. Mismos parámetros que
//   backend/scripts/validar_horizons.py, pero con un intervalo (llegada a fin de misión, cada hora).
// - Moon Trek y LROC QuickMap: deep links en vista geográfica, con el formato deducido de URLs reales
//   de cada visor (ver enlaceMoonTrek y enlaceQuickmap). La vista polar todavía no está enlazada: para
//   los sitios al sur de 80° S se abre la geográfica y la interfaz ofrece copiar las coordenadas.

export const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const MOON_TREK = "https://trek.nasa.gov/moon/";
export const QUICKMAP = "https://quickmap.lroc.im-ldi.com/";
export const CUERPOS_HORIZONS = { sol: "10", tierra: "399" };
export const LAT_POLAR_SUR = -80; // al sur de esto conviene la proyección polar sur
export const ZOOM_MOON_TREK = 8; // con z=1 se ven ~430° de ancho; cada nivel acerca al doble
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
    CSV_FORMAT: "'YES'",
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

// Moon Trek: #v=0.1&x=<lon este -180..180>&y=<lat>&z=<zoom>&p=<proyección>&b=moon. Se omite e (extensión
// visible): el visor la calcula a partir del centro y el zoom. EPSG:104903 es la geográfica de la Luna.
export function enlaceMoonTrek({ lat, lon }) {
  const p = new URLSearchParams({
    v: "0.1",
    x: String(lonEste180(lon)),
    y: String(lat),
    z: String(ZOOM_MOON_TREK),
    p: "urn:ogc:def:crs:EPSG::104903",
    d: "",
    locale: "",
    b: "moon",
    sfz: "",
    w: "",
  });
  return { url: `${MOON_TREK}#${p}`, deepLink: true, vistaPolarPendiente: proyeccion(lat) === "polar-sur" };
}

// QuickMap: ?prjExtent=xmin,ymin,xmax,ymax&proj=10 (cilíndrica simple, en metros). El rectángulo se
// corre para no salirse de ±90° de latitud. stack y defs (capas) se omiten: queda la capa por defecto.
export function enlaceQuickmap({ lat, lon }) {
  const x = lonEste180(lon) * M_POR_GRADO;
  const tope = 90 - QUICKMAP_MEDIO_ALTO_GRADOS;
  const y = Math.max(-tope, Math.min(tope, lat)) * M_POR_GRADO;
  const dx = QUICKMAP_MEDIO_ANCHO_GRADOS * M_POR_GRADO;
  const dy = QUICKMAP_MEDIO_ALTO_GRADOS * M_POR_GRADO;
  const extension = [x - dx, y - dy, x + dx, y + dy].map((v) => v.toFixed(1)).join(",");
  const p = new URLSearchParams({ prjExtent: extension, proj: "10" });
  return { url: `${QUICKMAP}?${p}`, deepLink: true, vistaPolarPendiente: proyeccion(lat) === "polar-sur" };
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
