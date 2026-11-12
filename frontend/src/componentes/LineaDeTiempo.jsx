import { useRef } from "react";
import { useCanvas } from "./useCanvas";
import { formatoFechaCorta } from "../utils/tiempo";

// Margen sobre el relieve del Sol y la Tierra durante todo el período. Clic = ir a ese momento.
export default function LineaDeTiempo({ datos, indice, alCambiar }) {
  const { serie } = datos;
  const mapa = useRef(null);

  const ref = useCanvas((x, W, H) => {
    const L = 40, R = 10, T = 10, B = 22;
    const n = serie.tiempos.length;
    const todos = serie.margen_sol.concat(serie.margen_tierra);
    const lo = Math.floor(Math.min(...todos)), hi = Math.ceil(Math.max(...todos));
    const X = (i) => L + ((W - L - R) * i) / Math.max(1, n - 1);
    const Y = (v) => T + ((H - T - B) * (hi - v)) / Math.max(1, hi - lo);
    const css = getComputedStyle(document.documentElement);
    const color = (v) => css.getPropertyValue(v).trim();

    x.font = "10px IBM Plex Mono, monospace";
    x.strokeStyle = color("--linea");
    x.fillStyle = color("--suave");
    const paso = Math.max(1, Math.round((hi - lo) / 5));
    for (let v = lo; v <= hi; v += paso) {
      x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(W - R, Y(v)); x.stroke();
      x.fillText(`${v}°`, 2, Y(v) + 3);
    }
    const pasoEtiq = Math.max(1, Math.round(n / 6));
    for (let i = 0; i < n; i += pasoEtiq) x.fillText(formatoFechaCorta(serie.tiempos[i]), X(i) + 2, H - 6);

    x.strokeStyle = color("--tinta"); x.globalAlpha = 0.5;
    x.beginPath(); x.moveTo(L, Y(0)); x.lineTo(W - R, Y(0)); x.stroke(); x.globalAlpha = 1;

    const linea = (arr, c) => {
      x.strokeStyle = c; x.lineWidth = 1.8; x.beginPath();
      arr.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
      x.stroke(); x.lineWidth = 1;
    };
    linea(serie.margen_tierra, color("--tierra"));
    linea(serie.margen_sol, color("--sol"));

    x.strokeStyle = color("--tinta");
    x.beginPath(); x.moveTo(X(indice), T); x.lineTo(X(indice), H - B); x.stroke();
    mapa.current = (px) => Math.round(((px - L) / (W - L - R)) * (n - 1));
  }, [datos, indice]);

  const clic = (e) => {
    if (!mapa.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = mapa.current(e.clientX - r.left);
    alCambiar(Math.max(0, Math.min(serie.tiempos.length - 1, i)));
  };

  return (
    <section className="tarjeta">
      <canvas ref={ref} className="linea-tiempo" onClick={clic} aria-label="Margen sobre el horizonte en el tiempo" />
      <div className="leyenda">
        <span><i style={{ background: "var(--sol)" }} />Sol: grados sobre el relieve</span>
        <span><i style={{ background: "var(--tierra)" }} />Tierra: grados sobre el relieve</span>
        <span>Por encima de 0 = visible. Tocá el gráfico para ir a ese momento.</span>
      </div>
    </section>
  );
}
