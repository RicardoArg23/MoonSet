// Recorrido guiado de la cabina: qué control señala cada paso y qué acción lo completa. Sin React, se prueba
// con Node (tests/tutorial.test.js). Los textos están en i18n: tutorial.pasos.<id>.{titulo,texto,hace}.

export const CLAVE_VISTO = "moonset.tutorial";

/**
 * objetivo: valor de data-tutorial del control que se señala.
 * accion:   lo que la persona tiene que hacer para que el paso se dé por hecho (si falta, es solo para leer).
 * vista:    vista que tiene que estar abierta para que el control exista.
 * necesita: qué tiene que estar a la vista: "panel" o "dock" (paneles flotantes) o "plan" (el modo planificación abierto).
 *           Un paso sin "plan" cierra el modo planificación si estaba abierto: el recorrido sigue en la cabina.
 * lista:    el paso trae además una lista de ítems (tutorial.pasos.<id>.lista).
 */
const PASO = {
  sitio: { id: "sitio", objetivo: "luna", vista: "globo", accion: "sitio" },
  respuesta: { id: "respuesta", objetivo: "respuesta", necesita: "panel" },
  duracion: { id: "duracion", objetivo: "duracion", accion: "duracion" },
  horizonte: { id: "horizonte", objetivo: "horizonte", accion: "horizonte" },
  vistas: { id: "vistas", objetivo: "vistas", accion: "vista", lista: true },
  fecha: { id: "fecha", objetivo: "fecha", necesita: "dock", accion: "fecha" },
  sistema: { id: "sistema", objetivo: "sistema" },
  puntos: { id: "puntos", objetivo: "puntos" },
  fijar: { id: "fijar", objetivo: "fijar", necesita: "panel", accion: "fijar" },
  astronauta: { id: "astronauta", objetivo: "astronauta", accion: "plan" },
  astronautaExplorar: { id: "astronautaExplorar", objetivo: "astronauta" },
  plan: { id: "plan", objetivo: "plan", necesita: "plan" },
  ajustes: { id: "ajustes", objetivo: "ajustes" },
  finExplorar: { id: "finExplorar", objetivo: "ayuda" },
  fin: { id: "fin", objetivo: "ayuda" },
};

const RECORRIDOS = {
  // Explorar: lo mínimo, y el asistente solo presentado (hace preguntas técnicas: no se lo empuja a quien recién mira).
  explorar: ["sitio", "respuesta", "duracion", "horizonte", "astronautaExplorar", "finExplorar"],
  planificar: ["sitio", "respuesta", "duracion", "vistas", "fecha", "sistema", "puntos", "fijar", "astronauta", "plan", "ajustes", "fin"],
};

/** @param {string} perfil "explorar" | "planificar" @returns {typeof PASO.sitio[]} los pasos del recorrido, en orden */
export function pasosDe(perfil) {
  return (RECORRIDOS[perfil] ?? RECORRIDOS.planificar).map((id) => PASO[id]);
}

/**
 * Estado siguiente del recorrido al moverse. Fuera de rango por arriba termina (paso -1); por abajo se queda en el primero.
 * @param {{ paso: number, hecho: boolean, sentido: number }} estado
 * @param {number} destino índice del paso al que se quiere ir
 * @param {number} total cantidad de pasos del recorrido
 */
export function irAPaso(estado, destino, total) {
  if (destino >= total) return { paso: -1, hecho: false, sentido: 1 };
  const paso = Math.max(0, destino);
  return { paso, hecho: false, sentido: paso < estado.paso ? -1 : 1 };
}

/** Marca el paso como hecho si la acción es la que pide; si no, devuelve el mismo estado. */
export function conAccion(estado, pasos, accion) {
  const actual = pasos[estado.paso];
  return actual && actual.accion === accion && !estado.hecho ? { ...estado, hecho: true } : estado;
}

export function tutorialVisto(almacen = globalThis.localStorage) {
  try {
    return almacen.getItem(CLAVE_VISTO) === "1";
  } catch {
    return true; // sin almacenamiento no se puede recordar: mejor no insistir en cada visita
  }
}

export function marcarTutorialVisto(almacen = globalThis.localStorage) {
  try {
    almacen.setItem(CLAVE_VISTO, "1");
  } catch {
    // Sin almacenamiento la invitación vuelve a salir la próxima vez; no es grave.
  }
}
