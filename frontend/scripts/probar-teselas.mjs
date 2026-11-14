// Chequeo numérico de las teselas del globo: node scripts/probar-teselas.mjs
// Proyección polar, ubicación de teselas, orientación de las caras y selección según la cámara.
import {
  CAPAS, RADIO_M, casqueteVisible, grillaTesela, invertirSur, limitesEq, limitesSur, opacidadPolar, proyectarSur, teselasVisibles, unitario,
} from "../src/v2/globo/teselas.js";

const fallas = [];
const exigir = (ok, mensaje) => ok || fallas.push(mensaje);
const cerca = (a, b, tolerancia, que) => exigir(Math.abs(a - b) <= tolerancia, `${que}: esperaba ${b} ± ${tolerancia}, dio ${a}`);

// 1. Proyección estereográfica polar sur (misma que backend/app/horizonte.py y skill lunar-data).
cerca(Math.hypot(...proyectarSur(-90, 0)), 0, 1e-6, "el polo cae en el origen");
const [x80, y80] = proyectarSur(-80, 0);
cerca(x80, 0, 1e-6, "lon 0° cae sobre el eje y");
cerca(y80, 2 * RADIO_M * Math.tan((5 * Math.PI) / 180), 1e-3, "radio a 80° S (304 006 m, extensión del DEM de 80 m)");
const [x90e] = proyectarSur(-85, 90);
exigir(x90e > 0, "lon 90° E cae hacia +x");
const [xs, ys] = proyectarSur(-89.67, 129); // cráter Shackleton
exigir(xs > 0 && ys < 0, "Shackleton queda en el cuadrante +x, −y");
cerca(Math.hypot(xs, ys), 10_000, 150, "Shackleton a ~10 km del polo");
for (const [lat, lon] of [[-89.45, 222.69], [-86, 2.9], [-88.71, 291.9], [-87.3, 180]]) {
  const vuelta = invertirSur(...proyectarSur(lat, lon));
  cerca(vuelta.lat, lat, 1e-9, `ida y vuelta lat ${lat}`);
  cerca(vuelta.lon, lon, 1e-9, `ida y vuelta lon ${lon}`);
}

// 2. Límites de teselas.
const eq0 = limitesEq(0, 0, 0);
exigir(eq0.lonOeste === -180 && eq0.latNorte === 90 && eq0.grados === 180, "tesela EQ 0/0/0 cubre el hemisferio oeste");
const eq8 = limitesEq(8, 255, 511);
cerca(eq8.latNorte - eq8.grados, -90, 1e-9, "última fila EQ termina en el polo sur");
cerca(eq8.lonOeste + eq8.grados, 180, 1e-9, "última columna EQ termina en 180°");
const sur9 = limitesSur(9, 256, 256);
cerca(sur9.xOeste, 0, 1e-6, "tesela polar 9/256/256 arranca en el polo (x)");
cerca(sur9.yNorte, 0, 1e-6, "tesela polar 9/256/256 arranca en el polo (y)");
cerca(CAPAS.nac.metrosPorPixel(11), 4.18, 0.01, "mosaico polar: 4,18 m por píxel en el nivel 11");
cerca(CAPAS.wac.metrosPorPixel(8), 83.3, 0.1, "mosaico global: 83 m por píxel en el nivel 8");

// 3. Grilla: esquinas correctas y caras hacia afuera en las dos capas.
function caraHaciaAfuera(t) {
  const n = 2;
  const p = grillaTesela(t, n).map((q) => unitario(q.lat, q.lon));
  const [a, b, c] = [p[0], p[1], p[n + 1]]; // a b / c: el triángulo (a, c, b) de Teselas.jsx
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2] > 0;
}
exigir(caraHaciaAfuera({ capa: "wac", z: 5, fila: 10, col: 20 }), "caras EQ hacia afuera (hemisferio norte)");
exigir(caraHaciaAfuera({ capa: "wac", z: 8, fila: 250, col: 300 }), "caras EQ hacia afuera (cerca del polo sur)");
exigir(caraHaciaAfuera({ capa: "nac", z: 9, fila: 254, col: 258 }), "caras polares hacia afuera");
const g = grillaTesela({ capa: "nac", z: 9, fila: 256, col: 256 }, 4);
cerca(g[0].lat, -90, 1e-9, "primer punto de la tesela polar 9/256/256 es el polo");
exigir(g[0].u === 0 && g[0].v === 1, "el borde norte de la imagen lleva v = 1");
exigir(g.at(-1).lat > -90 && g.at(-1).lon > 90 && g.at(-1).lon < 180, "la tesela 9/256/256 se abre hacia +x, −y (lon 90°–180°)");

// 3b. Fundido del borde del mosaico polar.
exigir(opacidadPolar(9, -89.45) === 1 && opacidadPolar(9, -86) === 1, "de cerca, Connecting Ridge y Malapert (86° S) quedan opacos");
exigir(opacidadPolar(9, -85.5) === 0, "de cerca, el borde de la cobertura (85,5° S) es transparente");
exigir(opacidadPolar(3, -87) === 0 && opacidadPolar(3, -89) === 1, "de lejos solo se ve el casquete al sur de ~88° S");
exigir(opacidadPolar(3, -88) > 0 && opacidadPolar(3, -88) < 1, "de lejos el borde del casquete es gradual");

// 4. Selección según la cámara (campo visual de 35° en una ventana de 1000 × 700).
const medioFov = (17.5 * Math.PI) / 180;
const semiDiagonal = Math.atan(Math.tan(medioFov) * Math.hypot(1, 1000 / 700));
const pixel = (altura) => ((altura * 2 * Math.tan(medioFov)) / 700) * RADIO_M;
cerca(casqueteVisible(4.5, semiDiagonal), (Math.acos(1 / 4.5) * 180) / Math.PI, 1e-9, "de lejos se ve hasta el limbo");
exigir(casqueteVisible(1.012, semiDiagonal) < 1, "a 21 km de altura se ve menos de 1° de casquete");

const lejosNorte = teselasVisibles({ lat: 30, lon: 10 }, 4.5, semiDiagonal, pixel(3.5));
exigir(lejosNorte.teselas.length === 0 && lejosNorte.capa === "wac" && lejosNorte.z === 3, "con la Luna entera en cuadro alcanza la textura local (nivel 3 del mismo mosaico)");
const lejos = teselasVisibles({ lat: -70, lon: 220 }, 4.5, semiDiagonal, pixel(3.5));
exigir(lejos.capa === "wac" && lejos.z === 3, "de lejos el detalle informado es el de la textura local");
exigir(lejos.teselas.length > 0 && lejos.teselas.length <= 16 && lejos.teselas.every((t) => t.capa === "nac" && t.z === 3), `de lejos, con el polo sur a la vista, solo el parche polar (${lejos.teselas.length} teselas)`);
const medio = teselasVisibles({ lat: -70, lon: 220 }, 1.6, semiDiagonal, pixel(0.6));
exigir(medio.capa === "wac" && medio.z >= 4 && medio.teselas.some((t) => t.capa === "wac"), `a media altura, mosaico global más fino que la textura local (nivel ${medio.z})`);

const sitio = { lat: -89.45, lon: 222.69 }; // Connecting Ridge
const deCerca = teselasVisibles(sitio, 1.012, semiDiagonal, pixel(0.012));
exigir(deCerca.capa === "nac", `sobre el polo manda el mosaico NAC (dio ${deCerca.capa})`);
exigir(deCerca.metrosPorPixel < 40, `detalle fino sobre el sitio (${deCerca.metrosPorPixel.toFixed(1)} m/px)`);
exigir(deCerca.teselas.length > 0 && deCerca.teselas.length <= 200, `cantidad razonable de teselas (${deCerca.teselas.length})`);
const [sx, sy] = proyectarSur(sitio.lat, sitio.lon);
exigir(
  deCerca.teselas.some((t) => {
    if (t.capa !== "nac" || t.z !== deCerca.z) return false;
    const l = limitesSur(t.z, t.fila, t.col);
    return sx >= l.xOeste && sx < l.xOeste + l.metros && sy <= l.yNorte && sy > l.yNorte - l.metros;
  }),
  "alguna tesela fina contiene al sitio"
);
exigir(new Set(deCerca.teselas.map((t) => t.clave)).size === deCerca.teselas.length, "sin teselas repetidas");
exigir(deCerca.teselas.every((t) => t.capa === "nac"), "dentro del mosaico polar no se pide el global");
const bordePolar = teselasVisibles({ lat: -86, lon: 2.9 }, 1.012, semiDiagonal, pixel(0.012)); // Macizo Malapert
exigir(bordePolar.capa === "nac" && bordePolar.teselas.some((t) => t.capa === "nac"), "Malapert (86° S) usa el mosaico polar");
const casiPolar = teselasVisibles({ lat: -84, lon: 40 }, 1.05, semiDiagonal, pixel(0.05));
exigir(casiPolar.capa === "wac" && casiPolar.teselas.some((t) => t.capa === "wac"), "a 84° S, fuera del mosaico polar, manda el global");
exigir(casiPolar.teselas.filter((t) => t.capa === "wac").every((t) => limitesEq(t.z, t.fila, t.col).latNorte > -87), "no se piden teselas globales al sur de 87° S");

const ecuador = teselasVisibles({ lat: 0.67, lon: 23.47 }, 1.05, semiDiagonal, pixel(0.05)); // Apollo 11
exigir(ecuador.capa === "wac" && ecuador.teselas.every((t) => t.capa === "wac"), "en el ecuador solo hay mosaico global");
exigir(
  ecuador.teselas.some((t) => {
    const l = limitesEq(t.z, t.fila, t.col);
    return t.z === ecuador.z && 23.47 >= l.lonOeste && 23.47 < l.lonOeste + l.grados && 0.67 <= l.latNorte && 0.67 > l.latNorte - l.grados;
  }),
  "alguna tesela global contiene a Apollo 11"
);
const antimeridiano = teselasVisibles({ lat: -45, lon: 179.9 }, 1.05, semiDiagonal, pixel(0.05));
exigir(antimeridiano.teselas.every((t) => t.col >= 0 && t.col < 2 ** (t.z + 1)), "columnas válidas al cruzar el meridiano 180°");
exigir(new Set(antimeridiano.teselas.map((t) => t.col)).size > 1, "se piden teselas a ambos lados del meridiano 180°");

if (fallas.length) {
  console.error(`teselas: ${fallas.length} problema(s)\n- ${fallas.join("\n- ")}`);
  process.exit(1);
}
console.log(`teselas: correcto. Sobre Connecting Ridge: ${deCerca.teselas.length} teselas, ${deCerca.metrosPorPixel.toFixed(1)} m/px (${deCerca.capa} nivel ${deCerca.z}).`);
