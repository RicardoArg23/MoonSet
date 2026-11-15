// Solo números: los textos y el formato para la pantalla están en formato.js e i18n/.
// Métricas de misión calculadas en el navegador a partir de los datos anuales de un sitio
// (data/anual/<id>.json: máscara de horizonte + elevación y azimut horarios del Sol y la Tierra).
//
// Mismo criterio que backend/app/metricas.py:
// - hay luz si asoma al menos el borde del disco solar sobre el relieve;
// - hay señal si el centro de la Tierra está sobre el relieve; con un margen mínimo para comunicación
//   (conMargenComunicacion), si además está al menos ese margen por encima.

export const RADIO_SOL_DEG = 0.267;
export const RADIO_TIERRA_DEG = 0.95; // tamaño aparente de la Tierra vista desde la Luna: ~1,9° de diámetro
export const MARGEN_COMUNICACION_MAX_DEG = 10;
const HORA_MS = 3_600_000;

export function alturaHorizonte(grados, az) {
  const a = ((az % 360) + 360) % 360;
  const i = Math.floor(a);
  const f = a - i;
  return grados[i] * (1 - f) + grados[(i + 1) % 360] * f;
}

// Agrega al sitio las series derivadas que no dependen de la misión. Se llama una vez por sitio.
export function prepararSitio(crudo) {
  const n = crudo.muestras;
  const hz = crudo.horizonte.grados;
  const luz = new Uint8Array(n);
  const senal = new Uint8Array(n);
  const margenSol = new Float32Array(n);
  const margenTierra = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    margenSol[i] = crudo.sol_el[i] - alturaHorizonte(hz, crudo.sol_az[i]);
    margenTierra[i] = crudo.tierra_el[i] - alturaHorizonte(hz, crudo.tierra_az[i]);
    luz[i] = margenSol[i] > -RADIO_SOL_DEG ? 1 : 0;
    senal[i] = hayContacto(margenTierra[i], 0);
  }
  return { ...crudo, t0: Date.parse(crudo.inicio), luz, senal, margenSol, margenTierra, _porDia: new Map() };
}

// Contacto con la Tierra: su centro sobre el relieve y, además, al menos `minimoDeg` grados por encima.
// Con minimoDeg = 0 es exactamente el criterio de siempre (margen > 0).
export function hayContacto(margenTierra, minimoDeg) {
  return margenTierra > 0 && margenTierra >= minimoDeg ? 1 : 0;
}

// El sitio visto con un margen mínimo para comunicación: misma geometría, otra serie de señal.
// No hace falta el backend porque el margen sobre el relieve ya está guardado hora por hora.
// Con margen 0 devuelve el mismo objeto. Las copias se memorizan por sitio y margen, y comparten
// las memorias de energía (que no dependen de la señal); la de porDia es propia porque sí depende.
const copiasConMargen = new WeakMap();
export function conMargenComunicacion(sitio, margenDeg) {
  if (!margenDeg) return sitio;
  let porMargen = copiasConMargen.get(sitio);
  if (!porMargen) copiasConMargen.set(sitio, (porMargen = new Map()));
  let copia = porMargen.get(margenDeg);
  if (copia) return copia;
  sitio._entradaEnergia ??= {};
  sitio._sobrevivePorDia ??= new Map();
  const senal = new Uint8Array(sitio.muestras);
  for (let i = 0; i < sitio.muestras; i++) senal[i] = hayContacto(sitio.margenTierra[i], margenDeg);
  copia = { ...sitio, senal, margenComunicacionDeg: margenDeg, _porDia: new Map() };
  if (porMargen.size > 20) porMargen.clear(); // cada valor que se escribe en el campo crea una copia
  porMargen.set(margenDeg, copia);
  return copia;
}

export function indiceDeFecha(sitio, ms) {
  return Math.max(0, Math.min(sitio.muestras - 1, Math.round((ms - sitio.t0) / HORA_MS)));
}

export function fechaDeIndice(sitio, i) {
  return sitio.t0 + i * HORA_MS;
}

function rachaMaxima(serie, desde, hasta, valor) {
  let mejor = 0;
  let actual = 0;
  for (let i = desde; i < hasta; i++) {
    if (serie[i] === valor) {
      actual += 1;
      if (actual > mejor) mejor = actual;
    } else {
      actual = 0;
    }
  }
  return mejor;
}

// Horas hasta que la serie cambia de estado a partir de i. null si no cambia antes del fin de los datos.
export function horasHastaCambio(serie, i) {
  const v = serie[i];
  for (let k = i + 1; k < serie.length; k++) {
    if (serie[k] !== v) return k - i;
  }
  return null;
}

// Fracción visible del disco solar (0 a 1), aproximación lineal como en el backend.
export function fraccionDisco(margenSol) {
  return Math.max(0, Math.min(1, (margenSol + RADIO_SOL_DEG) / (2 * RADIO_SOL_DEG)));
}

// Métricas de una misión que llega en el índice i0 y dura `duracionH` horas.
// Si sobrevive o no lo decide la simulación de energía (energia.js), no este módulo.
// Energía: sin atmósfera, la luz no se atenúa cerca del horizonte; lo que cambia con la elevación
// es cuánto recibe un panel según su orientación.
//  - energiaSeguidorPct: panel que sigue al Sol (o vertical giratorio): fracción de disco visible.
//  - energiaHorizontalPct: panel fijo acostado: fracción de disco x seno de la elevación.
export function evaluarMision(sitio, i0, duracionH) {
  const fin = Math.min(sitio.muestras, i0 + duracionH);
  const n = fin - i0;
  let conLuz = 0;
  let conSenal = 0;
  let elMax = -Infinity;
  let elSuma = 0;
  let seguidor = 0;
  let horizontal = 0;
  for (let i = i0; i < fin; i++) {
    conLuz += sitio.luz[i];
    conSenal += sitio.senal[i];
    const el = sitio.sol_el[i];
    if (el > elMax) elMax = el;
    if (sitio.luz[i]) {
      const f = fraccionDisco(sitio.margenSol[i]);
      elSuma += el;
      seguidor += f;
      horizontal += f * Math.max(0, Math.sin((el * Math.PI) / 180));
    }
  }
  const noche = rachaMaxima(sitio.luz, i0, fin, 0);
  return {
    luzPct: (100 * conLuz) / n,
    senalPct: (100 * conSenal) / n,
    nocheH: noche,
    silencioH: rachaMaxima(sitio.senal, i0, fin, 0),
    elMax,
    elMediaConLuz: conLuz ? elSuma / conLuz : null,
    energiaSeguidorPct: (100 * seguidor) / n,
    energiaHorizontalPct: (100 * horizontal) / n,
    solVisible: sitio.luz[i0] === 1,
    tierraVisible: sitio.senal[i0] === 1,
    hCambioSol: horasHastaCambio(sitio.luz, i0),
    hCambioTierra: horasHastaCambio(sitio.senal, i0),
  };
}

// Para cada día de llegada del año (a la hora UTC indicada): luz, noche más larga y señal de la misión.
// Se memoriza por duración y hora porque alimenta la franja de fechas.
export function porDia(sitio, duracionH, horaLlegada = 0) {
  const clave = `${duracionH}/${horaLlegada}`;
  const cache = sitio._porDia.get(clave);
  if (cache) return cache;
  const dias = Math.floor((sitio.muestras - duracionH - horaLlegada) / 24);
  const luzPct = new Float32Array(dias);
  const senalPct = new Float32Array(dias);
  const nocheH = new Uint16Array(dias);
  for (let d = 0; d < dias; d++) {
    const i0 = d * 24 + horaLlegada;
    let l = 0;
    let s = 0;
    for (let i = i0; i < i0 + duracionH; i++) {
      l += sitio.luz[i];
      s += sitio.senal[i];
    }
    luzPct[d] = (100 * l) / duracionH;
    senalPct[d] = (100 * s) / duracionH;
    nocheH[d] = rachaMaxima(sitio.luz, i0, i0 + duracionH, 0);
  }
  const res = { dias, luzPct, senalPct, nocheH };
  sitio._porDia.set(clave, res);
  return res;
}

// Tramos consecutivos de una serie 0/1 entre dos índices: [{ valor, horas }]
export function tramos(serie, desde, hasta) {
  const out = [];
  let i = desde;
  const fin = Math.min(hasta, serie.length);
  while (i < fin) {
    let j = i;
    while (j < fin && serie[j] === serie[i]) j++;
    out.push({ valor: serie[i], horas: j - i });
    i = j;
  }
  return out;
}
