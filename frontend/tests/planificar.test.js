// Tests del asistente de planificación (ranking y preguntas rápidas): npm test (node:test, sin librerías).
// Usan los 13 sitios reales de public/anual (año 2027) y los perfiles de ejemplo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conMargenComunicacion, prepararSitio } from "../src/v2/calculo.js";
import { PERFIL_PERSONALIZADO, PERFILES } from "../src/v2/configEnergia.js";
import { evaluarLlegada, evaluarSitio, ordenarRanking, preguntaBateria, preguntaCerca, preguntaPrimera, preguntaPuestas, preguntaSemana, rankear, sitiosDeRegion } from "../src/v2/planificar.js";
import { DURACION_DEFECTO, PERFIL_PLAN, TOLERANCIA_DEFECTO, TOLERANCIA_MAX, ajustarSistema, alternarPlan, estadoInicialPlan, limitarDuracion, limitarTolerancia, perfilElegido, perfilesDelPlan, perfilParaApp } from "../src/v2/planificar.js";

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

// ---------- estado del planificador ----------
const APP = Object.freeze({ perfilId: "modulo-chico", sistema: Object.freeze({ ...PERFILES.find((p) => p.id === "modulo-chico").valores }), dia: 121 });

test("tolerancia libre de 0 a 30 días, precargada en 7; duración de 1 a 30, precargada en 14", () => {
  const inicial = estadoInicialPlan();
  assert.equal(inicial.tolerancia, TOLERANCIA_DEFECTO);
  assert.equal(TOLERANCIA_DEFECTO, 7);
  assert.equal(inicial.duracionDias, DURACION_DEFECTO);
  assert.equal(DURACION_DEFECTO, 14);
  assert.deepEqual([0, 5, 30, 45, -3, 2.6, "11", "abc"].map(limitarTolerancia), [0, 5, 30, TOLERANCIA_MAX, 0, 3, 11, TOLERANCIA_DEFECTO]);
  assert.deepEqual([0, 1, 14, 30, 31, "x"].map(limitarDuracion), [1, 1, 14, 30, 30, DURACION_DEFECTO]);
});

test("con una tolerancia cualquiera, la mejor llegada queda dentro de la ventana y de 2027", () => {
  for (const tolerancia of [0, 1, 5, 11, 30]) {
    for (const f of rankear(SITIOS, ROVER, { ...CASO, tolerancia })) {
      assert.ok(Math.abs(f.desvio) <= tolerancia, `${f.id}: desvío ${f.desvio} con ± ${tolerancia}`);
      assert.ok(f.dia >= 0 && f.dia <= 364);
    }
  }
  // Ventana de ± 5: Malapert sigue llegando el 16 (+2); con ± 1 ya no sobrevive y ofrece la primera fecha.
  assert.equal(fecha(evaluarSitio(sitio("malapert-massif"), ROVER, { ...CASO, tolerancia: 5 }).dia), "2027-03-16");
  const corta = evaluarSitio(sitio("malapert-massif"), ROVER, { ...CASO, tolerancia: 1 });
  assert.equal(corta.sobrevive, false);
  assert.equal(fecha(corta.primera), "2027-03-16");
});

test("el astronauta alterna: abre en Planificar, cierra desde cualquier pestaña y conserva respuestas y ranking", () => {
  const cerrado = estadoInicialPlan();
  const abierto = alternarPlan(cerrado, APP);
  assert.equal(abierto.abierto, true);
  assert.equal(abierto.pestana, "planificar");
  assert.equal(abierto.paso, "preguntas");
  assert.equal(abierto.dia, APP.dia);
  assert.equal(abierto.perfilId, "modulo-chico");

  // Con respuestas y ranking, en la pestaña Sitio: el astronauta cierra igual.
  const conRanking = { ...abierto, region: "todos", tolerancia: 11, paso: "ranking", ranking: { filas: [] }, abierta: "apollo-11", hilo: [{ id: "semana" }], pestana: "sitio" };
  const otraVez = alternarPlan(conRanking, APP);
  assert.equal(otraVez.abierto, false);
  // Al volver a abrir aparece todo como estaba, en el ranking y en la pestaña Planificar.
  const reabierto = alternarPlan(otraVez, { ...APP, dia: 300 });
  assert.equal(reabierto.abierto, true);
  assert.equal(reabierto.pestana, "planificar");
  assert.equal(reabierto.paso, "ranking");
  assert.deepEqual([reabierto.region, reabierto.tolerancia, reabierto.abierta, reabierto.dia], ["todos", 11, "apollo-11", APP.dia]);
  assert.equal(reabierto.ranking, conRanking.ranking);
  assert.equal(reabierto.hilo, conRanking.hilo);
});

test("el perfil personalizado de la app aparece como opción con los valores que tenía al abrir", () => {
  const propio = { ...APP.sistema, capacidadKWh: 9, paneles: 11 };
  const app = { perfilId: PERFIL_PERSONALIZADO, sistema: propio, dia: 10 };
  const abierto = alternarPlan(estadoInicialPlan(), app);
  const opcion = perfilesDelPlan(abierto).find((p) => p.id === PERFIL_PERSONALIZADO);
  assert.deepEqual(opcion.valores, propio);
  assert.equal(abierto.perfilId, PERFIL_PERSONALIZADO);
  propio.capacidadKWh = 99; // cambios posteriores en la app no se cuelan en el planificador
  assert.equal(perfilElegido(abierto).valores.capacidadKWh, 9);
  // Sin perfil personalizado en la app, la opción no está.
  assert.ok(!perfilesDelPlan(alternarPlan(estadoInicialPlan(), APP)).some((p) => p.id === PERFIL_PERSONALIZADO));
});

test("ajustar un valor crea el perfil del planificador y no toca la app ni los perfiles de la lista", () => {
  const roverAntes = structuredClone(ROVER);
  const abierto = { ...alternarPlan(estadoInicialPlan(), APP), perfilId: "rover" };
  const ajustado = ajustarSistema(abierto, { capacidadKWh: 40 });
  assert.equal(ajustado.perfilId, PERFIL_PLAN);
  assert.deepEqual(ajustado.sistemaPlan, { ...roverAntes, capacidadKWh: 40 }); // parte del perfil elegido
  assert.deepEqual(ROVER, roverAntes);
  assert.equal(APP.perfilId, "modulo-chico"); // APP está congelado: cualquier escritura habría fallado
  // Un segundo ajuste parte del perfil ya ajustado.
  const dos = ajustarSistema(ajustado, { paneles: 5 });
  assert.deepEqual([dos.sistemaPlan.capacidadKWh, dos.sistemaPlan.paneles], [40, 5]);
  assert.equal(perfilesDelPlan(dos).filter((p) => p.id === PERFIL_PLAN).length, 1);
  // El ranking usa los valores ajustados: con 40 kWh Connecting Ridge pasa a sobrevivir.
  const conBateria = evaluarSitio(sitio("connecting-ridge"), perfilElegido(dos).valores, CASO);
  assert.equal(conBateria.sobrevive, true);
  assert.equal(evaluarSitio(sitio("connecting-ridge"), ROVER, CASO).sobrevive, false);
  // "Ver en la app" lo aplica como el personalizado de la app, con una copia de los valores.
  const paraApp = perfilParaApp({ perfilId: PERFIL_PLAN, sistema: dos.sistemaPlan });
  assert.equal(paraApp.perfilId, PERFIL_PERSONALIZADO);
  assert.deepEqual(paraApp.sistema, dos.sistemaPlan);
  assert.notEqual(paraApp.sistema, dos.sistemaPlan);
  assert.equal(perfilParaApp({ perfilId: "rover", sistema: ROVER }).perfilId, "rover");
  // Cerrar y reabrir el planificador conserva el perfil ajustado.
  const reabierto = alternarPlan(alternarPlan({ ...dos, abierto: true }, APP), APP);
  assert.equal(reabierto.perfilId, PERFIL_PLAN);
  assert.equal(perfilElegido(reabierto).valores.capacidadKWh, 40);
});
