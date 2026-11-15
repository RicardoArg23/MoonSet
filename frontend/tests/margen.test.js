// Tests del margen mínimo para comunicación: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conMargenComunicacion, evaluarMision, hayContacto, porDia, prepararSitio } from "../src/v2/calculo.js";
import { PERFILES } from "../src/v2/configEnergia.js";
import { evaluarVecindadEnergia } from "../src/v2/energia.js";
import { csvMision } from "../src/v2/exportar.js";

const leerJson = (nombre) => JSON.parse(readFileSync(new URL(`../public/anual/${nombre}`, import.meta.url), "utf-8"));
const crudoReal = leerJson("connecting-ridge.json");
const MARGENES = [0, 0.5, 1, 2, 3, 5, 7.5, 10];
const sumar = (serie) => serie.reduce((a, b) => a + b, 0);

test("con margen 0 todo queda igual que antes: el mismo sitio y la señal de siempre (margen > 0)", () => {
  const sitio = prepararSitio(crudoReal);
  assert.equal(conMargenComunicacion(sitio, 0), sitio);
  // El criterio de antes, escrito aparte.
  for (let i = 0; i < sitio.muestras; i++) assert.equal(sitio.senal[i], sitio.margenTierra[i] > 0 ? 1 : 0);
  assert.equal(hayContacto(0, 0), 0);
  assert.equal(hayContacto(0.01, 0), 1);
});

test("con margen, hay contacto solo si la Tierra supera el relieve por al menos ese margen", () => {
  assert.equal(hayContacto(1.99, 2), 0);
  assert.equal(hayContacto(2, 2), 1);
  assert.equal(hayContacto(-1, 0), 0);
  const sitio = conMargenComunicacion(prepararSitio(crudoReal), 2);
  assert.equal(sitio.margenComunicacionDeg, 2);
  for (let i = 0; i < sitio.muestras; i++) assert.equal(sitio.senal[i], sitio.margenTierra[i] >= 2 ? 1 : 0);
});

test("al subir el margen el contacto nunca sube, hora por hora ni en %", () => {
  const base = prepararSitio(crudoReal);
  let anterior = null;
  for (const m of MARGENES) {
    const s = conMargenComunicacion(base, m);
    if (anterior) {
      for (let i = 0; i < s.muestras; i++) assert.ok(s.senal[i] <= anterior.senal[i]);
      for (const d of [0, 121, 250]) {
        assert.ok(evaluarMision(s, d * 24, 14 * 24).senalPct <= evaluarMision(anterior, d * 24, 14 * 24).senalPct);
      }
    }
    anterior = s;
  }
});

test("la franja de fechas usa la señal con margen, sin mezclar memorias entre márgenes", () => {
  const base = prepararSitio(crudoReal);
  const p0 = porDia(base, 14 * 24);
  const p5 = porDia(conMargenComunicacion(base, 5), 14 * 24);
  assert.notEqual(p0, p5);
  for (let d = 0; d < p0.dias; d++) assert.ok(p5.senalPct[d] <= p0.senalPct[d]);
  assert.equal(porDia(base, 14 * 24), p0);
  assert.equal(conMargenComunicacion(base, 5), conMargenComunicacion(base, 5)); // se memoriza
});

test("alrededores: el contacto de cada punto tampoco sube con el margen, y la luz no cambia", () => {
  const base = prepararSitio(crudoReal);
  const vecindad = leerJson("vecindad-connecting-ridge.json");
  const sistema = PERFILES[0].valores;
  const c0 = evaluarVecindadEnergia(base, vecindad, sistema, 121 * 24, 14 * 24);
  const c2 = evaluarVecindadEnergia(conMargenComunicacion(base, 2), vecindad, sistema, 121 * 24, 14 * 24);
  c0.forEach((c, k) => {
    assert.ok(c2[k].contactoPct <= c.contactoPct);
    assert.equal(c2[k].luzPct, c.luzPct);
    assert.equal(c2[k].minimoPct, c.minimoPct);
  });
});

test("el CSV usa la señal con margen y lo anota en los metadatos", () => {
  const base = prepararSitio(crudoReal);
  const args = { sistema: PERFILES[0].valores, perfil: PERFILES[0], i0: 121 * 24, duracionH: 14 * 24 };
  const contacto = (csv) => {
    const lineas = csv.split("\r\n").filter((l) => l && !l.startsWith("#"));
    const col = lineas[0].split(",").indexOf("contacto");
    return sumar(lineas.slice(1).map((l) => Number(l.split(",")[col])));
  };
  const csv0 = csvMision({ sitio: base, ...args });
  const csv5 = csvMision({ sitio: conMargenComunicacion(base, 5), ...args });
  assert.ok(csv0.includes("# margen_comunicacion_deg: 0\r\n"));
  assert.ok(csv5.includes("# margen_comunicacion_deg: 5\r\n"));
  assert.ok(contacto(csv5) <= contacto(csv0));
});
