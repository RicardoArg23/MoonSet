// Asistente "Planificá tu misión": ranking de sitios y preguntas rápidas. Sin React, sin IA y sin red:
// todo sale de evaluarMision, evaluarEnergia y compañía sobre los datos anuales. Se prueba con Node
// (tests/planificar.test.js). Devuelve solo números; los textos se arman en Planificador.jsx.
import { evaluarMision, horasHastaCambio } from "./calculo.js";
import { capacidadMinima, entradaSitio, evaluarEnergia, evaluarVecindadEnergia, fechaViableEnergia, panelesMinimos } from "./energia.js";
import { elevacionMaxTierra } from "./explicar.js";
import { LAT_POLAR_SUR } from "./enlaces.js";
import { PERFIL_PERSONALIZADO, PERFILES } from "./configEnergia.js";

export const REGIONES = ["polo", "todos"];
export const TOLERANCIA_MAX = 30; // días que se puede mover la llegada, hacia cada lado
export const TOLERANCIA_DEFECTO = 7;
export const DURACION_MIN = 1;
export const DURACION_MAX = 30;
export const DURACION_DEFECTO = 14;
export const DIAS_2027 = 365;
export const HORA_LLEGADA = 0; // el asistente planifica llegadas a las 00:00 UTC
export const MEJORES = 3;
/** Perfil que nace al ajustar un valor dentro del planificador. Vive solo ahí hasta "Ver en la app". */
export const PERFIL_PLAN = "personalizado-plan";

const entero = (x, min, max, defecto) => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : defecto;
};
/** Tolerancia libre de 0 a 30 días (lo que no es un número vuelve al valor por defecto). */
export const limitarTolerancia = (x) => entero(x, 0, TOLERANCIA_MAX, TOLERANCIA_DEFECTO);
export const limitarDuracion = (x) => entero(x, DURACION_MIN, DURACION_MAX, DURACION_DEFECTO);

// ---------- estado del planificador: funciones puras que usa la cabina (App.jsx) ----------

/** Estado inicial: cerrado, sin respuestas. perfilId y dia se completan al abrirlo por primera vez. */
export function estadoInicialPlan() {
  return {
    abierto: false,
    pestana: "planificar",
    paso: "preguntas",
    perfilId: null,
    perfilApp: null, // valores del perfil personalizado de la app al abrir el planificador (si lo había)
    sistemaPlan: null, // valores ajustados dentro del planificador (perfil PERFIL_PLAN)
    ajustando: false, // los campos de "Ajustar" están desplegados
    region: "polo",
    dia: null,
    tolerancia: TOLERANCIA_DEFECTO,
    duracionDias: DURACION_DEFECTO,
    ranking: null,
    abierta: null,
    sobre: null,
    hilo: [],
  };
}

/**
 * El astronauta alterna el modo: si está cerrado lo abre en la pestaña Planificar (en el ranking si ya hay uno);
 * si está abierto, en cualquier pestaña, lo cierra. Las respuestas y el ranking se conservan siempre.
 * @param {object} plan estado del planificador
 * @param {{ perfilId: string, sistema: object, dia: number }} app lo que tiene la app al abrir (no se modifica)
 */
export function alternarPlan(plan, app) {
  if (plan.abierto) return { ...plan, abierto: false, sobre: null };
  const perfilApp = app.perfilId === PERFIL_PERSONALIZADO ? { ...app.sistema } : null;
  const disponibles = perfilesDelPlan({ ...plan, perfilApp });
  const perfilId = disponibles.some((p) => p.id === plan.perfilId) ? plan.perfilId : disponibles.some((p) => p.id === app.perfilId) ? app.perfilId : disponibles[0].id;
  return { ...plan, abierto: true, pestana: "planificar", paso: plan.ranking ? "ranking" : "preguntas", perfilApp, perfilId, dia: plan.dia ?? app.dia, sobre: null };
}

/** Perfiles de "¿Qué llevás?": los de la lista, el personalizado de la app (si había) y el ajustado en el planificador. */
export function perfilesDelPlan(plan) {
  return [
    ...PERFILES.map((p) => ({ id: p.id, valores: p.valores })),
    ...(plan.perfilApp ? [{ id: PERFIL_PERSONALIZADO, valores: plan.perfilApp }] : []),
    ...(plan.sistemaPlan ? [{ id: PERFIL_PLAN, valores: plan.sistemaPlan }] : []),
  ];
}

/** El perfil elegido en el planificador, o el primero si el elegido ya no está. */
export function perfilElegido(plan) {
  const disponibles = perfilesDelPlan(plan);
  return disponibles.find((p) => p.id === plan.perfilId) ?? disponibles[0];
}

/**
 * Cambia un valor del sistema dentro del planificador: parte de los valores del perfil elegido y el resultado
 * pasa a ser el perfil "Personalizado (planificador)". No toca los perfiles de la lista ni el de la app.
 */
export function ajustarSistema(plan, cambios) {
  const base = perfilElegido(plan).valores;
  return { ...plan, perfilId: PERFIL_PLAN, sistemaPlan: { ...base, ...cambios } };
}

/** Lo que "Ver en la app" aplica del perfil: el ajustado en el planificador entra como el personalizado de la app. */
export function perfilParaApp(ranking) {
  return { perfilId: ranking.perfilId === PERFIL_PLAN ? PERFIL_PERSONALIZADO : ranking.perfilId, sistema: { ...ranking.sistema } };
}

/** Sitios precalculados de la región: "polo" es al sur de 80° S; "todos", la lista entera. */
export function sitiosDeRegion(sitios, region) {
  return region === "polo" ? sitios.filter((s) => s.sitio.lat <= LAT_POLAR_SUR) : sitios;
}

/** La misión llegando un día dado (00:00 UTC): métricas de luz y contacto, y simulación de energía. */
export function evaluarLlegada(sitio, sistema, dia, duracionH) {
  const i0 = dia * 24 + HORA_LLEGADA;
  return { dia, m: evaluarMision(sitio, i0, duracionH), e: evaluarEnergia(sitio, sistema, i0, duracionH, { serie: false }) };
}

// Entre dos llegadas al mismo sitio: primero que sobreviva, después mayor batería mínima, después más
// contacto, después la más cercana a la fecha elegida (y, a igual distancia, la más temprana).
function compararLlegadas(a, b, dia) {
  return (
    Number(b.e.sobrevive) - Number(a.e.sobrevive) ||
    b.e.minimoPct - a.e.minimoPct ||
    b.m.senalPct - a.m.senalPct ||
    Math.abs(a.dia - dia) - Math.abs(b.dia - dia) ||
    a.dia - b.dia
  );
}

/**
 * Un sitio para el ranking: su mejor llegada dentro de la tolerancia (siempre dentro de 2027) y, si
 * en ninguna sobrevive, la primera fecha desde la elegida en la que sí (null si no hay).
 * @param {{ dia: number, tolerancia: number, duracionH: number }} opciones dia: 0 = 1 de enero de 2027
 */
export function evaluarSitio(sitio, sistema, { dia, tolerancia, duracionH }) {
  let mejor = null;
  for (let d = Math.max(0, dia - tolerancia); d <= Math.min(DIAS_2027 - 1, dia + tolerancia); d++) {
    const llegada = evaluarLlegada(sitio, sistema, d, duracionH);
    if (!mejor || compararLlegadas(llegada, mejor, dia) < 0) mejor = llegada;
  }
  return {
    sitio,
    id: sitio.sitio.id,
    dia: mejor.dia,
    desvio: mejor.dia - dia,
    m: mejor.m,
    e: mejor.e,
    sobrevive: mejor.e.sobrevive,
    primera: mejor.e.sobrevive ? mejor.dia : fechaViableEnergia(sitio, sistema, dia, duracionH, HORA_LLEGADA),
  };
}

/** Orden del ranking: los que sobreviven, por batería mínima y contacto; los que no, por noche más corta y más luz. */
export function ordenarRanking(filas) {
  return [...filas].sort(
    (a, b) =>
      Number(b.sobrevive) - Number(a.sobrevive) ||
      (a.sobrevive ? b.e.minimoPct - a.e.minimoPct || b.m.senalPct - a.m.senalPct : a.m.nocheH - b.m.nocheH || b.m.luzPct - a.m.luzPct)
  );
}

/**
 * Ranking completo de una vez (la interfaz lo arma sitio por sitio para poder mostrar la barra de carga).
 * @param {object[]} sitios sitios precalculados, con el margen de comunicación ya aplicado
 * @param {{ region: string, dia: number, tolerancia: number, duracionH: number }} opciones
 */
export function rankear(sitios, sistema, opciones) {
  return ordenarRanking(sitiosDeRegion(sitios, opciones.region).map((s) => evaluarSitio(s, sistema, opciones)));
}

// ---------- preguntas rápidas: cada una devuelve los números y con qué funciones se calcularon ----------

const resumen = ({ m, e }) => ({ sobrevive: e.sobrevive, luzPct: m.luzPct, nocheH: m.nocheH, senalPct: m.senalPct });

/** "¿Y si llego una semana después?" */
export function preguntaSemana(sitio, sistema, dia, duracionH) {
  const despues = dia + 7;
  const funciones = "evaluarMision · evaluarEnergia";
  if (despues > DIAS_2027 - 1) return { funciones, fuera: true };
  return { funciones, dia: despues, antes: resumen(evaluarLlegada(sitio, sistema, dia, duracionH)), despues: resumen(evaluarLlegada(sitio, sistema, despues, duracionH)) };
}

/** "¿Cuánta batería necesito?" */
export function preguntaBateria(sitio, sistema, dia, duracionH) {
  const i0 = dia * 24 + HORA_LLEGADA;
  const fin = Math.min(sitio.muestras, i0 + duracionH);
  const entrada = entradaSitio(sitio, sistema.orientacion);
  const sobrevive = evaluarEnergia(sitio, sistema, i0, duracionH, { serie: false }).sobrevive;
  const capacidadMinimaKWh = capacidadMinima(sistema, entrada, i0, fin);
  return {
    funciones: "capacidadMinima · panelesMinimos",
    sobrevive,
    capacidadKWh: sistema.capacidadKWh,
    paneles: sistema.paneles,
    capacidadMinimaKWh, // null: ninguna batería alcanza con estos paneles
    panelesMinimos: sobrevive ? null : panelesMinimos(sistema, entrada, i0, fin), // null: ningún número de paneles alcanza
    sobraPct: sobrevive && capacidadMinimaKWh !== null && sistema.capacidadKWh > 0 ? 100 * (1 - capacidadMinimaKWh / sistema.capacidadKWh) : null,
  };
}

/** "¿Cuándo se ponen el Sol y la Tierra?" Horas desde la llegada; null si no cambia en lo que queda de los datos. */
export function preguntaPuestas(sitio, dia) {
  const i0 = dia * 24 + HORA_LLEGADA;
  return {
    funciones: "horasHastaCambio",
    solVisible: sitio.luz[i0] === 1,
    hSol: horasHastaCambio(sitio.luz, i0),
    tierraVisible: sitio.senal[i0] === 1,
    hTierra: horasHastaCambio(sitio.senal, i0),
    tierraNunca: elevacionMaxTierra(sitio) <= 0,
  };
}

/** "¿Cuál es la primera fecha que sirve?" Desde la llegada de la tarjeta hacia adelante. */
export function preguntaPrimera(sitio, sistema, dia, duracionH) {
  return { funciones: "fechaViableEnergia", desde: dia, dia: fechaViableEnergia(sitio, sistema, dia, duracionH, HORA_LLEGADA) };
}

/** "¿Hay un punto cerca que sirva mejor?" Mismo criterio de "mejor" que la vista Alrededores. */
export function preguntaCerca(sitio, vecindad, sistema, dia, duracionH) {
  const celdas = evaluarVecindadEnergia(sitio, vecindad, sistema, dia * 24 + HORA_LLEGADA, duracionH);
  const { n, paso_m: paso } = vecindad;
  const medio = Math.floor(n / 2);
  const centro = medio * n + medio;
  let mejor = centro;
  celdas.forEach((c, k) => {
    const actual = celdas[mejor];
    if (Number(c.viable) > Number(actual.viable) || (c.viable === actual.viable && (c.minimoPct > actual.minimoPct || (c.minimoPct === actual.minimoPct && c.luzPct > actual.luzPct)))) mejor = k;
  });
  const celda = celdas[mejor];
  return {
    funciones: "evaluarVecindadEnergia",
    total: celdas.length,
    viables: celdas.filter((c) => c.viable).length,
    pasoM: paso,
    esElSitio: mejor === centro,
    mejor: {
      distanciaM: Math.hypot((mejor % n) - medio, Math.floor(mejor / n) - medio) * paso,
      viable: celda.viable,
      luzPct: celda.luzPct,
      contactoPct: celda.contactoPct,
      nocheH: celda.nocheH,
      minimoPct: celda.minimoPct,
    },
  };
}
