// Traductor sin dependencias de React: se puede probar con Node.
import es from "./es.js";
import en from "./en.js";

export const IDIOMAS = { es, en };
export const IDIOMA_BASE = "es";

function buscar(diccionario, clave) {
  return clave.split(".").reduce((nodo, parte) => (nodo == null ? undefined : nodo[parte]), diccionario);
}

/**
 * @param {string} idioma "es" | "en"
 * @returns {(clave: string, params?: Record<string, string|number>) => any}
 *   Texto con los {parámetros} reemplazados. Si la clave es una lista, devuelve la lista.
 *   Si falta en el idioma pedido cae al español; si tampoco está, devuelve la clave (se ve en pantalla y se corrige).
 */
export function crearTraductor(idioma) {
  const diccionario = IDIOMAS[idioma] ?? IDIOMAS[IDIOMA_BASE];
  const plural = new Intl.PluralRules(idioma);
  return function t(clave, params = {}) {
    let valor = buscar(diccionario, clave) ?? buscar(IDIOMAS[IDIOMA_BASE], clave);
    if (valor === undefined) return clave;
    if (Array.isArray(valor)) return valor;
    if (typeof valor === "object") valor = valor[plural.select(Number(params.n))] ?? valor.other;
    return valor.replace(/\{(\w+)\}/g, (todo, nombre) => (nombre in params ? String(params[nombre]) : todo));
  };
}
