// Tests de la sección "Próximamente": npm test (node:test, sin librerías).
// Son placeholders honestos: tienen que estar los tres modelos en los dos idiomas y ninguno puede mostrar
// resultados, niveles de riesgo ni valores de ejemplo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS_MODELOS, MODELOS, PARTES, contenidoModal, contenidoModelo } from "../src/v2/proximamente.js";
import { crearTraductor, IDIOMAS } from "../src/v2/i18n/traductor.js";
import { BLOQUES, configDePerfil } from "../src/v2/ajustes.js";

const IDIOMAS_APP = ["es", "en"];
const PERFILES = ["explorar", "planificar"];

/** Todos los textos que el modal muestra de un modelo (o del modal entero), como lista de cadenas. */
const textosDeModelo = (m) => [m.nombre, m.prioridad, m.estado, m.pregunta, ...m.partes.flatMap((p) => [p.rotulo, p.texto]), m.formula?.leyenda].filter(Boolean);
const textosDelModal = (c) => [c.titulo, c.subtitulo, c.nota, ...c.modelos.flatMap(textosDeModelo)];
/** Todas las cadenas de la sección proximamente del diccionario, incluidas las de la franja, el cajón y Sistema. */
function aplanar(nodo) {
  return typeof nodo === "string" ? [nodo] : Object.values(nodo).flatMap(aplanar);
}

test("el modal tiene los tres modelos, en orden de prioridad, en los dos idiomas y los dos perfiles", () => {
  assert.deepEqual(IDS_MODELOS, ["termico", "radiacion", "micrometeoritos"]);
  assert.deepEqual(MODELOS.map((m) => m.prioridad), [1, 2, 3]);
  for (const idioma of IDIOMAS_APP) {
    const t = crearTraductor(idioma);
    for (const perfil of PERFILES) {
      const modal = contenidoModal(t, perfil);
      assert.deepEqual(modal.modelos.map((m) => m.id), IDS_MODELOS);
      for (const texto of textosDelModal(modal)) {
        assert.ok(texto.trim().length > 0);
        assert.ok(!texto.startsWith("proximamente."), `falta la clave ${texto} en ${idioma}`);
        assert.ok(!/\{\w+\}/.test(texto), `quedó un parámetro sin reemplazar: ${texto}`);
      }
    }
  }
  // El inglés está traducido de verdad: no cae al español.
  const [es, en] = IDIOMAS_APP.map((i) => textosDelModal(contenidoModal(crearTraductor(i), "planificar")));
  es.forEach((texto, k) => assert.notEqual(texto, en[k]));
});

test("explorar muestra la pregunta simple y un párrafo; planificar, el detalle con datos y la fórmula", () => {
  const t = crearTraductor("es");
  const simples = { termico: "¿Se congela la batería?", radiacion: "¿Cuánta radiación recibe?", micrometeoritos: "¿Lo puede dañar un micrometeorito?" };
  for (const id of IDS_MODELOS) {
    const simple = contenidoModelo(t, id, "explorar");
    assert.equal(simple.pregunta, simples[id]);
    assert.equal(simple.partes.length, 1);
    assert.equal(simple.partes[0].rotulo, null);
    assert.equal(simple.formula, null);
    const detalle = contenidoModelo(t, id, "planificar");
    assert.notEqual(detalle.pregunta, simple.pregunta);
    assert.equal(detalle.partes.length, PARTES.length);
    assert.deepEqual(detalle.partes.slice(1).map((p) => p.rotulo), ["Próximamente", "Datos", "Resultado"]);
  }
  // Lo que ya existe se titula "Hoy"; lo que todavía no, "Por qué no hoy".
  assert.equal(contenidoModelo(t, "termico", "planificar").partes[0].rotulo, "Hoy");
  assert.equal(contenidoModelo(t, "radiacion", "planificar").partes[0].rotulo, "Por qué no hoy");
  assert.equal(contenidoModelo(t, "micrometeoritos", "planificar").partes[0].rotulo, "Por qué no hoy");
  // Solo micrometeoritos lleva fórmula, en texto plano.
  assert.equal(contenidoModelo(t, "micrometeoritos", "planificar").formula.texto, "P = 1 − e^(−F·A·t)");
  assert.equal(contenidoModelo(t, "termico", "planificar").formula, null);
  assert.equal(contenidoModal(t, "planificar").titulo, "Próximamente en MoonSet");
  assert.match(contenidoModal(t, "planificar").nota, /pendiente, rocas y cráteres/);
});

test("ningún texto muestra números de resultado, niveles de riesgo ni la palabra «certificado»", () => {
  // Los únicos números permitidos: la prioridad (1 a 3) y el paso de simulación "10–30 minutos".
  const PERMITIDOS = [/\b10–30\b/g, /^(Prioridad|Priority) [123]$/];
  const SEMAFORO = /\b(alt[oa]s?|medi[oa]s?|baj[oa]s?|moderad[oa]s?|high|medium|low|moderate|segur[oa]s?|safe|verde|amarillo|rojo|green|yellow|red)\b/i;
  const CERTIFICADO = /certific/i;
  const UNIDAD_CON_VALOR = /\d\s*(°|%|K\b|Sv|Gy|kWh|kW|W\b|h\b|°C)/;
  for (const idioma of IDIOMAS_APP) {
    const t = crearTraductor(idioma);
    const delModal = PERFILES.flatMap((perfil) => textosDelModal(contenidoModal(t, perfil)));
    const delDiccionario = aplanar(IDIOMAS[idioma].proximamente);
    for (const texto of [...delModal, ...delDiccionario]) {
      const sinPermitidos = PERMITIDOS.reduce((s, r) => s.replace(r, ""), texto);
      assert.ok(!/\d/.test(sinPermitidos), `${idioma}: hay un número en «${texto}»`);
      assert.ok(!UNIDAD_CON_VALOR.test(texto), `${idioma}: hay un valor con unidad en «${texto}»`);
      assert.ok(!SEMAFORO.test(texto), `${idioma}: hay una palabra de semáforo en «${texto}»`);
      assert.ok(!CERTIFICADO.test(texto), `${idioma}: dice «certificado» en «${texto}»`);
    }
  }
  // La fórmula es la única expresión con un número fuera de los textos, y no es un resultado.
  assert.deepEqual(MODELOS.filter((m) => m.formula).map((m) => m.id), ["micrometeoritos"]);
});

test("las reglas del test anterior atrapan lo que no puede aparecer", () => {
  const SEMAFORO = /\b(alt[oa]s?|medi[oa]s?|baj[oa]s?|high|medium|low)\b/i;
  for (const malo of ["Riesgo bajo", "riesgo alto", "nivel medio", "Low risk"]) assert.ok(SEMAFORO.test(malo), malo);
  for (const bueno of ["Blindaje (material y espesor)", "trabajo", "allow", "altura"]) assert.ok(!SEMAFORO.test(bueno), bueno);
});

test("la franja de riesgos es un bloque más del panel: visible por defecto en los dos perfiles, después de las cifras", () => {
  assert.equal(BLOQUES[BLOQUES.indexOf("cifras") + 1], "riesgos");
  for (const perfil of PERFILES) {
    const config = configDePerfil(perfil);
    assert.equal(config.bloques.riesgos, true);
    assert.ok(config.orden.includes("riesgos"));
  }
  for (const idioma of IDIOMAS_APP) assert.notEqual(crearTraductor(idioma)("ajustes.bloques.riesgos"), "ajustes.bloques.riesgos");
});
