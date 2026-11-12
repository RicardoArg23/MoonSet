import { useMemo } from "react";
import { useCanvas } from "./useCanvas";
import { alturaHorizonte } from "../utils/tiempo";

// Vista 360° "como si estuvieras parado en el sitio": relieve, Sol y Tierra en el momento elegido.
export default function VistaPanoramica({ datos, indice }) {
  const { serie, horizonte } = datos;
  const hz = horizonte.grados;

  // Rango vertical: en el polo todo pasa cerca del horizonte; en el ecuador el Sol sube hasta 90°.
  const rango = useMemo(() => {
    const maxObj = Math.max(...serie.sol_elevacion, ...serie.tierra_elevacion);
    const emax = Math.min(90, Math.max(8, maxObj + 3, Math.max(...hz) + 3));
    const minObj = Math.min(...serie.sol_elevacion, ...serie.tierra_elevacion);
    const emin = Math.max(-12, Math.min(-6, Math.min(...hz) - 2, minObj - 2));
    return { emin, emax };
  }, [serie, hz]);

  const ref = useCanvas((x, W, H) => {
    const { emin, emax } = rango;
    const X = (az) => (az / 360) * W;
    const Y = (el) => (H * (emax - el)) / (emax - emin);
    const luz = serie.luz[indice] === 1;

    x.fillStyle = "#05070b";
    x.fillRect(0, 0, W, H);
    let semilla = 7;
    const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
    x.fillStyle = "rgba(255,255,255,.5)";
    for (let k = 0; k < 90; k++) x.fillRect(rnd() * W, rnd() * H * 0.7, 1, 1);

    // grilla de elevación
    const paso = emax - emin > 40 ? 15 : emax - emin > 20 ? 5 : 2;
    x.font = "10px IBM Plex Mono, monospace";
    for (let e = Math.ceil(emin / paso) * paso; e <= emax; e += paso) {
      x.strokeStyle = e === 0 ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.07)";
      x.setLineDash(e === 0 ? [4, 4] : []);
      x.beginPath(); x.moveTo(0, Y(e)); x.lineTo(W, Y(e)); x.stroke();
      if (e > 0 && Y(e) > 34) { x.fillStyle = "rgba(255,255,255,.4)"; x.fillText(`+${e}°`, 6, Y(e) - 3); }
    }
    x.setLineDash([]);

    // Sol y Tierra, antes del relieve para que el relieve los tape
    const sx = X(serie.sol_azimut[indice]), sy = Y(serie.sol_elevacion[indice]);
    const g = x.createRadialGradient(sx, sy, 0, sx, sy, 34);
    g.addColorStop(0, "rgba(255,214,120,.55)"); g.addColorStop(1, "rgba(255,214,120,0)");
    x.fillStyle = g; x.beginPath(); x.arc(sx, sy, 34, 0, 7); x.fill();
    x.fillStyle = "#ffe7a8"; x.beginPath(); x.arc(sx, sy, 8, 0, 7); x.fill();

    const ex = X(serie.tierra_azimut[indice]), ey = Y(serie.tierra_elevacion[indice]);
    const eg = x.createRadialGradient(ex - 3, ey - 3, 1, ex, ey, 11);
    eg.addColorStop(0, "#bfe0ff"); eg.addColorStop(0.6, "#3f86e0"); eg.addColorStop(1, "#173f7a");
    x.fillStyle = eg; x.beginPath(); x.arc(ex, ey, 11, 0, 7); x.fill();

    // relieve
    const tg = x.createLinearGradient(0, Y(2), 0, H);
    tg.addColorStop(0, luz ? "#8b8f97" : "#2a2d33"); tg.addColorStop(1, luz ? "#3c3f45" : "#121417");
    x.fillStyle = tg; x.beginPath(); x.moveTo(0, H);
    for (let a = 0; a <= 360; a += 0.5) x.lineTo(X(a), Y(alturaHorizonte(hz, a)));
    x.lineTo(W, H); x.closePath(); x.fill();

    const etiqueta = (px, py, texto, oculto) => {
      x.fillStyle = oculto ? "rgba(255,255,255,.55)" : "#fff";
      x.font = "600 11px IBM Plex Sans, sans-serif";
      x.fillText(texto + (oculto ? " (oculto)" : ""), Math.min(Math.max(px + 14, 4), W - 100), Math.min(Math.max(py - 12, 30), H - 24));
    };
    etiqueta(sx, sy, "Sol", !luz);
    etiqueta(ex, ey, "Tierra", serie.senal[indice] !== 1);

    x.fillStyle = "rgba(255,255,255,.75)";
    x.font = "500 11px IBM Plex Mono, monospace";
    [["N", 0], ["E", 90], ["S", 180], ["O", 270], ["N", 360]].forEach(([n, a]) =>
      x.fillText(n, Math.min(Math.max(X(a) - 4, 4), W - 12), H - 8));
  }, [datos, indice, rango]);

  return (
    <div className="vista">
      <canvas ref={ref} className="pano" aria-label="Vista panorámica 360° desde el sitio" />
      <span className="vista-nota">
        Vista 360° desde el sitio · relieve: {horizonte.fuente === "esfera" ? "sin DEM (solo curvatura)" : "LOLA"}
      </span>
    </div>
  );
}
