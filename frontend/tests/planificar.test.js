// Tests del asistente de planificación (ranking y preguntas rápidas): npm test (node:test, sin librerías).
// Usan los 13 sitios reales de public/anual (año 2027) y los perfiles de ejemplo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conMargenComunicacion, prepararSitio } from "../src/v2/calculo.js";
import { PERFILES } from "../src/v2/configEnergia.js";
import { evaluarLlegada, evaluarSitio, ordenarRanking, preguntaBateria, preguntaCerca, preguntaPrimera, preguntaPuestas, preguntaSemana, rankear, sitiosDeRegion } from "../src/v2/planificar.js";

const leerJson = (nombre) => JSON.parse(readFileSync(new URL(`../public/anual/${nombre}`, import.meta.url), "utf-8"));
const MARGEN_COMUNICACION_DEG = 0; // explícito: el ranking no depende del margen que esté puesto en la app
const SITIOS = leerJson("indice.json").sitios.map((s) => conMargenComunicacion(prepararSitio(leerJson(s.archivo)), MARGEN_COMUNICACION_DEG));
const sitio = (id) => SITIOS.find((s) => s.sitio.id === id);
const ROVER = PERFILES.find((p) => p.id === "rover").valores;
const dia = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse("2027-01-01T00:00:00Z")) / 86_400_000);
const fecha = (d) => new Date(Date.parse("2027-01-01T00:00:00Z") + d * 86_400_000).toISOString().slice(0, 10);
const CASO = { region: "polo", dia: dia("2027-03-14"), tolerancia: 3, duracionH: 10 * 24 };

test("caso conocido: rover, polo sur, 14 de marzo ± 3 días, 10 días -> solo Malapert sobrevive, llegando el 16", () => {
  for (const s of SITIOS) assert.equal(s.margenComunicacionDeg ?? 0, MARGEN_COMUNICACION_DEG);
  const ranking = rankear(SITIOS, ROVER, CASO);
  assert.deepEqual(ranking.map((f) => f.id).sort(), ["borde-de-gerlache", "borde-shackleton", "connecting-ridge", "im-1-odysseus", "malapert-massif"]);
  const sirven = ranking.filter((f) => f.sobrevive);
  assert.deepEqual(sirven.map((f) => f.id), ["malapert-massif"]);
  assert.equal(ranking[0].id, "malapert-massif");
  assert.equal(fecha(ranking[0].dia), "2027-03-16");
  assert.equal(ranking[0].desvio, 2);
  assert.equal(ranking[0].primera, ranking[0].dia);
});

test("la mejor llegada: primero que sobreviva, después batería mínima, contacto y cercanía a la fecha", () => {
  const malapert = sitio("malapert-massif");
  // El 16 y el 17 sobreviven con la batería al 100 %: gana el 16 por tener más contacto (y además está más cerca).
  const [d16, d17] = ["2027-03-16", "2027-03-17"].map((f) => evaluarLlegada(malapert, ROVER, dia(f), CASO.duracionH));
  assert.ok(d16.e.sobrevive && d17.e.sobrevive);
  assert.equal(d16.e.minimoPct, d17.e.minimoPct);
  assert.ok(d16.m.senalPct > d17.m.senalPct);
  assert.equal(evaluarLlegada(malapert, ROVER, dia("2027-03-15"), CASO.duracionH).e.sobrevive, false);
  // Con la fecha fija no sobrevive y ofrece la primera fecha que sí.
  const fija = evaluarSitio(malapert, ROVER, { ...CASO, tolerancia: 0 });
  assert.equal(fija.sobrevive, false);
  assert.equal(fija.desvio, 0);
  assert.equal(fecha(fija.primera), "2027-03-16");
  // A igual todo lo demás gana la llegada más cercana a la fecha elegida: Apollo 11 tiene luz y contacto plenos
  // todos esos días, así que se queda con la fecha elegida.
  const apolo = evaluarSitio(sitio("apollo-11"), ROVER, { ...CASO, tolerancia: 2 });
  assert.equal(apolo.sobrevive, true);
  assert.equal(apolo.desvio, 0);
});

test("orden del ranking: sobreviven por batería y contacto; los que no, por noche más corta y más luz", () => {
  const ranking = rankear(SITIOS, ROVER, CASO);
  const no = ranking.filter((f) => !f.sobrevive);
  assert.deepEqual(no.map((f) => f.id), ["connecting-ridge", "borde-shackleton", "borde-de-gerlache", "im-1-odysseus"]);
  for (let k = 1; k < no.length; k++) assert.ok(no[k - 1].m.nocheH <= no[k].m.nocheH);
  assert.ok(ranking.findIndex((f) => !f.sobrevive) > ranking.findLastIndex((f) => f.sobrevive));
  // Con datos armados a mano: batería mínima, después contacto; noche más corta, después luz.
  const fila = (id, sobrevive, minimoPct, senalPct, nocheH, luzPct) => ({ id, sobrevive, e: { minimoPct }, m: { senalPct, nocheH, luzPct } });
  const orden = ordenarRanking([fila("d", false, 0, 0, 50, 10), fila("b", true, 80, 90, 0, 0), fila("e", false, 0, 0, 50, 40), fila("a", true, 90, 10, 0, 0), fila("c", true, 80, 95, 0, 0), fila("f", false, 0, 0, 20, 5)]);
  assert.deepEqual(orden.map((f) => f.id), ["a", "c", "b", "f", "e", "d"]);
});

test("regiones y límites: polo sur es al sur de 80° S; las llegadas no salen de 2027", () => {
  assert.equal(sitiosDeRegion(SITIOS, "polo").length, 5);
  assert.ok(sitiosDeRegion(SITIOS, "polo").every((s) => s.sitio.lat <= -80));
  assert.equal(sitiosDeRegion(SITIOS, "todos").length, 13);
  assert.equal(rankear(SITIOS, ROVER, { ...CASO, region: "todos" }).length, 13);
  for (const d of [0, 364]) {
    for (const f of rankear(SITIOS, ROVER, { ...CASO, dia: d, tolerancia: 15 })) assert.ok(f.dia >= 0 && f.dia <= 364);
  }
});

test("preguntas rápidas sobre la llegada de la tarjeta (Malapert, 16 de marzo)", () => {
  const malapert = sitio("malapert-massif");
  const d = dia("2027-03-16");
  const semana = preguntaSemana(malapert, ROVER, d, CASO.duracionH);
  assert.equal(fecha(semana.dia), "2027-03-23");
  assert.deepEqual([semana.antes.sobrevive, semana.despues.sobrevive], [true, false]);
  assert.equal(semana.despues.nocheH, 25);
  assert.equal(preguntaSemana(malapert, ROVER, 360, CASO.duracionH).fuera, true);

  // Hay luz toda la misión: la capacidad mínima es 0 (la interfaz dice "alcanza de sobra", nunca "0 kWh").
  const bateria = preguntaBateria(malapert, ROVER, d, CASO.duracionH);
  assert.equal(bateria.capacidadMinimaKWh, 0);
  assert.equal(bateria.sobrevive, true);
  // Connecting Ridge el 14 de marzo no sobrevive: hace falta mucha más batería y ningún número de paneles alcanza.
  const falta = preguntaBateria(sitio("connecting-ridge"), ROVER, dia("2027-03-14"), CASO.duracionH);
  assert.equal(falta.sobrevive, false);
  assert.ok(falta.capacidadMinimaKWh > ROVER.capacidadKWh);
  assert.equal(falta.panelesMinimos, null);

  const puestas = preguntaPuestas(malapert, d);
  assert.deepEqual({ ...puestas, funciones: "" }, { funciones: "", solVisible: true, hSol: 383, tierraVisible: true, hTierra: 143, tierraNunca: false });
  assert.equal(preguntaPuestas(sitio("change-4"), d).tierraNunca, true);

  assert.equal(preguntaPrimera(malapert, ROVER, d, CASO.duracionH).dia, d);
  assert.equal(fecha(preguntaPrimera(malapert, ROVER, dia("2027-03-14"), CASO.duracionH).dia), "2027-03-16");

  const cerca = preguntaCerca(malapert, leerJson("vecindad-malapert-massif.json"), ROVER, d, CASO.duracionH);
  assert.equal(cerca.total, 121);
  assert.equal(cerca.viables, 41);
  assert.equal(cerca.pasoM, 400);
  assert.equal(cerca.esElSitio, true);
  assert.equal(cerca.mejor.viable, true);
});
