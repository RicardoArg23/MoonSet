// Tests de la simulación de energía: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { capacidadMinima, panelesMinimos, simular, TOLERANCIA_KWH } from "../src/v2/energia.js";

const SISTEMA = {
  tipoBateria: "li-ion",
  capacidadKWh: 10,
  paneles: 4,
  areaPanelM2: 1,
  potenciaNormalKW: 0.2,
  potenciaMinimaKW: 0.05,
  eficienciaPanelPct: 30,
  orientacion: "seguidor",
  reservaPct: 20,
  redundanciaPct: 0,
  potenciaNominalKW: 1,
  calefaccionKW: 0,
};

function entrada(horasLuz, horasNoche, repeticiones = 1) {
  const luz = [];
  for (let r = 0; r < repeticiones; r++) {
    for (let i = 0; i < horasLuz; i++) luz.push(1);
    for (let i = 0; i < horasNoche; i++) luz.push(0);
  }
  return { luz: Uint8Array.from(luz), sol: Float32Array.from(luz) };
}

test("con luz permanente y paneles de sobra la batería no baja de la capacidad usable", () => {
  const sistema = { ...SISTEMA, paneles: 50, redundanciaPct: 25 };
  const r = simular(sistema, entrada(24 * 30, 0));
  assert.equal(r.sobrevive, true);
  assert.equal(r.capacidadUsableKWh, 8);
  assert.equal(r.minimoKWh, r.capacidadUsableKWh);
  assert.ok(r.soc.every((s) => s === 1));
});

test("sin luz la batería cae según el consumo y la eficiencia de descarga", () => {
  const sistema = { ...SISTEMA, calefaccionKW: 0.03, bateria: { densidadWhKg: 200, ciclos: 1000, autodescargaMensualPct: 0, eficienciaPct: 81 } };
  const horas = 48;
  const r = simular(sistema, entrada(0, horas));
  const etaDescarga = Math.sqrt(0.81); // 0,9
  const esperado = 10 - (horas * (0.05 + 0.03)) / etaDescarga;
  assert.ok(Math.abs(r.minimoKWh - esperado) < 1e-9, `${r.minimoKWh} vs ${esperado}`);
  assert.ok(Math.abs(r.consumidaKWh - horas * 0.08) < 1e-9);
  assert.equal(r.generadaKWh, 0);
});

test("la autodescarga mensual se aplica hora por hora", () => {
  const sistema = { ...SISTEMA, potenciaMinimaKW: 0, bateria: { densidadWhKg: 200, ciclos: 1000, autodescargaMensualPct: 10, eficienciaPct: 100 } };
  const r = simular(sistema, entrada(0, 730));
  assert.ok(Math.abs(r.minimoKWh - 9) < 1e-6, `${r.minimoKWh}`);
});

test("la capacidad mínima encontrada sobrevive y un valor apenas menor no", () => {
  const e = entrada(200, 150, 3);
  const cap = capacidadMinima(SISTEMA, e, 0, e.luz.length);
  assert.ok(cap > 0);
  assert.equal(simular({ ...SISTEMA, capacidadKWh: cap }, e).sobrevive, true);
  assert.equal(simular({ ...SISTEMA, capacidadKWh: cap - TOLERANCIA_KWH }, e).sobrevive, false);
});

test("la cantidad mínima de paneles sobrevive y uno menos no", () => {
  const sistema = { ...SISTEMA, paneles: 1 };
  const e = entrada(20, 150, 3); // poca luz entre noches: hay que recargar rápido
  const p = panelesMinimos(sistema, e, 0, e.luz.length);
  assert.ok(p > 1);
  assert.equal(simular({ ...sistema, paneles: p }, e).sobrevive, true);
  assert.equal(simular({ ...sistema, paneles: p - 1 }, e).sobrevive, false);
});

test("si la noche es más larga que lo que aguanta la batería, ningún panel alcanza", () => {
  const e = entrada(0, 24 * 20);
  assert.equal(panelesMinimos(SISTEMA, e, 0, e.luz.length), null);
});
