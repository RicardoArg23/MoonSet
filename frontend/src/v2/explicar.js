// Explicaciones del veredicto armadas con reglas, sin IA ni red. Sin React: se prueba con Node
// (tests/explicar.test.js). Solo decide qué frases van y con qué números; los textos están en i18n
// (explicar.<perfil>.<regla>) y se arman con textoExplicacion().
import { LAT_POLAR_SUR } from "./enlaces.js";
import { parametrosBateria } from "./configEnergia.js";

export const MAX_FRASES = 3;
export const SOL_RASANTE_DEG = 5; // por debajo de esta elevación máxima, la luz depende del relieve
export const MARGEN_JUSTO_PCT = 40; // batería mínima por debajo de la cual "sobrevive con poco margen"

/**
 * Horas de noche que cubre la batería hasta tocar la reserva:
 * capacidad usable × (1 − reserva) × √eficiencia / consumo de noche (mínimo + calefacción).
 * A diferencia de `autonomiaH` de la simulación, descuenta la reserva y la eficiencia de descarga, así
 * coincide con la hora en que la simulación falla en una noche larga. Infinity si de noche no hay consumo.
 */
export function horasNocheCubiertas(sistema) {
  const bateria = sistema.bateria ?? parametrosBateria(sistema.tipoBateria);
  const usable = sistema.capacidadKWh / (1 + sistema.redundanciaPct / 100);
  const consumoNoche = sistema.potenciaMinimaKW + sistema.calefaccionKW;
  if (consumoNoche <= 0) return Infinity;
  return (usable * (1 - sistema.reservaPct / 100) * Math.sqrt(bateria.eficienciaPct / 100)) / consumoNoche;
}

/** Elevación máxima de la Tierra en todo el año de datos (°). Se calcula una vez por sitio. */
const maximosTierra = new WeakMap();
export function elevacionMaxTierra(sitio) {
  let max = maximosTierra.get(sitio.tierra_el);
  if (max === undefined) {
    max = -Infinity;
    for (let i = 0; i < sitio.muestras; i++) if (sitio.tierra_el[i] > max) max = sitio.tierra_el[i];
    maximosTierra.set(sitio.tierra_el, max);
  }
  return max;
}

/**
 * Hasta tres frases que explican el veredicto, de la regla más importante a la menos.
 * @param {{ m: object, e: object, sistema: object }} resultado evaluarMision, evaluarEnergia y el sistema usado
 * @param {object} sitio sitio preparado (prepararSitio)
 * @param {"explorar"|"planificar"} perfilVista explorar: lenguaje simple; planificar: con cifras
 * @returns {{ regla: string, tono: string, clave: string, params: Record<string, number> }[]}
 */
export function explicar(resultado, sitio, perfilVista) {
  const { m, e, sistema } = resultado;
  const frases = [];
  const sumar = (regla, tono, params = {}) => frases.push({ regla, tono, clave: `explicar.${perfilVista === "explorar" ? "explorar" : "planificar"}.${regla}`, params });

  // 1. No sobrevive: la noche más larga contra las horas de noche que cubre la batería.
  // Si la noche entra en lo que cubre la batería, la causa es otra (con el Sol a medias los paneles no cubren
  // el consumo de operación) y la frase lo dice: nunca se afirma que la noche es más larga cuando no lo es.
  if (!e.sobrevive) {
    const cubre = horasNocheCubiertas(sistema);
    const falla = e.horaFalla + 1;
    if (m.nocheH === 0 || !Number.isFinite(cubre)) sumar("noSobreviveConLuz", "mal", { falla });
    else if (m.nocheH > Math.floor(cubre)) sumar("noSobrevive", "mal", { noche: m.nocheH, cubre });
    else sumar("noSobrevivePenumbra", "mal", { noche: m.nocheH, cubre, falla });
  }

  // 2 y 3. Contacto con la Tierra: nunca (cara oculta) o solo parte de la misión.
  const tierraMax = elevacionMaxTierra(sitio);
  if (tierraMax <= 0) sumar("sinContacto", "tierra", { el: tierraMax });
  else if (m.senalPct < 100) sumar(sitio.sitio.lat <= LAT_POLAR_SUR ? "contactoParcialRelieve" : "contactoParcial", "tierra", { pct: m.senalPct });

  // 4. Sol rasante.
  if (m.elMax < SOL_RASANTE_DEG) sumar("solRasante", "sol", { el: m.elMax });

  // 5. Luz toda la misión, o sobrevive con poco margen.
  if (e.sobrevive && m.nocheH === 0) sumar("luzToda", "bien");
  else if (e.sobrevive && e.minimoPct < MARGEN_JUSTO_PCT) sumar("pocoMargen", "justo", { minimo: e.minimoPct, reserva: sistema.reservaPct });

  // 6. Coordenadas aproximadas.
  if (sitio.sitio.aproximado) sumar("aproximado", "neutro");

  return frases.slice(0, MAX_FRASES);
}

// Con cuántos decimales se muestra cada número en el perfil con cifras; en explorar van redondeados.
const DECIMALES = { noche: 0, cubre: 0, falla: 0, el: 1, pct: 1, minimo: 0, reserva: 0 };

/**
 * Texto de una frase de explicar().
 * @param {(clave: string, params?: object) => string} t traductor
 * @param {(x: number, decimales?: number) => string} num formato de números del idioma
 */
export function textoExplicacion(frase, t, num) {
  const simple = frase.clave.startsWith("explicar.explorar.");
  const params = {};
  for (const [nombre, valor] of Object.entries(frase.params)) {
    const decimales = simple && nombre !== "el" ? 0 : DECIMALES[nombre] ?? 0;
    // Las horas que cubre la batería se redondean hacia abajo: nunca se promete más de lo que aguanta.
    params[nombre] = num(nombre === "cubre" ? Math.floor(valor) : valor, decimales).replace("-", "−");
  }
  return t(frase.clave, params);
}
