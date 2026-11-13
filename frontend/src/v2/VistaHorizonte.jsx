import { cardinal, conSigno, fraccionDisco, num } from "./calculo";

const ANCHO = 1200;
const ALTO = 380;

function enHoras(h) {
  return h < 72 ? `${h} h` : `${num(h / 24, 1)} días`;
}

// Lo que se ve parado en el sitio en el momento elegido: relieve, Sol y Tierra.
export default function VistaHorizonte({ sitio, i }) {
  const hz = sitio.horizonte.grados;
  const solEl = sitio.sol_el[i];
  const solAz = sitio.sol_az[i];
  const tieEl = sitio.tierra_el[i];
  const tieAz = sitio.tierra_az[i];
  const solVisible = sitio.luz[i] === 1;
  const tierraVisible = sitio.senal[i] === 1;

  let hSol = null;
  let hTierra = null;
  for (let k = i + 1; k < sitio.muestras; k++) {
    if (hSol === null && sitio.luz[k] !== sitio.luz[i]) hSol = k - i;
    if (hTierra === null && sitio.senal[k] !== sitio.senal[i]) hTierra = k - i;
    if (hSol !== null && hTierra !== null) break;
  }

  // Rango vertical: en el polo todo pasa pegado al horizonte; en el ecuador el Sol sube hasta 90°.
  const eMax = Math.min(90, Math.max(8, Math.max(...hz) + 2, solEl + 4, tieEl + 4));
  const eMin = Math.min(-4, Math.min(...hz) - 1);
  const X = (az) => ((((az % 360) + 360) % 360) / 360) * ANCHO;
  const Y = (el) => ((eMax - el) / (eMax - eMin)) * ALTO;
  const dentro = (x) => Math.max(80, Math.min(ANCHO - 80, x));

  let relieve = `M0,${ALTO}`;
  for (let a = 0; a < 360; a++) relieve += ` L${X(a).toFixed(1)},${Y(hz[a]).toFixed(1)}`;
  relieve += ` L${ANCHO},${Y(hz[0]).toFixed(1)} L${ANCHO},${ALTO} Z`;

  const solEnCuadro = solEl > eMin;
  const tierraEnCuadro = tieEl > eMin;
  const relieveSol = solEl - sitio.margenSol[i];
  let porQue = "";
  if (solVisible && solEl < 0) porQue = `El Sol está ${num(-solEl, 1)}° bajo el horizonte plano y aun así ilumina: el terreno cae ${num(-relieveSol, 1)}° en esa dirección.`;
  else if (!solVisible && solEl > 0) porQue = `El Sol está ${num(solEl, 1)}° sobre el horizonte plano pero no se ve: el terreno se levanta ${num(relieveSol, 1)}° en esa dirección.`;

  return (
    <div className="vista-horizonte">
      <div className="estados">
        <p className={solVisible ? "estado si" : "estado no"}>
          <i className="punto sol" aria-hidden="true" />
          <span>{solVisible ? "Hay luz." : "No hay luz."} {hSol === null ? "Sin cambios en lo que queda del año." : <>El Sol {solVisible ? "se pone" : "sale"} en <b>{enHoras(hSol)}</b>.</>}</span>
        </p>
        <p className={tierraVisible ? "estado si" : "estado no"}>
          <i className="punto tierra" aria-hidden="true" />
          <span>{tierraVisible ? "Hay contacto." : "Sin contacto."} {hTierra === null ? (tierraVisible ? "La Tierra se ve siempre." : "La Tierra no se ve nunca desde acá.") : <>La Tierra {tierraVisible ? "se oculta" : "aparece"} en <b>{enHoras(hTierra)}</b>.</>}</span>
        </p>
      </div>

      <svg
        role="img"
        aria-label={`Panorama del horizonte. Sol a ${num(solEl, 1)} grados de elevación. Tierra a ${num(tieEl, 1)} grados.`}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="cielo"
      >
        <line x1="0" x2={ANCHO} y1={Y(0)} y2={Y(0)} className="plano" />
        {solEnCuadro && (
          <g className="astro" style={{ transform: `translate(${X(solAz)}px, ${Y(solEl)}px)` }}>
            <circle r="28" className="sol-halo" />
            <circle r="9" className="sol-disco" />
          </g>
        )}
        {tierraEnCuadro && (
          <g className="astro" style={{ transform: `translate(${X(tieAz)}px, ${Y(tieEl)}px)` }}>
            <circle r="15" className="tierra-disco" />
          </g>
        )}
        <path d={relieve} className="relieve" />
        <text x={ANCHO / 2} y={Y(0) + 17} textAnchor="middle" className="eje">horizonte plano</text>
        {tierraEnCuadro && <text x={dentro(X(tieAz))} y={Math.max(20, Y(tieEl) - 26)} textAnchor="middle" className="rotulo">Tierra, {conSigno(tieEl, 1)}°{tierraVisible ? "" : " (oculta)"}</text>}
        {solEnCuadro && <text x={dentro(X(solAz))} y={Math.max(20, Y(solEl) - 36)} textAnchor="middle" className="rotulo">Sol, {conSigno(solEl, 1)}°{solVisible ? "" : " (oculto)"}</text>}
        {!solEnCuadro && <text x={dentro(X(solAz))} y={ALTO - 34} textAnchor="middle" className="rotulo">Sol, {num(-solEl)}° bajo el horizonte</text>}
        {!tierraEnCuadro && <text x={dentro(X(tieAz))} y={ALTO - 56} textAnchor="middle" className="rotulo">Tierra, {num(-tieEl)}° bajo el horizonte</text>}
        <text x="12" y={ALTO - 12} className="eje">Norte</text>
        <text x={ANCHO / 4} y={ALTO - 12} textAnchor="middle" className="eje">Este</text>
        <text x={ANCHO / 2} y={ALTO - 12} textAnchor="middle" className="eje">Sur</text>
        <text x={(ANCHO * 3) / 4} y={ALTO - 12} textAnchor="middle" className="eje">Oeste</text>
      </svg>

      <div className="exactos">
        <p><b>Sol</b> elevación {conSigno(solEl)}° · {conSigno(sitio.margenSol[i])}° sobre el relieve · azimut {num(solAz, 1)}° ({cardinal(solAz)}) · disco visible {num(100 * fraccionDisco(sitio.margenSol[i]))} %</p>
        <p><b>Tierra</b> elevación {conSigno(tieEl)}° · {conSigno(sitio.margenTierra[i])}° sobre el relieve · azimut {num(tieAz, 1)}° ({cardinal(tieAz)})</p>
        <p className="porque">{porQue || "Parado en el sitio, a 2 m del suelo. El Sol cuenta como visible si asoma el borde del disco."}</p>
      </div>
    </div>
  );
}
