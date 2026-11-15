// Tests de la configuración de la cabina y del perfil personalizado: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOQUES, CIFRAS, CLAVE_GUARDADA, VISTAS, borrarPersonalizado, buscarAjustes, conBloqueMovido, conCifra, conVista,
  configDePerfil, guardarPersonalizado, leerPersonalizado, normalizarConfig,
} from "../src/v2/ajustes.js";

const almacenFalso = () => {
  const datos = new Map();
  return { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) };
};

test("explorar arranca mínimo y planificar con todo, como en la pantalla de inicio", () => {
  const explorar = configDePerfil("explorar");
  assert.deepEqual(VISTAS.filter((v) => explorar.vistas[v]), ["globo", "horizonte"]);
  assert.equal(explorar.herramientas.lineaTiempo, false);
  assert.equal(explorar.acciones.exportar, false);
  const planificar = configDePerfil("planificar");
  assert.ok(VISTAS.every((v) => planificar.vistas[v]));
  assert.ok(Object.values(planificar.herramientas).every(Boolean));
});

test("cada pedido de un perfil devuelve una copia: cambiarla no toca el perfil base", () => {
  const una = configDePerfil("planificar");
  una.vistas.mapa = false;
  una.orden.reverse();
  assert.equal(configDePerfil("planificar").vistas.mapa, true);
  assert.deepEqual(configDePerfil("planificar").orden, BLOQUES);
});

test("no se puede apagar la última vista", () => {
  let c = configDePerfil("explorar");
  c = conVista(c, "horizonte", false);
  assert.deepEqual(VISTAS.filter((v) => c.vistas[v]), ["globo"]);
  assert.equal(conVista(c, "globo", false), c);
});

test("mover un bloque cambia su lugar y respeta los bordes", () => {
  const c = configDePerfil("planificar");
  assert.deepEqual(conBloqueMovido(c, "cifras", -1).orden.slice(0, 2), ["cifras", "medidor"]);
  assert.equal(conBloqueMovido(c, BLOQUES[0], -1), c);
  assert.equal(conBloqueMovido(c, BLOQUES.at(-1), 1), c);
  assert.deepEqual([...conBloqueMovido(c, "sello", 1).orden].sort(), [...BLOQUES].sort());
});

test("las cifras elegidas quedan en el orden del catálogo, sin repetir", () => {
  let c = configDePerfil("planificar");
  c = conCifra(c, "minimo", true);
  c = conCifra(c, "noche", true);
  c = conCifra(c, "noche", true);
  assert.deepEqual(c.cifras, ["luz", "contacto", "energia", "noche", "minimo"]);
  assert.deepEqual(conCifra(c, "luz", false).cifras, ["contacto", "energia", "noche", "minimo"]);
});

test("una configuración guardada rota o vieja se completa con el perfil de origen", () => {
  const base = configDePerfil("explorar");
  assert.deepEqual(normalizarConfig(null, "explorar"), base);
  assert.deepEqual(normalizarConfig("basura", "explorar"), base);
  const c = normalizarConfig(
    { vistas: { globo: false, mapa: "sí", horizonte: false }, orden: ["sello", "inventado", "sello"], cifras: ["minimo", "x", "luz"], panel: 0, bloques: { cifras: false } },
    "explorar"
  );
  assert.equal(c.vistas.globo, true, "sin vistas válidas se prende el globo");
  assert.equal(c.vistas.mapa, false, "un valor que no es booleano se ignora");
  assert.deepEqual(c.orden, ["sello", ...BLOQUES.filter((b) => b !== "sello")]);
  assert.deepEqual(c.cifras, ["luz", "minimo"]);
  assert.equal(c.panel, true);
  assert.equal(c.pistaGlobo, true, "una clave que falta toma el valor del perfil");
  assert.equal(c.bloques.cifras, false);
  assert.equal(c.bloques.medidor, true);
  assert.ok(c.cifras.every((x) => CIFRAS.includes(x)));
});

test("el perfil personalizado se guarda, se lee igual y se borra", () => {
  const almacen = almacenFalso();
  assert.equal(leerPersonalizado(almacen), null);
  const config = conCifra(conVista(configDePerfil("explorar"), "mapa", true), "noche", true);
  assert.equal(guardarPersonalizado(config, "explorar", almacen), true);
  assert.deepEqual(leerPersonalizado(almacen), { config, origen: "explorar" });
  borrarPersonalizado(almacen);
  assert.equal(leerPersonalizado(almacen), null);
});

test("sin almacenamiento o con datos ilegibles no se rompe", () => {
  const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("lleno"); }, removeItem: () => { throw new Error("bloqueado"); } };
  assert.equal(leerPersonalizado(roto), null);
  assert.equal(guardarPersonalizado(configDePerfil("planificar"), "planificar", roto), false);
  assert.doesNotThrow(() => borrarPersonalizado(roto));
  const almacen = almacenFalso();
  almacen.setItem(CLAVE_GUARDADA, "{no es json");
  assert.equal(leerPersonalizado(almacen), null);
  almacen.setItem(CLAVE_GUARDADA, JSON.stringify({ config: { panel: false }, origen: "otro" }));
  assert.equal(leerPersonalizado(almacen).origen, "planificar");
  assert.equal(leerPersonalizado(almacen).config.panel, false);
});

test("el buscador ignora mayúsculas y tildes y mira también el contexto y las palabras clave", () => {
  const indice = [
    { texto: "Batería mínima", contexto: "Panel de respuesta › Cifras del sitio" },
    { texto: "Línea de tiempo", contexto: "Barra y línea de tiempo", claves: "fecha de llegada" },
    { texto: "Idioma", claves: "language english" },
  ];
  assert.deepEqual(buscarAjustes(indice, "bateria").map((e) => e.texto), ["Batería mínima"]);
  assert.deepEqual(buscarAjustes(indice, "  LLEGADA ").map((e) => e.texto), ["Línea de tiempo"]);
  assert.deepEqual(buscarAjustes(indice, "cifras").map((e) => e.texto), ["Batería mínima"]);
  assert.deepEqual(buscarAjustes(indice, "english").map((e) => e.texto), ["Idioma"]);
  assert.deepEqual(buscarAjustes(indice, "   "), []);
});
