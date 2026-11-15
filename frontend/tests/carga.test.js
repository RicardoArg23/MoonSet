// Tests de la espera al tocar un punto: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AVANCE_TOPE, avanceEstimado } from "../src/v2/carga.js";

test("la barra arranca en 0, avanza rápido al principio y nunca pasa del 90 %", () => {
  assert.equal(avanceEstimado(0), 0);
  assert.equal(avanceEstimado(-1), 0);
  assert.ok(avanceEstimado(0.5) > 0.4, "a medio segundo ya se ve avance");
  let anterior = 0;
  for (let s = 0.1; s < 20; s += 0.1) {
    const p = avanceEstimado(s);
    assert.ok(p > anterior, `crece en ${s.toFixed(1)} s`);
    assert.ok(p < AVANCE_TOPE, "no llega al 90 % por sí sola");
    anterior = p;
  }
  // Con esperas muy largas se queda quieta en el tope (por redondeo), nunca lo pasa.
  for (const s of [30, 120, 3600]) assert.ok(avanceEstimado(s) <= AVANCE_TOPE);
  assert.equal(AVANCE_TOPE, 0.9);
});

test("la barra se frena: cada segundo avanza menos que el anterior", () => {
  const tramos = [0, 1, 2, 3, 4].map((s) => avanceEstimado(s + 1) - avanceEstimado(s));
  for (let k = 1; k < tramos.length; k++) assert.ok(tramos[k] < tramos[k - 1]);
});

test("cargarCoordenadas pasa la señal a fetch: abortar cancela el pedido", async () => {
  // datos.js lee import.meta.env (de Vite); acá se prueba con un fetch simulado y una copia sin Vite.
  const fuente = readFileSync(new URL("../src/v2/datos.js", import.meta.url), "utf-8")
    .replace(/import\.meta\.env\.BASE_URL/g, '"/"')
    .replace(/import\.meta\.env\.VITE_API_URL/g, '"http://backend"')
    .replace('from "./calculo"', `from ${JSON.stringify(new URL("../src/v2/calculo.js", import.meta.url).href)}`);
  const datos = await import(`data:text/javascript,${encodeURIComponent(fuente)}`);
  const pedidos = [];
  globalThis.fetch = (url, { signal } = {}) => new Promise((resolver, rechazar) => {
    pedidos.push({ url, signal });
    signal?.addEventListener("abort", () => rechazar(Object.assign(new Error("abortado"), { name: "AbortError" })));
  });
  const control = new AbortController();
  const promesa = datos.cargarCoordenadas(-88.5, 100, { signal: control.signal });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].signal, control.signal);
  assert.match(pedidos[0].url, /\/anual\?lat=-88\.5&lon=100$/);
  control.abort();
  await assert.rejects(promesa, { name: "AbortError" });
  delete globalThis.fetch;
});
