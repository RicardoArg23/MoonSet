// "Próximamente": modelos que MoonSet sumaría con más tiempo. Son placeholders honestos: acá no hay ningún
// cálculo ni valor de ejemplo, solo qué modelo es y qué textos muestra. Sin React, se prueba con Node
// (tests/proximamente.test.js). Los textos están en i18n (proximamente.*).

/**
 * Los tres modelos, en orden de prioridad. `rotuloHoy` dice cómo se titula la primera parte del detalle:
 * "hoy" si la app ya tiene algo simplificado, "porQueNo" si todavía no hay nada.
 */
export const MODELOS = [
  { id: "termico", prioridad: 1, rotuloHoy: "hoy", formula: null },
  { id: "radiacion", prioridad: 2, rotuloHoy: "porQueNo", formula: null },
  // Probabilidad de al menos un impacto dañino: flujo F, área expuesta A, tiempo t. En texto plano, sin librerías.
  { id: "micrometeoritos", prioridad: 3, rotuloHoy: "porQueNo", formula: "P = 1 − e^(−F·A·t)" },
];
export const IDS_MODELOS = MODELOS.map((m) => m.id);
/** Partes del detalle (perfil planificar), en el orden en que se muestran. */
export const PARTES = ["hoy", "proximamente", "datos", "resultado"];

/**
 * Lo que muestra la tarjeta de un modelo. En explorar: la pregunta simple y un párrafo corto.
 * En planificar: la pregunta y el detalle (qué hay hoy, qué haría, datos, resultado y la fórmula si tiene).
 * @param {(clave: string, params?: object) => string} t traductor
 * @param {string} id "termico" | "radiacion" | "micrometeoritos"
 * @param {"explorar"|"planificar"} perfilVista
 */
export function contenidoModelo(t, id, perfilVista) {
  const modelo = MODELOS.find((m) => m.id === id);
  const base = `proximamente.modelos.${id}`;
  const simple = perfilVista === "explorar";
  return {
    id,
    nombre: t(`${base}.nombre`),
    prioridad: t("proximamente.prioridad", { n: modelo.prioridad }),
    estado: t("proximamente.enDesarrollo"),
    pregunta: t(`${base}.${simple ? "preguntaSimple" : "pregunta"}`),
    partes: simple
      ? [{ rotulo: null, texto: t(`${base}.simple`) }]
      : PARTES.map((parte) => ({ rotulo: t(`proximamente.rotulos.${parte === "hoy" ? modelo.rotuloHoy : parte}`), texto: t(`${base}.${parte}`) })),
    formula: !simple && modelo.formula ? { texto: modelo.formula, leyenda: t(`${base}.formulaLeyenda`) } : null,
  };
}

/** Todo el contenido del modal: título, subtítulo, los tres modelos y la nota final sobre el terreno. */
export function contenidoModal(t, perfilVista) {
  return {
    titulo: t("proximamente.titulo"),
    subtitulo: t("proximamente.subtitulo"),
    modelos: IDS_MODELOS.map((id) => contenidoModelo(t, id, perfilVista)),
    nota: t("proximamente.nota"),
  };
}
