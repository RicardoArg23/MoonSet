import { fraccionDisco } from "./calculo";
import { rico, useIdioma } from "./i18n";

const ANCHO = 1200;
const ALTO = 380;

// Lo que se ve parado en el sitio en el momento elegido: relieve, Sol y Tierra.
export default function VistaHorizonte({ sitio, i }) {
  const { t, f } = useIdioma();
  const { num, conSigno, cardinal, duracion } = f;
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
  if (solVisible && solEl < 0) porQue = t("horizonte.porQueIlumina", { bajo: num(-solEl, 1), relieve: num(-relieveSol, 1) });
  else if (!solVisible && solEl > 0) porQue = t("horizonte.porQueTapa", { sobre: num(solEl, 1), relieve: num(relieveSol, 1) });

  return (
    <div className="vista-horizonte">
      <div className="estados">
        <p className={solVisible ? "estado si" : "estado no"}>
          <i className="punto sol" aria-hidden="true" />
          <span>{solVisible ? t("horizonte.hayLuz") : t("horizonte.noHayLuz")} {hSol === null ? t("horizonte.sinCambios") : rico(t(solVisible ? "horizonte.solSePone" : "horizonte.solSale", { t: duracion(hSol) }))}</span>
        </p>
        <p className={tierraVisible ? "estado si" : "estado no"}>
          <i className="punto tierra" aria-hidden="true" />
          <span>{tierraVisible ? t("horizonte.hayContacto") : t("horizonte.sinContacto")} {hTierra === null ? (tierraVisible ? t("horizonte.tierraSiempre") : t("horizonte.tierraNunca")) : rico(t(tierraVisible ? "horizonte.tierraSeOculta" : "horizonte.tierraAparece", { t: duracion(hTierra) }))}</span>
        </p>
      </div>

      <svg
        role="img"
        aria-label={t("horizonte.panoramaAria", { sol: num(solEl, 1), tierra: num(tieEl, 1) })}
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
        <text x={ANCHO / 2} y={Y(0) + 17} textAnchor="middle" className="eje">{t("horizonte.horizontePlano")}</text>
        {tierraEnCuadro && <text x={dentro(X(tieAz))} y={Math.max(20, Y(tieEl) - 26)} textAnchor="middle" className="rotulo">{t("horizonte.tierraRotulo", { el: conSigno(tieEl, 1) })}{tierraVisible ? "" : t("horizonte.oculta")}</text>}
        {solEnCuadro && <text x={dentro(X(solAz))} y={Math.max(20, Y(solEl) - 36)} textAnchor="middle" className="rotulo">{t("horizonte.solRotulo", { el: conSigno(solEl, 1) })}{solVisible ? "" : t("horizonte.oculto")}</text>}
        {!solEnCuadro && <text x={dentro(X(solAz))} y={ALTO - 34} textAnchor="middle" className="rotulo">{t("horizonte.solBajo", { el: num(-solEl) })}</text>}
        {!tierraEnCuadro && <text x={dentro(X(tieAz))} y={ALTO - 56} textAnchor="middle" className="rotulo">{t("horizonte.tierraBajo", { el: num(-tieEl) })}</text>}
        <text x="12" y={ALTO - 12} className="eje">{t("horizonte.norte")}</text>
        <text x={ANCHO / 4} y={ALTO - 12} textAnchor="middle" className="eje">{t("horizonte.este")}</text>
        <text x={ANCHO / 2} y={ALTO - 12} textAnchor="middle" className="eje">{t("horizonte.sur")}</text>
        <text x={(ANCHO * 3) / 4} y={ALTO - 12} textAnchor="middle" className="eje">{t("horizonte.oeste")}</text>
      </svg>

      <div className="exactos">
        <p><b>{t("horizonte.sol")}</b> {t("horizonte.exactoSol", { el: conSigno(solEl), margen: conSigno(sitio.margenSol[i]), az: num(solAz, 1), cardinal: cardinal(solAz), disco: num(100 * fraccionDisco(sitio.margenSol[i])) })}</p>
        <p><b>{t("horizonte.tierra")}</b> {t("horizonte.exactoTierra", { el: conSigno(tieEl), margen: conSigno(sitio.margenTierra[i]), az: num(tieAz, 1), cardinal: cardinal(tieAz) })}</p>
        <p className="porque">{porQue || t("horizonte.nota")}</p>
      </div>
    </div>
  );
}
