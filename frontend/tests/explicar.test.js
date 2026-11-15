// Tests de las explicaciones del veredicto: npm test (node:test, sin librerías).
// Un caso por regla, con sitios reales de public/anual (año 2027) y los perfiles de ejemplo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conMargenComunicacion, prepararSitio } from "../src/v2/calculo.js";
import { PERFILES } from "../src/v2/configEnergia.js";
import { elevacionMaxTierra, explicar, horasNocheCubiertas, MAX_FRASES, textoExplicacion } from "../src/v2/explicar.js";
import { evaluarLlegada } from "../src/v2/planificar.js";
import { crearTraductor } from "../src/v2/i18n/traductor.js";
import { crearFormato } from "../src/v2/formato.js";

const leer = (id) => prepararSitio(JSON.parse(readFileSync(new URL(`../public/anual/${id}.json`, import.meta.url), "utf-8")));
const SITIOS = Object.fromEntries(["connecting-ridge", "change-4", "apollo-11", "malapert-massif"].map((id) => [id, leer(id)]));
const sistema = (id) => PERFILES.find((p) => p.id === id).valores;
const ROVER = sistema("rover");
const CHICO = sistema("modulo-chico");
const DURACION_H = 240;
const dia = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse("2027-01-01T00:00:00Z")) / 86_400_000);

/** explicar() para un sitio, un sistema y una llegada (00:00 UTC), más el resultado crudo para comparar números. */
function caso(sitio, sis, fecha, perfilVista = "planificar") {
  const llegada = evaluarLlegada(sitio, sis, dia(fecha), DURACION_H);
  const frases = explicar({ m: llegada.m, e: llegada.e, sistema: sis }, sitio, perfilVista);
  return { frases, reglas: frases.map((x) => x.regla), de: (regla) => frases.find((x) => x.regla === regla), ...llegada };
}
const cerca = (obtenido, esperado, tolerancia = 0.01) => assert.ok(Math.abs(obtenido - esperado) <= tolerancia, `esperaba ${esperado}, dio ${obtenido}`);

test("horas de noche que cubre la batería: usable × (1 − reserva) × √eficiencia / consumo de noche", () => {
  // Rover: 4 kWh Li-S (eficiencia 80 %), reserva 20 %, sin redundancia, 0,08 + 0,10 kW de noche.
  cerca(horasNocheCubiertas(ROVER), (4 * 0.8 * Math.sqrt(0.8)) / 0.18, 1e-9);
  cerca(horasNocheCubiertas(ROVER), 15.9, 0.01);
  // La redundancia achica la capacidad usable.
  cerca(horasNocheCubiertas({ ...ROVER, redundanciaPct: 100 }), 15.9 / 2, 0.01);
  assert.equal(horasNocheCubiertas({ ...ROVER, potenciaMinimaKW: 0, calefaccionKW: 0 }), Infinity);
});

test("las horas que cubre coinciden con la hora en que la simulación falla al llegar de noche (no con autonomiaH)", () => {
  // Apollo 11, 2 de mayo: se llega de noche y la noche sigue 228 h. La batería se agota en la hora 16.
  const sitio = SITIOS["apollo-11"];
  const c = caso(sitio, ROVER, "2027-05-02");
  assert.equal(sitio.luz[dia("2027-05-02") * 24], 0);
  assert.equal(c.e.horaFalla, 15); // índice desde 0: falla durante la hora 16
  assert.equal(Math.floor(horasNocheCubiertas(ROVER)), c.e.horaFalla);
  assert.ok(c.e.autonomiaH > 22, "autonomiaH no descuenta reserva ni eficiencia: diría 22 h");
});

test("regla 1, no sobrevive: la noche más larga contra las horas que cubre la batería", () => {
  const c = caso(SITIOS["connecting-ridge"], ROVER, "2027-03-14");
  assert.equal(c.e.sobrevive, false);
  assert.equal(c.reglas[0], "noSobrevive");
  assert.equal(c.de("noSobrevive").params.noche, 141);
  assert.equal(c.de("noSobrevive").params.noche, c.m.nocheH);
  cerca(c.de("noSobrevive").params.cubre, 15.9);
});

test("regla 1, variantes: sin noche, o con una noche que la batería sí cubre, no se culpa a la noche", () => {
  // Connecting Ridge, 22 de febrero: luz toda la misión pero el Sol asoma apenas y los paneles no alcanzan.
  const sinNoche = caso(SITIOS["connecting-ridge"], ROVER, "2027-02-22");
  assert.equal(sinNoche.m.nocheH, 0);
  assert.equal(sinNoche.reglas[0], "noSobreviveConLuz");
  assert.equal(sinNoche.de("noSobreviveConLuz").params.falla, sinNoche.e.horaFalla + 1);
  // Malapert, módulo chico, 14 de marzo: noche de 36 h, la batería cubre 38 h, y aun así falla a las 37 h.
  const penumbra = caso(SITIOS["malapert-massif"], CHICO, "2027-03-14");
  assert.equal(penumbra.reglas[0], "noSobrevivePenumbra");
  assert.deepEqual({ ...penumbra.de("noSobrevivePenumbra").params, cubre: 0 }, { noche: 36, cubre: 0, falla: 37 });
  assert.ok(penumbra.de("noSobrevivePenumbra").params.cubre > 36);
});

test("regla 2, sin contacto: en la cara oculta la Tierra nunca supera 0° en 2027", () => {
  const sitio = SITIOS["change-4"];
  const c = caso(sitio, CHICO, "2027-05-02");
  assert.deepEqual(c.reglas, ["sinContacto", "luzToda", "aproximado"]);
  cerca(c.de("sinContacto").params.el, -37.73);
  assert.equal(c.de("sinContacto").params.el, elevacionMaxTierra(sitio));
  assert.ok(Math.max(...sitio.tierra_el) < 0);
  assert.equal(c.m.senalPct, 0);
});

test("regla 3, contacto parcial: lleva el % y nombra el relieve solo al sur de 80° S", () => {
  const polar = caso(SITIOS["malapert-massif"], ROVER, "2027-03-16");
  assert.equal(polar.reglas[0], "contactoParcialRelieve");
  cerca(polar.de("contactoParcialRelieve").params.pct, 59.58);
  assert.equal(polar.de("contactoParcialRelieve").params.pct, polar.m.senalPct);
  // Apollo 11 tiene la Tierra siempre a la vista: sin margen no hay frase de contacto.
  assert.ok(!caso(SITIOS["apollo-11"], ROVER, "2027-03-14").reglas.some((r) => r.startsWith("contacto")));
  // Con un margen de comunicación por encima de la elevación de la Tierra en esa misión, el contacto es parcial
  // y, al norte de 80° S, no se menciona el relieve.
  const conMargen = conMargenComunicacion(SITIOS["apollo-11"], 73);
  const ecuatorial = caso(conMargen, ROVER, "2027-03-14");
  assert.equal(ecuatorial.reglas[0], "contactoParcial");
  assert.equal(ecuatorial.de("contactoParcial").params.pct, ecuatorial.m.senalPct);
  assert.ok(ecuatorial.m.senalPct < 100);
});

test("regla 4, Sol rasante: elevación máxima por debajo de 5°", () => {
  const c = caso(SITIOS["malapert-massif"], ROVER, "2027-03-16");
  assert.ok(c.reglas.includes("solRasante"));
  cerca(c.de("solRasante").params.el, 2.94);
  assert.equal(c.de("solRasante").params.el, c.m.elMax);
  // Apollo 11 en marzo tiene el Sol casi en el cenit.
  assert.ok(!caso(SITIOS["apollo-11"], ROVER, "2027-03-14").reglas.includes("solRasante"));
});

test("regla 5, luz toda la misión", () => {
  const c = caso(SITIOS["apollo-11"], ROVER, "2027-03-14");
  assert.equal(c.e.sobrevive, true);
  assert.equal(c.m.nocheH, 0);
  assert.deepEqual(c.reglas, ["luzToda"]); // sitio con coordenadas exactas: no hay más que decir
});

test("regla 5, sobrevive con poco margen: batería mínima por debajo del 40 %", () => {
  const c = caso(SITIOS["apollo-11"], CHICO, "2027-01-12");
  assert.equal(c.e.sobrevive, true);
  assert.deepEqual(c.reglas, ["pocoMargen"]);
  cerca(c.de("pocoMargen").params.minimo, 35.05);
  assert.equal(c.de("pocoMargen").params.minimo, c.e.minimoPct);
  assert.equal(c.de("pocoMargen").params.reserva, 20);
});

test("regla 6, coordenadas aproximadas: solo en los sitios marcados", () => {
  assert.equal(caso(SITIOS["change-4"], CHICO, "2027-05-02").reglas.at(-1), "aproximado");
  assert.ok(!caso(SITIOS["apollo-11"], CHICO, "2027-05-02").reglas.includes("aproximado"));
});

test("devuelve como mucho tres frases, en orden de prioridad", () => {
  // Connecting Ridge cumple cuatro reglas (no sobrevive, contacto parcial, Sol rasante, aproximado): la última se corta.
  const c = caso(SITIOS["connecting-ridge"], ROVER, "2027-03-14");
  assert.equal(c.frases.length, MAX_FRASES);
  assert.deepEqual(c.reglas, ["noSobrevive", "contactoParcialRelieve", "solRasante"]);
  assert.equal(SITIOS["connecting-ridge"].sitio.aproximado, true);
});

test("los textos existen en es y en, en lenguaje simple y con cifras, y llevan el número real", () => {
  const fechas = [["connecting-ridge", ROVER, "2027-03-14"], ["connecting-ridge", ROVER, "2027-02-22"], ["malapert-massif", CHICO, "2027-03-14"], ["change-4", CHICO, "2027-05-02"], ["malapert-massif", ROVER, "2027-03-16"], ["apollo-11", CHICO, "2027-01-12"]];
  for (const idioma of ["es", "en"]) {
    const t = crearTraductor(idioma);
    const { num } = crearFormato(t);
    for (const perfilVista of ["explorar", "planificar"]) {
      for (const [id, sis, fecha] of fechas) {
        for (const frase of caso(SITIOS[id], sis, fecha, perfilVista).frases) {
          const texto = textoExplicacion(frase, t, num);
          assert.notEqual(texto, frase.clave, `falta ${frase.clave} en ${idioma}`);
          assert.ok(!/[{}]/.test(texto), `quedó un parámetro sin reemplazar: ${texto}`);
        }
      }
    }
  }
  const t = crearTraductor("es");
  const { num } = crearFormato(t);
  const [noSobrevive, contacto, rasante] = caso(SITIOS["connecting-ridge"], ROVER, "2027-03-14").frases.map((x) => textoExplicacion(x, t, num));
  assert.match(noSobrevive, /141 h/);
  assert.match(noSobrevive, /unas 15 h/); // 15,9 h redondeado hacia abajo: nunca se promete de más
  assert.match(contacto, /56,3 %/);
  assert.match(rasante, /−1,1°/);
  const simple = textoExplicacion(caso(SITIOS["connecting-ridge"], ROVER, "2027-03-14", "explorar").frases[1], t, num);
  assert.match(simple, /el 56 %/);
});
