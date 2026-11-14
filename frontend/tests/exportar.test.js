// Tests de la exportación a CSV: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararSitio } from "../src/v2/calculo.js";
import { PERFILES } from "../src/v2/configEnergia.js";
import { campo, COLUMNAS, COLUMNAS_COMPARACION, csvComparacion, csvMision, nombreArchivo, nombreComparacion } from "../src/v2/exportar.js";

// Sitio sintético: horizonte plano, 12 h de Sol alto y 12 h de noche, la Tierra siempre a 10°.
function sitioDePrueba(horas = 48) {
  const sol_el = Array.from({ length: horas }, (_, i) => (i % 24 < 12 ? 20 : -20));
  return prepararSitio({
    sitio: { id: "prueba", nombre: "Sitio, de \"prueba\"", lat: -89.5, lon: 222.7, aproximado: true },
    inicio: "2027-01-01T00:00:00Z",
    paso_horas: 1,
    muestras: horas,
    altura_m: 2,
    horizonte: { fuente: "esfera", grados: new Array(360).fill(0) },
    sol_el,
    sol_az: new Array(horas).fill(90),
    tierra_el: new Array(horas).fill(10),
    tierra_az: new Array(horas).fill(180),
  });
}

const PERFIL = PERFILES[0];

function leer(csv) {
  const lineas = csv.split("\r\n").filter(Boolean);
  const meta = lineas.filter((l) => l.startsWith("#"));
  const [cabeza, ...datos] = lineas.filter((l) => !l.startsWith("#"));
  return { meta, cabeza, datos };
}

test("una fila por hora de la misión, con el encabezado fijo", () => {
  const sitio = sitioDePrueba();
  const { cabeza, datos } = leer(csvMision({ sitio, sistema: PERFIL.valores, perfil: PERFIL, i0: 6, duracionH: 24 }));
  assert.equal(cabeza, COLUMNAS.join(","));
  assert.equal(datos.length, 24);
  const primera = datos[0].split(",");
  assert.equal(primera.length, COLUMNAS.length);
  assert.equal(primera[0], "2027-01-01T06:00:00Z");
  assert.equal(primera[1], "0");
  assert.equal(datos[23].split(",")[0], "2027-01-02T05:00:00Z");
});

test("luz y contacto salen de las mismas series que usa la interfaz", () => {
  const sitio = sitioDePrueba();
  const { datos } = leer(csvMision({ sitio, sistema: PERFIL.valores, perfil: PERFIL, i0: 0, duracionH: 24 }));
  const col = (nombre) => datos.map((d) => d.split(",")[COLUMNAS.indexOf(nombre)]);
  assert.deepEqual(col("luz"), Array.from({ length: 24 }, (_, i) => (i < 12 ? "1" : "0")));
  assert.ok(col("contacto").every((v) => v === "1"));
  assert.equal(col("disco_solar_visible_pct")[0], "100.0");
  assert.equal(col("consumo_kw")[0], PERFIL.valores.potenciaNormalKW.toFixed(4));
  assert.equal(col("generacion_kw")[23], "0.0000");
});

test("la batería arranca llena y baja de noche", () => {
  const sitio = sitioDePrueba();
  const { datos } = leer(csvMision({ sitio, sistema: PERFIL.valores, perfil: PERFIL, i0: 0, duracionH: 24 }));
  const pct = datos.map((d) => Number(d.split(",")[COLUMNAS.indexOf("bateria_pct")]));
  assert.equal(pct[0], 100);
  assert.ok(pct[23] < pct[12]);
});

test("los metadatos avisan los valores de ejemplo y la coordenada aproximada", () => {
  const sitio = sitioDePrueba();
  const { meta } = leer(csvMision({ sitio, sistema: PERFIL.valores, perfil: PERFIL, i0: 0, duracionH: 24 }));
  assert.ok(meta.includes("# valores_de_ejemplo: si (no son de una mision real)"));
  assert.ok(meta.includes("# coordenada_aproximada: si"));
  assert.ok(meta.includes("# llegada_utc: 2027-01-01T00:00:00Z"));
  assert.ok(meta.some((l) => l.startsWith("# sobrevive: ")));
});

test("los campos con coma o comillas se escapan", () => {
  assert.equal(campo("a,b"), '"a,b"');
  assert.equal(campo('dice "hola"'), '"dice ""hola"""');
  assert.equal(campo(12.5), "12.5");
});

test("el nombre de archivo lleva sitio, llegada y duración", () => {
  assert.equal(nombreArchivo(sitioDePrueba(), 6, 48), "moonset_prueba_2027-01-01T06h_2d.csv");
});

test("en castellano: punto y coma como separador y coma decimal; columnas iguales", () => {
  const sitio = sitioDePrueba();
  const args = { sitio, sistema: PERFIL.valores, perfil: PERFIL, i0: 0, duracionH: 24 };
  const es = leer(csvMision({ ...args, idioma: "es" }));
  const en = leer(csvMision({ ...args, idioma: "en" }));
  assert.equal(es.cabeza, COLUMNAS.join(";"));
  assert.equal(en.cabeza, COLUMNAS.join(","));
  const filaEs = es.datos[0].split(";");
  const filaEn = en.datos[0].split(",");
  assert.equal(filaEs.length, COLUMNAS.length);
  assert.equal(filaEs[COLUMNAS.indexOf("sol_elevacion_deg")], "20,000");
  assert.equal(filaEn[COLUMNAS.indexOf("sol_elevacion_deg")], "20.000");
  // Los mismos valores, cambiando solo la coma decimal.
  assert.deepEqual(filaEs.map((v) => v.replace(",", ".")), filaEn);
  assert.ok(es.meta.includes("# lat_deg: -89,5"));
  assert.ok(en.meta.includes("# lat_deg: -89.5"));
});

test("con punto y coma, la coma ya no obliga a poner comillas", () => {
  assert.equal(campo("a,b", ";"), "a,b");
  assert.equal(campo("a;b", ";"), '"a;b"');
  assert.equal(campo("a;b", ","), "a;b");
});

test("comparación: una fila por escenario, en los dos formatos", () => {
  const sitio = sitioDePrueba();
  const escenarios = [{ sitio, i0: 0 }, { sitio, i0: 12 }];
  const args = { escenarios, sistema: PERFIL.valores, perfil: PERFIL, duracionH: 24 };
  for (const [idioma, sep] of [["es", ";"], ["en", ","]]) {
    const { meta, cabeza, datos } = leer(csvComparacion({ ...args, idioma }));
    assert.equal(cabeza, COLUMNAS_COMPARACION.join(sep));
    assert.equal(datos.length, 2);
    const col = (d, nombre) => d.split(sep)[COLUMNAS_COMPARACION.indexOf(nombre)];
    assert.equal(datos[0].split(sep).length, COLUMNAS_COMPARACION.length);
    assert.deepEqual(datos.map((d) => col(d, "escenario")), ["A", "B"]);
    assert.deepEqual(datos.map((d) => col(d, "llegada_utc")), ["2027-01-01T00:00:00Z", "2027-01-01T12:00:00Z"]);
    assert.equal(col(datos[0], "luz_pct"), idioma === "es" ? "50,00" : "50.00");
    assert.equal(col(datos[0], "contacto_pct"), idioma === "es" ? "100,00" : "100.00");
    assert.equal(col(datos[0], "noche_mas_larga_h"), "12");
    assert.equal(col(datos[0], "duracion_h"), "24");
    assert.match(col(datos[0], "sobrevive"), /^(si|no)$/);
    assert.ok(meta.includes("# valores_de_ejemplo: si (no son de una mision real)"));
    assert.ok(meta.includes("# coordenada_aproximada: prueba"));
  }
});

test("el nombre de archivo de la comparación lleva cuántos escenarios y la duración", () => {
  assert.equal(nombreComparacion(3, 14 * 24), "moonset_comparacion_3_escenarios_14d.csv");
});
