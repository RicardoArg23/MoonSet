// Configuración de la cabina: qué piezas se ven y en qué orden. Sin React, se prueba con Node (tests/ajustes.test.js).
// Hay dos perfiles fijos, los de la pantalla de inicio, y uno "personalizado" que nace al cambiar cualquier cosa
// y se guarda en el navegador.

export const VISTAS = ["globo", "mapa", "horizonte", "alrededores", "comparar"];
/** Bloques del panel de respuesta que se pueden ocultar y reordenar. */
// "riesgos" es la franja "Riesgos de la misión · Próximamente" (Proximamente.jsx): no calcula nada todavía.
export const BLOQUES = ["medidor", "opciones", "cifras", "riesgos", "detalle", "sello", "enlaces"];
/** Botones del pie del panel: se ocultan, pero siempre van al final. */
export const ACCIONES = ["fijar", "exportar"];
export const CIFRAS = ["luz", "contacto", "energia", "noche", "autonomia", "minimo"];
export const HERRAMIENTAS = ["parametros", "puntos", "lineaTiempo"];
export const PERFILES_BASE = ["explorar", "planificar"];
export const PERSONALIZADO = "personalizado";
export const CLAVE_GUARDADA = "moonset.personalizado";

const todas = (claves, valor) => Object.fromEntries(claves.map((clave) => [clave, valor]));

const CONFIG_BASE = {
  // Explorar: solo la Luna con Globo y Horizonte; sin parámetros, puntos propios, línea de tiempo ni exportar.
  explorar: {
    vistas: { ...todas(VISTAS, false), globo: true, horizonte: true },
    herramientas: todas(HERRAMIENTAS, false),
    panel: true,
    pistaGlobo: true,
    bloques: todas(BLOQUES, true),
    acciones: todas(ACCIONES, false),
    orden: BLOQUES,
    cifras: ["luz", "contacto", "energia"],
  },
  planificar: {
    vistas: todas(VISTAS, true),
    herramientas: todas(HERRAMIENTAS, true),
    panel: true,
    pistaGlobo: true,
    bloques: todas(BLOQUES, true),
    acciones: todas(ACCIONES, true),
    orden: BLOQUES,
    cifras: ["luz", "contacto", "energia"],
  },
};

/** @param {string} perfil "explorar" | "planificar" @returns {object} una copia nueva de la configuración del perfil */
export function configDePerfil(perfil) {
  return structuredClone(CONFIG_BASE[perfil] ?? CONFIG_BASE.planificar);
}

const booleanos = (crudo, base) =>
  Object.fromEntries(Object.keys(base).map((clave) => [clave, typeof crudo?.[clave] === "boolean" ? crudo[clave] : base[clave]]));
const sinRepetir = (lista) => [...new Set(lista)];

/**
 * Deja una configuración leída de afuera (localStorage) en una forma válida: lo que falta o está mal
 * se completa con el perfil de origen. Nunca devuelve una cabina sin vistas.
 * @param {unknown} crudo
 * @param {string} origen perfil del que partió
 */
export function normalizarConfig(crudo, origen) {
  const base = configDePerfil(origen);
  if (!crudo || typeof crudo !== "object") return base;
  const vistas = booleanos(crudo.vistas, base.vistas);
  if (!VISTAS.some((v) => vistas[v])) vistas.globo = true;
  const ordenLeido = Array.isArray(crudo.orden) ? sinRepetir(crudo.orden.filter((b) => BLOQUES.includes(b))) : [];
  const cifras = Array.isArray(crudo.cifras) ? sinRepetir(crudo.cifras.filter((c) => CIFRAS.includes(c))) : base.cifras;
  return {
    vistas,
    herramientas: booleanos(crudo.herramientas, base.herramientas),
    panel: typeof crudo.panel === "boolean" ? crudo.panel : base.panel,
    pistaGlobo: typeof crudo.pistaGlobo === "boolean" ? crudo.pistaGlobo : base.pistaGlobo,
    bloques: booleanos(crudo.bloques, base.bloques),
    acciones: booleanos(crudo.acciones, base.acciones),
    orden: [...ordenLeido, ...BLOQUES.filter((b) => !ordenLeido.includes(b))],
    cifras: CIFRAS.filter((c) => cifras.includes(c)), // siempre en el orden del catálogo
  };
}

/** Prende o apaga una vista sin dejar la cabina sin ninguna. */
export function conVista(config, vista, activa) {
  const vistas = { ...config.vistas, [vista]: activa };
  return VISTAS.some((v) => vistas[v]) ? { ...config, vistas } : config;
}

/** Mueve un bloque del panel un lugar hacia arriba (-1) o hacia abajo (+1). */
export function conBloqueMovido(config, bloque, paso) {
  const desde = config.orden.indexOf(bloque);
  const hasta = desde + paso;
  if (desde < 0 || hasta < 0 || hasta >= config.orden.length) return config;
  const orden = [...config.orden];
  [orden[desde], orden[hasta]] = [orden[hasta], orden[desde]];
  return { ...config, orden };
}

/** Agrega o quita una cifra; el resultado queda en el orden del catálogo. */
export function conCifra(config, cifra, activa) {
  const elegidas = activa ? [...config.cifras, cifra] : config.cifras.filter((c) => c !== cifra);
  return { ...config, cifras: CIFRAS.filter((c) => elegidas.includes(c)) };
}

/** @returns {{ config: object, origen: string } | null} el perfil personalizado guardado, ya validado */
export function leerPersonalizado(almacen = globalThis.localStorage) {
  try {
    const guardado = JSON.parse(almacen.getItem(CLAVE_GUARDADA));
    if (!guardado || typeof guardado !== "object") return null;
    const origen = PERFILES_BASE.includes(guardado.origen) ? guardado.origen : "planificar";
    return { config: normalizarConfig(guardado.config, origen), origen };
  } catch {
    return null; // sin almacenamiento, o lo guardado no se puede leer: se sigue sin perfil propio
  }
}

/** @returns {boolean} si se pudo guardar */
export function guardarPersonalizado(config, origen, almacen = globalThis.localStorage) {
  try {
    almacen.setItem(CLAVE_GUARDADA, JSON.stringify({ config, origen }));
    return true;
  } catch {
    return false; // modo privado o almacenamiento lleno: el perfil vale solo para esta sesión
  }
}

export function borrarPersonalizado(almacen = globalThis.localStorage) {
  try {
    almacen.removeItem(CLAVE_GUARDADA);
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}

const sinTildes = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca en el índice de ajustes sin distinguir mayúsculas ni tildes.
 * @param {{ texto: string, contexto?: string, claves?: string }[]} indice
 * @param {string} consulta
 */
export function buscarAjustes(indice, consulta) {
  const q = sinTildes(consulta.trim());
  if (!q) return [];
  return indice.filter((e) => sinTildes(`${e.texto} ${e.contexto ?? ""} ${e.claves ?? ""}`).includes(q));
}
