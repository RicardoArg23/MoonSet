import { Fragment, useEffect, useMemo, useState } from "react";
import { porDia, tramos } from "./calculo";
import { sobrevivePorDia } from "./energia";
import { useIdioma } from "./i18n";

const DIA_MS = 86_400_000;
const dos = (n) => String(n).padStart(2, "0");

function Cinta({ serie, desde, hasta, color }) {
  return (
    <div className="cinta">
      {tramos(serie, desde, hasta).map((t, k) => (
        <i key={k} style={{ flex: `${t.horas} 1 0`, background: t.valor ? color : "var(--apagado)" }} />
      ))}
    </div>
  );
}

// Estado de carga de la batería hora por hora, con la reserva punteada. Comparte el ancho y el
// cabezal con las cintas de luz y contacto, así cada hora queda alineada.
function CurvaCarga({ soc, reservaPct, sobrevive }) {
  const n = soc.length;
  let puntos = "";
  for (let k = 0; k < n; k++) puntos += `${k + 0.5},${(1 - soc[k]).toFixed(4)} `;
  const yReserva = 1 - reservaPct / 100;
  return (
    <svg className="curva-carga" viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0.5,1 ${puntos}${n - 0.5},1`} fill={sobrevive ? "rgba(123,220,162,.16)" : "rgba(255,156,138,.16)"} />
      <polyline points={puntos} fill="none" stroke={sobrevive ? "var(--bien)" : "var(--mal)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2={n} y1={yReserva} y2={yReserva} stroke="var(--texto-2)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Barra de tiempo fija: fecha y hora de llegada, el año del sitio y el avance dentro de la misión.
 * Con `previa` (modo planificación) muestra otra misión sin tocar la app: sitio, día, sistema y duración llegan por
 * props, los controles quedan quietos y se marcan la ventana de tolerancia y la fecha elegida.
 * @param {{ nombre: string, desde: number, hasta: number, elegido: number } | null} [previa] días de la ventana (inclusive)
 */
export default function Dock({ esperando = false, previa = null, sitio, dia, horaLlegada, alCambiarLlegada, duracionDias, duracionH, sistema, soc, sobrevive, horaMision, setHoraMision }) {
  const { t, f: formato } = useIdioma();
  const [animando, setAnimando] = useState(false);
  const enPrevia = previa !== null;
  useEffect(() => {
    if (enPrevia) setAnimando(false); // la vista previa no reproduce la misión de la app
  }, [enPrevia]);
  useEffect(() => {
    if (!animando) return undefined;
    const id = setInterval(() => setHoraMision((h) => (h + 1) % duracionH), 70);
    return () => clearInterval(id);
  }, [animando, duracionH, setHoraMision]);
  const hora = enPrevia ? 0 : horaMision;

  const { fondo, viables } = useMemo(() => {
    const p = porDia(sitio, duracionH, horaLlegada);
    const sirve = sobrevivePorDia(sitio, sistema, duracionH, horaLlegada);
    const paradas = [];
    let n = 0;
    for (let d = 0; d < 365; d++) {
      const ok = sirve[d] === 1;
      if (ok) n += 1;
      const color = ok ? `rgba(255,184,74,${(0.3 + (0.7 * p.luzPct[d]) / 100).toFixed(2)})` : "rgba(255,255,255,.08)";
      paradas.push(`${color} ${((d / 365) * 100).toFixed(3)}% ${(((d + 1) / 365) * 100).toFixed(3)}%`);
    }
    return { fondo: `linear-gradient(90deg, ${paradas.join(", ")})`, viables: n };
  }, [sitio, duracionH, sistema, horaLlegada]);

  const f = new Date(sitio.t0 + dia * DIA_MS);
  const i0 = dia * 24 + horaLlegada;
  const partesFecha = { d: dos(f.getUTCDate()), m: dos(f.getUTCMonth() + 1), a: "2027" };

  // Sumar o restar horas cruza de día cuando hace falta.
  function moverHora(delta) {
    const total = Math.max(0, Math.min(364 * 24 + 23, dia * 24 + horaLlegada + delta));
    alCambiarLlegada(Math.floor(total / 24), total % 24);
  }

  const pct = (d) => `${((d / 365) * 100).toFixed(3)}%`;
  const quieto = esperando || enPrevia; // en la vista previa no se puede mover nada: todavía no se aplicó

  return (
    <section className={`dock vidrio${esperando ? " esperando" : ""}${enPrevia ? " previa" : ""}`} aria-label={enPrevia ? t("dock.previaAria", { sitio: previa.nombre }) : t("dock.aria")} aria-hidden={esperando || undefined}>
      {enPrevia && <p className="dock-previa" role="status">{t("dock.previa", { sitio: previa.nombre })}</p>}
      <div className="dock-fecha" inert={quieto ? "" : undefined}>
        <p className="rotulo">{enPrevia ? t("dock.mejorLlegada") : t("dock.llegada")}</p>
        <p className="fecha-grande" aria-label={`${formato.fechaLarga(f.getTime())} 2027`}>
          {t("formato.ordenFecha").split("").map((parte, k) => (
            <Fragment key={parte}>{k > 0 && <i>·</i>}<span className={parte === "a" ? "fecha-anio" : undefined}>{partesFecha[parte]}</span></Fragment>
          ))}
        </p>
        <div className="hora">
          <button type="button" aria-label={t("dock.horaAntes")} onClick={() => moverHora(-1)}>−</button>
          <span>{dos(horaLlegada)}:00 UTC</span>
          <button type="button" aria-label={t("dock.horaDespues")} onClick={() => moverHora(1)}>+</button>
        </div>
      </div>

      <div className="dock-lineas">
        <div className="pista anio" data-tutorial="fecha" inert={quieto ? "" : undefined}>
          <div className="pista-color" style={{ background: fondo }} aria-hidden="true" />
          {enPrevia && (
            <>
              <div className="ventana" style={{ left: pct(previa.desde), width: pct(previa.hasta - previa.desde + 1) }} aria-hidden="true" />
              <div className="elegido" style={{ left: pct(previa.elegido + 0.5) }} aria-hidden="true" />
            </>
          )}
          <div className="aro" style={{ left: pct(dia + 0.5) }} aria-hidden="true" />
          <input type="range" min="0" max="364" value={dia} onChange={(e) => alCambiarLlegada(Number(e.target.value), horaLlegada)} aria-label={t("dock.fechaAria")} />
        </div>
        <div className="meses" aria-hidden="true">{formato.meses.map((m, k) => <span key={k}>{m}</span>)}</div>
        <div className="pista mision" inert={quieto ? "" : undefined}>
          <Cinta serie={sitio.luz} desde={i0} hasta={i0 + duracionH} color="var(--acento)" />
          <Cinta serie={sitio.senal} desde={i0} hasta={i0 + duracionH} color="var(--tierra)" />
          <CurvaCarga soc={soc} reservaPct={sistema.reservaPct} sobrevive={sobrevive} />
          {!enPrevia && <div className="cabezal" style={{ left: `${(hora / (duracionH - 1)) * 100}%` }} aria-hidden="true" />}
          <input type="range" min="0" max={duracionH - 1} value={Math.min(hora, duracionH - 1)} onChange={(e) => setHoraMision(Number(e.target.value))} aria-label={t("dock.momentoAria")} />
        </div>
        {enPrevia ? (
          <p className="leyenda"><span><i className="ventana-muestra" />{t("dock.leyendaVentana")}</span><span><i className="aro-muestra" />{t("dock.leyendaMejor")}</span><span><i style={{ background: "var(--acento)" }} />{t("dock.leyendaLuz")}</span><span><i style={{ background: "var(--tierra)" }} />{t("dock.leyendaContacto")}</span><span className="cuenta">{t("dock.cuenta", { n: viables })}</span></p>
        ) : (
          <p className="leyenda"><span><i style={{ background: "var(--acento)" }} />{t("dock.leyendaLuz")}</span><span><i style={{ background: "var(--tierra)" }} />{t("dock.leyendaContacto")}</span><span><i style={{ background: "var(--bien)" }} />{t("dock.leyendaBateria")}</span><span className="cuenta">{t("dock.cuenta", { n: viables })}</span></p>
        )}
      </div>

      <div className="dock-reloj" inert={quieto ? "" : undefined}>
        <button type="button" className="reproducir" aria-label={animando ? t("dock.pausar") : t("dock.reproducir")} aria-pressed={animando} onClick={() => setAnimando((a) => !a)}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">{animando ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" /> : <path d="M3 1l10 6-10 6z" />}</svg>
        </button>
        <div>
          <p className="rotulo">{enPrevia ? t(sobrevive ? "panel.sobrevive" : "panel.noSobrevive") : t("dock.tiempoMision")}</p>
          <p className={`reloj${enPrevia ? (sobrevive ? " si" : " no") : ""}`}>{enPrevia ? t("plan.etiquetaDuracion", { n: duracionDias }) : `T+ ${dos(Math.floor(hora / 24))}d ${dos(hora % 24)}h`}</p>
          <p className="rotulo">{enPrevia ? t("dock.previaNoAplicada") : t("dock.deDias", { n: duracionDias })}</p>
        </div>
      </div>
    </section>
  );
}
