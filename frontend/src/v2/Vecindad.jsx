import { useMemo } from "react";
import { evaluarVecindad, num } from "./calculo";

const RUMBOS = ["norte", "noreste", "este", "sudeste", "sur", "sudoeste", "oeste", "noroeste"];

// Qué le pasa a la misma misión si se aluniza a unos cientos de metros del sitio.
export default function Vecindad({ sitio, vecindad, i0, duracionH, autonomiaH }) {
  const { n, paso_m: paso } = vecindad;
  const celdas = useMemo(() => evaluarVecindad(sitio, vecindad, i0, duracionH, autonomiaH), [sitio, vecindad, i0, duracionH, autonomiaH]);
  const medio = Math.floor(n / 2);
  const centro = celdas[medio * n + medio];

  // El mejor punto: primero que sobreviva, después la noche más corta, después más luz.
  let mejor = medio * n + medio;
  celdas.forEach((c, k) => {
    const m = celdas[mejor];
    if (Number(c.viable) > Number(m.viable) || (c.viable === m.viable && (c.nocheH < m.nocheH || (c.nocheH === m.nocheH && c.luzPct > m.luzPct)))) mejor = k;
  });
  const fila = Math.floor(mejor / n);
  const col = mejor % n;
  const este = (col - medio) * paso;
  const norte = (medio - fila) * paso;
  const distancia = Math.hypot(este, norte);
  const rumbo = RUMBOS[Math.round(((Math.atan2(este, norte) * 180) / Math.PI + 360) / 45) % 8];
  const viables = celdas.filter((c) => c.viable).length;
  const b = celdas[mejor];

  let frase;
  if (mejor === medio * n + medio) frase = "El punto elegido ya es el mejor de los alrededores para esta misión.";
  else {
    const metros = distancia >= 1000 ? `${num(distancia / 1000, 1)} km` : `${num(distancia)} m`;
    frase = `Moviéndote ${metros} hacia el ${rumbo}, la noche más larga pasa de ${centro.nocheH} h a ${b.nocheH} h y la luz de ${num(centro.luzPct)} % a ${num(b.luzPct)} %.`;
  }

  return (
    <div className="vecindad">
      <div className="vecindad-mapa" style={{ "--n": n }} role="img" aria-label={`Mapa de ${n} por ${n} puntos alrededor del sitio. ${viables} de ${celdas.length} sirven para esta misión.`}>
        {celdas.map((c, k) => (
          <i
            key={k}
            className={`${c.viable ? "si" : "no"}${k === medio * n + medio ? " elegido" : ""}${k === mejor && k !== medio * n + medio ? " mejor" : ""}`}
            style={c.viable ? { background: `rgba(255,184,74,${(0.3 + (0.7 * c.luzPct) / 100).toFixed(2)})` } : undefined}
            title={`${num(Math.hypot((k % n) - medio, Math.floor(k / n) - medio) * paso)} m del sitio · luz ${num(c.luzPct)} % · noche más larga ${c.nocheH} h · terreno ${num(c.alturaM)} m${c.viable ? "" : " · no sirve"}`}
          />
        ))}
      </div>
      <div className="vecindad-texto">
        <p className="vecindad-frase">{frase}</p>
        <p className="atenuado">
          Cada cuadro es un punto a {num(paso)} m del siguiente; el mapa cubre {num(((n - 1) * paso) / 1000, 1)} km de lado, con el norte arriba.
          {" "}<b>{viables} de {celdas.length}</b> puntos sirven para esta misión.
        </p>
        <ul className="vecindad-leyenda">
          <li><i className="si" style={{ background: "rgba(255,184,74,1)" }} />Sirve (más claro, más luz)</li>
          <li><i className="no" />No sirve</li>
          <li><i className="si elegido" style={{ background: "transparent" }} />Sitio elegido</li>
          <li><i className="si mejor" style={{ background: "transparent" }} />Mejor punto</li>
        </ul>
        <p className="atenuado nota-chica">Aproximación: usa el relieve de cada punto con la posición del Sol del sitio central.</p>
      </div>
    </div>
  );
}
