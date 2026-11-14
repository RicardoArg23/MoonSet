// Chequeo rápido de los textos: node scripts/probar-i18n.mjs
// 1. es.js y en.js tienen las mismas claves y los mismos {parámetros}.
// 2. Toda clave t("…") usada en src/v2 existe.
// 3. El formato de números, fechas y nombres da lo esperado en cada idioma.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { crearTraductor, IDIOMAS } from "../src/v2/i18n/traductor.js";
import { crearFormato } from "../src/v2/formato.js";

const V2 = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "v2");
const fallas = [];
const exigir = (ok, mensaje) => ok || fallas.push(mensaje);

function aplanar(nodo, prefijo = "", salida = {}) {
  for (const [clave, valor] of Object.entries(nodo)) {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    const esPlural = valor && typeof valor === "object" && !Array.isArray(valor) && "other" in valor;
    if (valor && typeof valor === "object" && !Array.isArray(valor) && !esPlural) aplanar(valor, ruta, salida);
    else salida[ruta] = valor;
  }
  return salida;
}
const parametros = (valor) => [...JSON.stringify(valor).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const es = aplanar(IDIOMAS.es);
const en = aplanar(IDIOMAS.en);
for (const clave of Object.keys(es)) {
  if (clave.startsWith("sitios.")) continue;
  exigir(clave in en, `falta en en.js: ${clave}`);
  if (clave in en) exigir(parametros(es[clave]) === parametros(en[clave]), `parámetros distintos en ${clave}`);
}
for (const clave of Object.keys(en)) if (!clave.startsWith("sitios.")) exigir(clave in es, `falta en es.js: ${clave}`);

// Claves usadas en el código. Las dinámicas (t(`vistas.${v}`)) se revisan por prefijo.
for (const archivo of readdirSync(V2).filter((a) => a.endsWith(".jsx") || a === "formato.js")) {
  const fuente = readFileSync(join(V2, archivo), "utf8");
  for (const [, clave] of fuente.matchAll(/\bt\(\s*"([\w.]+)"/g)) exigir(clave in es, `${archivo}: clave inexistente ${clave}`);
  for (const [, a, b] of fuente.matchAll(/\?\s*"(\w+\.\w+)"\s*:\s*"(\w+\.\w+)"/g)) {
    exigir(a in es, `${archivo}: clave inexistente ${a}`);
    exigir(b in es, `${archivo}: clave inexistente ${b}`);
  }
}
for (const vista of ["globo", "mapa", "horizonte", "alrededores", "comparar"]) exigir(`vistas.${vista}` in es, `falta vistas.${vista}`);

const igual = (obtenido, esperado, que) => exigir(obtenido === esperado, `${que}: esperaba "${esperado}", dio "${obtenido}"`);
const dosDeMayo = Date.UTC(2027, 4, 2);
const sitio = { id: "borde-shackleton", nombre: "Borde de Shackleton", lat: -89.78, lon: 204.27 };
const propio = { id: "coord:-88.8000,125.0000", nombre: "x", categoria: "personalizado", lat: -88.8, lon: 125 };

const tEs = crearTraductor("es");
const fEs = crearFormato(tEs);
igual(fEs.num(1234.5, 1), "1.234,5", "es num");
igual(fEs.fechaLarga(dosDeMayo), "2 de mayo", "es fechaLarga");
igual(fEs.meses.join(" "), "ene feb mar abr may jun jul ago sep oct nov dic", "es meses");
igual(fEs.coordenadas(sitio), "89,78° S · 204,27° E", "es coordenadas");
igual(fEs.conSigno(-1.5, 1), "−1,5", "es conSigno");
igual(fEs.cardinal(270), "O", "es cardinal");
igual(fEs.rumbo(-90), "el oeste", "es rumbo");
igual(fEs.duracion(48), "48 h", "es duracion corta");
igual(fEs.duracion(84), "3,5 días", "es duracion larga");
igual(fEs.nombreCorto(sitio), "Borde de Shackleton", "es nombre (cae al de los datos)");
igual(fEs.nombreSitio(propio), "Punto propio 88,80° S · 125,00° E", "es punto propio");
igual(tEs("panel.esperarDetalle", { n: 1, pct: 40 }), "1 día más · batería mínima 40 %", "es singular");
igual(tEs("panel.esperarDetalle", { n: 3, pct: 40 }), "3 días más · batería mínima 40 %", "es plural");
igual(tEs("no.existe"), "no.existe", "clave inexistente");

const tEn = crearTraductor("en");
const fEn = crearFormato(tEn);
igual(fEn.num(1234.5, 1), "1,234.5", "en num");
igual(fEn.fechaLarga(dosDeMayo), "May 2", "en fechaLarga");
igual(fEn.meses.join(" "), "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", "en meses");
igual(fEn.cardinal(270), "W", "en cardinal");
igual(fEn.duracion(84), "3.5 days", "en duracion larga");
igual(fEn.nombreCorto(sitio), "Shackleton rim", "en nombre");
igual(tEn("panel.esperarDetalle", { n: 1, pct: 40 }), "1 more day · lowest charge 40%", "en singular");

if (fallas.length) {
  console.error(`i18n: ${fallas.length} problema(s)\n- ${fallas.join("\n- ")}`);
  process.exit(1);
}
console.log(`i18n: ${Object.keys(es).length} claves, es y en completos; formato correcto.`);
