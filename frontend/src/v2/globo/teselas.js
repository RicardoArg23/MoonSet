// Teselas de NASA Moon Trek (WMTS) para el globo: qué capas hay, qué teselas se ven desde la cámara
// y dónde cae cada una sobre la esfera. Solo matemática, sin Three.js: se prueba con Node
// (scripts/probar-teselas.mjs).
//
// Capas (verificadas contra su WMTSCapabilities.xml el 2026-11-14):
// - wac: mosaico global LROC WAC, 303 píxeles/grado (~100 m). Equirectangular, lon −180..180, lat 90..−90.
//        Nivel z: 2^(z+1) columnas × 2^z filas, teselas de 256 px. Niveles 0 a 8.
// - nac: mosaico LROC NAC del polo sur (85,5° S al polo), 1 m de origen, servido hasta ~4 m/px.
//        Estereográfica polar sur sobre esfera de 1 737 400 m, escala verdadera en el polo,
//        lon 0° hacia +y, 90° E hacia +x: la misma proyección que los DEM de LOLA que usa el backend.
//        Grilla cuadrada de ±1 095 930 m; nivel z: tesela de 2 191 860 / 2^z metros. Niveles 0 a 11.
//        Fuera de la cobertura el servidor responde 404; dentro, las zonas sin foto vienen transparentes.

export const RADIO_M = 1_737_400;
const RAD = Math.PI / 180;
const BASE_TREK = "https://trek.nasa.gov/tiles/Moon";
const PX = 256;
const SP_MEDIO_M = 1_095_930;
const SP_LADO_M = 2 * SP_MEDIO_M;

export const CAPAS = {
  wac: {
    id: "wac",
    nombre: "LROC WAC",
    zMin: 4, // hasta el nivel 3 se ve la textura local, que es el nivel 3 de este mismo mosaico
    zMax: 8,
    latSinDatos: -87, // más al sur el mosaico trae cuñas negras y blancas sin datos (visto en pantalla); ahí cubre el NAC
    url: (z, fila, col) => `${BASE_TREK}/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${fila}/${col}.jpg`,
    metrosPorPixel: (z) => (Math.PI * RADIO_M) / (PX * 2 ** z),
  },
  nac: {
    id: "nac",
    nombre: "LROC NAC",
    zMin: 3,
    siempre: true, // se muestra a cualquier distancia: el mosaico global se deforma justo en el polo
    zDetalle: 5, // desde este nivel cubre toda su zona y pasa a ser la imagen que se informa
    zMax: 11,
    coberturaM: 136_526, // medio lado de la zona con datos
    latBorde: -85.5,
    url: (z, fila, col) => `${BASE_TREK}/SP/LRO_NAC_AvgMosaic_SPole855_1mp/1.0.0/default/default028mm/${z}/${fila}/${col}.png`,
    metrosPorPixel: (z) => SP_LADO_M / (PX * 2 ** z),
  },
};

/**
 * Opacidad del mosaico polar según la latitud, para que su borde se funda con el mosaico global en vez
 * de cortarse. Los dos mosaicos son productos distintos (el global tiene sombras duras cerca del polo y
 * el polar es un promedio suave), así que el borde sin fundir se ve como un disco.
 * - Niveles gruesos (cámara lejos): solo se usa el casquete al sur de ~88° S, que tapa la deformación
 *   del mosaico global en el polo.
 * - Niveles finos (cámara cerca): toda la cobertura, fundiendo los últimos 0,4° antes de 85,5° S.
 * @returns {number} 0 (no se ve) a 1 (opaco)
 */
export function opacidadPolar(z, lat) {
  const [afuera, adentro] = z <= 4 ? [-87.6, -88.4] : [-85.55, -85.95];
  const x = Math.max(0, Math.min(1, (lat - afuera) / (adentro - afuera)));
  return x * x * (3 - 2 * x);
}

/** Textura local del globo completo (nivel 3 del mismo mosaico WAC, 4096 px de ancho): respaldo sin red. */
export const BASE_METROS_POR_PIXEL = (2 * Math.PI * RADIO_M) / 4096;

// ---------- coordenadas ----------

/** lat, lon (grados, este positivo) → vector unitario [x, y, z]. Misma convención que latLonAVector de Globo.jsx. */
export function unitario(lat, lon) {
  const a = lat * RAD;
  const o = lon * RAD;
  return [Math.cos(a) * Math.cos(o), Math.sin(a), -Math.cos(a) * Math.sin(o)];
}

/** Estereográfica polar sur: lat, lon → [x, y] en metros. */
export function proyectarSur(lat, lon) {
  const r = 2 * RADIO_M * Math.tan(Math.PI / 4 + (lat * RAD) / 2);
  return [r * Math.sin(lon * RAD), r * Math.cos(lon * RAD)];
}

/** Inversa de proyectarSur: [x, y] en metros → { lat, lon } con lon en 0..360. */
export function invertirSur(x, y) {
  const lat = (2 * Math.atan(Math.hypot(x, y) / (2 * RADIO_M)) - Math.PI / 2) / RAD;
  const lon = ((Math.atan2(x, y) / RAD) % 360 + 360) % 360;
  return { lat, lon };
}

function separacionGrados(a, b) {
  const p = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(p) / RAD;
}

// ---------- límites de una tesela ----------

/** Tesela equirectangular → { lonOeste, latNorte, grados } */
export function limitesEq(z, fila, col) {
  const grados = 180 / 2 ** z;
  return { lonOeste: -180 + col * grados, latNorte: 90 - fila * grados, grados };
}

/** Tesela polar → { xOeste, yNorte, metros } en la proyección estereográfica polar sur */
export function limitesSur(z, fila, col) {
  const metros = SP_LADO_M / 2 ** z;
  return { xOeste: -SP_MEDIO_M + col * metros, yNorte: SP_MEDIO_M - fila * metros, metros };
}

/**
 * Grilla de (n+1)² puntos de la tesela sobre la esfera, de norte a sur y de oeste a este.
 * @returns {{ lat: number, lon: number, u: number, v: number }[]} v = 1 en el borde norte (imagen sin voltear)
 */
export function grillaTesela(t, n) {
  const puntos = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = 1 - j / n;
      if (t.capa === "wac") {
        const { lonOeste, latNorte, grados } = limitesEq(t.z, t.fila, t.col);
        puntos.push({ lat: latNorte - (j / n) * grados, lon: lonOeste + u * grados, u, v });
      } else {
        const { xOeste, yNorte, metros } = limitesSur(t.z, t.fila, t.col);
        puntos.push({ ...invertirSur(xOeste + u * metros, yNorte - (j / n) * metros), u, v });
      }
    }
  }
  return puntos;
}

// ---------- qué se ve ----------

/**
 * Radio angular (grados) del casquete visible desde una cámara que mira al centro de la Luna.
 * @param {number} distancia de la cámara al centro, en radios lunares (> 1)
 * @param {number} semiDiagonalRad mitad del campo visual medido en diagonal, en radianes
 */
export function casqueteVisible(distancia, semiDiagonalRad) {
  const horizonte = Math.acos(1 / distancia);
  const s = distancia * Math.sin(semiDiagonalRad);
  if (s >= 1) return horizonte / RAD; // la Luna entra entera en el cuadro: se ve hasta el limbo
  return Math.min(horizonte, Math.asin(s) - semiDiagonalRad) / RAD;
}

/** Nivel cuyo píxel de textura es parecido al píxel de pantalla (hasta ~1,5 veces más grueso). */
function nivelPara(capa, metrosPorPixelPantalla) {
  const z = Math.ceil(Math.log2(capa.metrosPorPixel(0) / metrosPorPixelPantalla) - 0.6);
  return Math.min(capa.zMax, z);
}

function teselasEq(sub, casquete, z, maximo) {
  const grados = 180 / 2 ** z;
  const filas = 2 ** z;
  const cols = 2 ** (z + 1);
  const f0 = Math.max(0, Math.floor((90 - (sub.lat + casquete)) / grados));
  const f1 = Math.min(filas - 1, Math.floor((90 - (sub.lat - casquete)) / grados));
  const tocaPolo = Math.abs(sub.lat) + casquete >= 90;
  const dLon = tocaPolo ? 180 : Math.asin(Math.min(1, Math.sin(casquete * RAD) / Math.cos(sub.lat * RAD))) / RAD;
  const c0 = Math.floor((sub.lon - dLon + 180) / grados);
  const c1 = dLon >= 180 ? c0 + cols - 1 : Math.floor((sub.lon + dLon + 180) / grados);
  const centro = unitario(sub.lat, sub.lon);
  const salida = [];
  for (let fila = f0; fila <= f1; fila++) {
    const latMedia = 90 - (fila + 0.5) * grados;
    if (90 - fila * grados <= CAPAS.wac.latSinDatos) continue;
    for (let k = c0; k <= c1; k++) {
      const col = ((k % cols) + cols) % cols;
      const lonMedia = -180 + (col + 0.5) * grados;
      if (separacionGrados(centro, unitario(latMedia, lonMedia)) > casquete + grados * 0.8) continue;
      if (salida.length >= maximo) return null;
      salida.push({ clave: `wac/${z}/${fila}/${col}`, capa: "wac", z, fila, col });
    }
  }
  return salida;
}

function teselasSur(sub, casquete, z, maximo) {
  const capa = CAPAS.nac;
  const metros = SP_LADO_M / 2 ** z;
  const [x0, y0] = proyectarSur(sub.lat, sub.lon);
  const alcance = casquete * RAD * RADIO_M * 1.15; // la proyección estira un poco lejos del polo
  const limitar = (v) => Math.max(-capa.coberturaM, Math.min(capa.coberturaM, v));
  const c0 = Math.floor((limitar(x0 - alcance) + SP_MEDIO_M) / metros);
  const c1 = Math.floor((limitar(x0 + alcance) + SP_MEDIO_M - 1e-6) / metros);
  const f0 = Math.floor((SP_MEDIO_M - limitar(y0 + alcance)) / metros);
  const f1 = Math.floor((SP_MEDIO_M - limitar(y0 - alcance) - 1e-6) / metros);
  const salida = [];
  for (let fila = f0; fila <= f1; fila++) {
    for (let col = c0; col <= c1; col++) {
      const cx = -SP_MEDIO_M + (col + 0.5) * metros;
      const cy = SP_MEDIO_M - (fila + 0.5) * metros;
      if (Math.hypot(cx - x0, cy - y0) > alcance + metros * 0.71) continue;
      if (salida.length >= maximo) return null;
      salida.push({ clave: `nac/${z}/${fila}/${col}`, capa: "nac", z, fila, col });
    }
  }
  return salida;
}

// Baja de nivel hasta que la cantidad de teselas entre en el presupuesto.
function elegir(funcion, capa, sub, casquete, zDeseado, maximo) {
  for (let z = zDeseado; z >= capa.zMin; z--) {
    const lista = funcion(sub, casquete, z, maximo);
    if (lista) return { z, lista };
  }
  return null;
}

/**
 * Teselas a mostrar para una posición de cámara.
 * @param {{ lat: number, lon: number }} sub punto de la Luna bajo la cámara
 * @param {number} distancia cámara–centro en radios lunares
 * @param {number} semiDiagonalRad mitad del campo visual diagonal
 * @param {number} metrosPorPixel tamaño en el terreno de un píxel de pantalla, mirando hacia abajo
 * @param {number} [maximo] teselas por capa y nivel
 * @returns {{ teselas: object[], capa: string, z: number, metrosPorPixel: number }}
 *   `teselas` incluye el nivel elegido y el anterior (que aparece primero mientras carga el fino);
 *   capa/z/metrosPorPixel describen la imagen más fina que se está mostrando bajo la cámara.
 */
export function teselasVisibles(sub, distancia, semiDiagonalRad, metrosPorPixel, maximo = 96) {
  const casquete = casqueteVisible(distancia, semiDiagonalRad);
  const teselas = [];
  let detalle = { capa: "wac", z: 3, metrosPorPixel: BASE_METROS_POR_PIXEL }; // sin teselas: textura local

  function sumar(funcion, capa) {
    const zDeseado = nivelPara(capa, metrosPorPixel);
    if (zDeseado < capa.zMin && !capa.siempre) return false;
    const fino = elegir(funcion, capa, sub, casquete, Math.max(capa.zMin, zDeseado), maximo);
    if (!fino || fino.lista.length === 0) return false;
    if (fino.z > capa.zMin) teselas.push(...(funcion(sub, casquete, fino.z - 1, maximo) ?? []));
    teselas.push(...fino.lista);
    // De lejos la capa "siempre" es un parche chico: el detalle que se informa sigue siendo el de la capa de abajo.
    if (zDeseado < (capa.zDetalle ?? capa.zMin)) return false;
    detalle = { capa: capa.id, z: fino.z, metrosPorPixel: capa.metrosPorPixel(fino.z) };
    return true;
  }

  // Si todo lo que se ve cae dentro del mosaico polar, el global no hace falta (y no se piden sus teselas).
  const hastaElBorde = 90 + sub.lat - (90 + CAPAS.nac.latBorde);
  if (hastaElBorde + casquete > -0.3) sumar(teselasEq, CAPAS.wac);
  // El mosaico polar solo si su zona entra en lo que se ve.
  const detalleWac = detalle;
  if (hastaElBorde < casquete && sumar(teselasSur, CAPAS.nac) && sub.lat > CAPAS.nac.latBorde) detalle = detalleWac;
  return { teselas, ...detalle };
}
