// Asa para plegar un panel flotante sin quitarlo: el borde se curva para alojar la flecha. Desplegada es una
// pestaña del mismo vidrio que el panel (recortado con la forma de la curva) y tapa el tramo de borde que
// queda detrás, así se lee como una sola pieza; plegada queda la línea del borde con esa misma curva.
const FORMAS = {
  // lado "panel": pestaña vertical que sale hacia la derecha
  panel: { ancho: 14, alto: 72, curva: "M0.5 0C0.5 16 13.5 18 13.5 36C13.5 54 0.5 56 0.5 72", tapa: "M0.5 3V69", flecha: "M5 1L1 5l4 4", caja: [6, 10] },
  // lado "dock": pestaña horizontal que sale hacia arriba
  dock: { ancho: 72, alto: 14, curva: "M0 13.5C16 13.5 18 0.5 36 0.5C54 0.5 56 13.5 72 13.5", tapa: "M3 13.5H69", flecha: "M1 1l4 4 4-4", caja: [10, 6] },
};

/**
 * @param {{ lado: "panel" | "dock", plegada: boolean, etiqueta: string, alAlternar: () => void }} props
 */
export default function Asa({ lado, plegada, etiqueta, alAlternar }) {
  const { ancho, alto, curva, tapa, flecha, caja } = FORMAS[lado];
  return (
    <div className={`asa asa-${lado}${plegada ? " plegada" : ""}`}>
      <i className="asa-linea" aria-hidden="true" />
      <button type="button" aria-expanded={!plegada} aria-label={etiqueta} onClick={alAlternar}>
        <span className="asa-vidrio" style={{ clipPath: `path("${curva}Z")` }} aria-hidden="true" />
        <svg className="asa-forma" width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
          <path className="asa-tapa" d={tapa} />
          <path className="asa-trazo" d={curva} />
        </svg>
        <svg className="asa-flecha" width={caja[0]} height={caja[1]} viewBox={`0 0 ${caja[0]} ${caja[1]}`} aria-hidden="true">
          <path d={flecha} />
        </svg>
      </button>
      <i className="asa-linea" aria-hidden="true" />
    </div>
  );
}
