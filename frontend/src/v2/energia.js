// Solo números: simulación de energía hora por hora (paneles + batería) para una misión.
// Reemplaza al modelo de "horas de autonomía": en vez de comparar la noche más larga contra un
// número fijo de horas, sigue el estado de carga de la batería durante toda la misión.
//
// Entrada de la simulación, por hora:
// - luz: 1 si asoma el borde del disco solar sobre el relieve (mismo criterio que calculo.js);
// - sol: fracción visible del disco x factor de orientación del panel (0 a 1).
// Así la misma función sirve para un sitio, para cada celda de los alrededores y para los tests.
//
// Supuestos del modelo (acordados con el equipo):
// - La reserva mínima es un % de la capacidad usable (capacidad total / (1 + redundancia)), no de la total.
// - La misión falla en la primera hora en que la batería queda bajo la reserva o no alcanza a cubrir
//   el consumo de esa hora (esto último cuenta como falla aunque la reserva sea 0 %).
// - La autodescarga se aplica al principio de cada hora: si sobra sol, la hora termina con la batería llena.
// - La eficiencia de la batería es de ida y vuelta: su raíz cuadrada se aplica al cargar y al descargar.
// - Los ciclos son equivalentes: energía descargada / capacidad usable.
// - Hay consumo "de noche" (mínima + calefacción) en toda hora sin luz, aunque sea una sombra corta.
// - La potencia nominal es capacidad total x tasa C. Superarla es solo un aviso: no hace fallar la
//   misión. Se compara contra la potencia que entrega la batería en cada hora.
import { alturaHorizonte, fraccionDisco, hayContacto, RADIO_SOL_DEG } from "./calculo.js";
import { CONSTANTE_SOLAR_KW_M2, parametrosBateria, potenciaNominalKW } from "./configEnergia.js";

const HORAS_POR_MES = 730;
export const TOLERANCIA_KWH = 0.01; // precisión de la búsqueda de capacidad mínima
const CAPACIDAD_TOPE_KWH = 1e7;
const PANELES_TOPE = 100_000;

function factorOrientacion(orientacion, elDeg) {
  return orientacion === "horizontal" ? Math.max(0, Math.sin((elDeg * Math.PI) / 180)) : 1;
}

// Serie solar de todo el año de un sitio. Se calcula una vez por sitio y orientación.
export function entradaSitio(sitio, orientacion) {
  sitio._entradaEnergia ??= {};
  let sol = sitio._entradaEnergia[orientacion];
  if (!sol) {
    sol = new Float32Array(sitio.muestras);
    for (let i = 0; i < sitio.muestras; i++) {
      sol[i] = sitio.luz[i] ? fraccionDisco(sitio.margenSol[i]) * factorOrientacion(orientacion, sitio.sol_el[i]) : 0;
    }
    sitio._entradaEnergia[orientacion] = sol;
  }
  return { luz: sitio.luz, sol };
}

// Serie solar de un punto de los alrededores: la posición del Sol del sitio central con la máscara
// de horizonte del punto (igual que evaluarVecindad en calculo.js). Solo cubre [desde, hasta).
export function entradaHorizonte(sitio, horizonte, desde, hasta, orientacion) {
  const fin = Math.min(sitio.muestras, hasta);
  const n = Math.max(0, fin - desde);
  const luz = new Uint8Array(n);
  const sol = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = desde + k;
    const margen = sitio.sol_el[i] - alturaHorizonte(horizonte, sitio.sol_az[i]);
    if (margen > -RADIO_SOL_DEG) {
      luz[k] = 1;
      sol[k] = fraccionDisco(margen) * factorOrientacion(orientacion, sitio.sol_el[i]);
    }
  }
  return { luz, sol };
}

/**
 * Simula la batería hora por hora entre los índices [desde, hasta) de la entrada.
 *
 * sistema: { tipoBateria, capacidadKWh, paneles, areaPanelM2, potenciaNormalKW, potenciaMinimaKW,
 *            eficienciaPanelPct, reservaPct, redundanciaPct, tasaC, calefaccionKW,
 *            bateria? } — `bateria` reemplaza los valores por defecto del tipo (configEnergia.js).
 * opciones.serie: guardar el estado de carga de cada hora (para la curva).
 * opciones.cortar: dejar de simular en la primera falla (para búsquedas y franjas de fechas).
 */
export function simular(sistema, entrada, desde = 0, hasta = entrada.luz.length, { serie = true, cortar = false } = {}) {
  const b = sistema.bateria ?? parametrosBateria(sistema.tipoBateria);
  const eta = Math.sqrt(b.eficienciaPct / 100); // la eficiencia es de ida y vuelta: mitad al cargar, mitad al descargar
  const usable = sistema.capacidadKWh / (1 + sistema.redundanciaPct / 100);
  const reserva = (usable * sistema.reservaPct) / 100;
  const retencion = (1 - b.autodescargaMensualPct / 100) ** (1 / HORAS_POR_MES);
  const picoKW = CONSTANTE_SOLAR_KW_M2 * sistema.areaPanelM2 * sistema.paneles * (sistema.eficienciaPanelPct / 100);
  const consumoNoche = sistema.potenciaMinimaKW + sistema.calefaccionKW;
  const { luz, sol } = entrada;
  const n = Math.max(0, hasta - desde);
  const soc = serie ? new Float32Array(n) : null;
  const generacionKW = serie ? new Float32Array(n) : null;
  const consumoKW = serie ? new Float32Array(n) : null;

  let e = usable; // arranca llena
  let minimo = usable;
  let horaMinimo = 0;
  let falla = null;
  let horasBajoReserva = 0;
  let generada = 0;
  let consumida = 0;
  let desperdiciada = 0;
  let descargada = 0;
  let noServida = 0;
  let maxDescargaKW = 0;
  let horasNoche = 0;
  let racha = 0;
  let nocheMax = 0;

  for (let k = 0; k < n; k++) {
    const i = desde + k;
    const gen = picoKW * sol[i];
    const cons = luz[i] ? sistema.potenciaNormalKW : consumoNoche;
    if (luz[i]) racha = 0;
    else {
      horasNoche += 1;
      racha += 1;
      if (racha > nocheMax) nocheMax = racha;
    }
    generada += gen;
    consumida += cons;
    e *= retencion; // la autodescarga va primero: si sobra sol, la hora termina con la batería llena
    const neto = gen - cons;
    let faltoEnergia = false;
    if (neto >= 0) {
      const entra = Math.min(neto * eta, usable - e);
      e += entra;
      desperdiciada += neto - entra / eta;
    } else {
      const pedido = -neto / eta;
      const sale = Math.min(pedido, e);
      e -= sale;
      descargada += sale;
      if (-neto > maxDescargaKW) maxDescargaKW = -neto;
      if (sale < pedido) {
        noServida += (pedido - sale) * eta;
        faltoEnergia = true;
      }
    }
    if (e < minimo) {
      minimo = e;
      horaMinimo = k;
    }
    if (faltoEnergia || e < reserva - 1e-9) {
      horasBajoReserva += 1;
      if (falla === null) falla = k;
      if (cortar) break;
    }
    if (soc) {
      soc[k] = usable > 0 ? e / usable : 0;
      generacionKW[k] = gen;
      consumoKW[k] = cons;
    }
  }

  const ciclos = usable > 0 ? descargada / usable : 0;
  const nominal = potenciaNominalKW(sistema);
  return {
    sobrevive: falla === null,
    horaFalla: falla, // horas desde el inicio de la misión
    capacidadUsableKWh: usable,
    reservaKWh: reserva,
    minimoKWh: minimo,
    minimoPct: usable > 0 ? (100 * minimo) / usable : 0,
    horaMinimo,
    soc, // estado de carga por hora, 0 a 1 de la capacidad usable
    generacionKW, // potencia de los paneles en cada hora (con `serie`)
    consumoKW, // consumo en cada hora (con `serie`)
    generadaKWh: generada,
    consumidaKWh: consumida,
    desperdiciadaKWh: desperdiciada,
    noServidaKWh: noServida,
    horasBajoReserva,
    nocheMaxH: nocheMax, // con `cortar`, solo hasta la falla
    masaKg: (1000 * sistema.capacidadKWh) / b.densidadWhKg,
    autonomiaH: consumoNoche > 0 ? usable / consumoNoche : Infinity,
    ciclos,
    avisos: {
      potenciaNominal: maxDescargaKW > nominal,
      potenciaNominalKW: nominal,
      maxDescargaKW,
      ciclos: ciclos > b.ciclos,
      vidaCiclos: b.ciclos,
      nochesSinCalefaccion: horasNoche > 0 && sistema.calefaccionKW <= 0,
    },
  };
}

function sobreviveCon(sistema, cambio, entrada, desde, hasta) {
  return simular({ ...sistema, ...cambio }, entrada, desde, hasta, { serie: false, cortar: true }).sobrevive;
}

// Capacidad total mínima (kWh) con la que la misión sobrevive, dejando todo lo demás igual.
// null si ninguna alcanza (por ejemplo, una reserva del 100 %).
export function capacidadMinima(sistema, entrada, desde, hasta) {
  const ok = (c) => sobreviveCon(sistema, { capacidadKWh: c }, entrada, desde, hasta);
  if (ok(0)) return 0;
  let lo = 0;
  let hi = Math.max(1, sistema.capacidadKWh);
  while (!ok(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > CAPACIDAD_TOPE_KWH) return null;
  }
  while (hi - lo > TOLERANCIA_KWH) {
    const medio = (lo + hi) / 2;
    if (ok(medio)) hi = medio;
    else lo = medio;
  }
  return hi;
}

// Cantidad mínima de paneles con la que la misión sobrevive, dejando todo lo demás igual.
// null si ninguna alcanza (por ejemplo, una noche más larga que lo que aguanta la batería).
export function panelesMinimos(sistema, entrada, desde, hasta) {
  const ok = (p) => sobreviveCon(sistema, { paneles: p }, entrada, desde, hasta);
  if (ok(0)) return 0;
  let lo = 0;
  let hi = Math.max(1, sistema.paneles);
  while (!ok(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > PANELES_TOPE) return null;
  }
  while (hi - lo > 1) {
    const medio = Math.floor((lo + hi) / 2);
    if (ok(medio)) hi = medio;
    else lo = medio;
  }
  return hi;
}

// Frase de acción: cuánto falta (capacidad o paneles, una variable por vez) o cuánto sobra.
export function recomendar(sistema, entrada, desde, hasta, resultado) {
  const capMin = capacidadMinima(sistema, entrada, desde, hasta);
  if (resultado.sobrevive) {
    return {
      capacidadMinimaKWh: capMin,
      sobraPct: sistema.capacidadKWh > 0 && capMin !== null ? 100 * (1 - capMin / sistema.capacidadKWh) : 0,
    };
  }
  const panMin = panelesMinimos(sistema, entrada, desde, hasta);
  return {
    capacidadMinimaKWh: capMin,
    panelesMinimos: panMin,
    faltanKWh: capMin === null ? null : capMin - sistema.capacidadKWh,
    faltanPaneles: panMin === null ? null : panMin - sistema.paneles,
  };
}

// La misión evaluada en un sitio a partir del índice i0.
export function evaluarEnergia(sitio, sistema, i0, duracionH, opciones) {
  const entrada = entradaSitio(sitio, sistema.orientacion);
  return simular(sistema, entrada, i0, Math.min(sitio.muestras, i0 + duracionH), opciones);
}

// Para cada día de llegada del año (a la hora UTC indicada): 1 si la misión sobrevive.
// Alimenta la franja de fechas y "esperar a otra fecha". Se memoriza por sistema, duración y hora.
export function sobrevivePorDia(sitio, sistema, duracionH, horaLlegada = 0) {
  sitio._sobrevivePorDia ??= new Map();
  const clave = `${JSON.stringify(sistema)}/${duracionH}/${horaLlegada}`;
  const cache = sitio._sobrevivePorDia.get(clave);
  if (cache) return cache;
  const entrada = entradaSitio(sitio, sistema.orientacion);
  const dias = Math.max(0, Math.floor((sitio.muestras - duracionH - horaLlegada) / 24));
  const ok = new Uint8Array(dias);
  for (let d = 0; d < dias; d++) {
    const i0 = d * 24 + horaLlegada;
    ok[d] = simular(sistema, entrada, i0, i0 + duracionH, { serie: false, cortar: true }).sobrevive ? 1 : 0;
  }
  if (sitio._sobrevivePorDia.size > 50) sitio._sobrevivePorDia.clear(); // cada cambio de un campo crea una clave nueva
  sitio._sobrevivePorDia.set(clave, ok);
  return ok;
}

// Primer día desde `dia` en que la misión sobrevive en el mismo sitio (hacia adelante).
export function fechaViableEnergia(sitio, sistema, dia, duracionH, horaLlegada = 0) {
  const ok = sobrevivePorDia(sitio, sistema, duracionH, horaLlegada);
  for (let d = dia; d < Math.min(365, ok.length); d++) {
    if (ok[d]) return d;
  }
  return null;
}

// Misma misión en cada punto de la grilla de alrededores (data/anual/vecindad-<id>.json).
export function evaluarVecindadEnergia(sitio, vecindad, sistema, i0, duracionH) {
  return vecindad.horizontes.map((hz, k) => {
    const entrada = entradaHorizonte(sitio, hz, i0, i0 + duracionH, sistema.orientacion);
    const r = simular(sistema, entrada, 0, entrada.luz.length, { serie: false });
    const fin = Math.min(sitio.muestras, i0 + duracionH);
    let conLuz = 0;
    let conSenal = 0;
    for (let i = 0; i < entrada.luz.length; i++) conLuz += entrada.luz[i];
    // Contacto en el punto: la Tierra del sitio central contra el relieve de ese punto, con el mismo margen.
    for (let i = i0; i < fin; i++) conSenal += hayContacto(sitio.tierra_el[i] - alturaHorizonte(hz, sitio.tierra_az[i]), sitio.margenComunicacionDeg ?? 0);
    return {
      luzPct: (100 * conLuz) / entrada.luz.length,
      contactoPct: (100 * conSenal) / Math.max(1, fin - i0),
      viable: r.sobrevive,
      minimoPct: r.minimoPct,
      nocheH: r.nocheMaxH,
      alturaM: vecindad.alturas[k],
    };
  });
}
