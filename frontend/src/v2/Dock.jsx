import { Fragment, useEffect, useMemo, useState } from "react";
import { porDia, tramos } from "./calculo";
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

// Barra de tiempo fija: fecha y hora de llegada, el año del sitio y el avance dentro de la misión.
export default function Dock({ sitio, dia, horaLlegada, alCambiarLlegada, duracionDias, duracionH, autonomiaH, horaMision, setHoraMision }) {
  const { t, f: formato } = useIdioma();
  const [animando, setAnimando] = useState(false);
  useEffect(() => {
    if (!animando) return undefined;
    const id = setInterval(() => setHoraMision((h) => (h + 1) % duracionH), 70);
    return () => clearInterval(id);
  }, [animando, duracionH, setHoraMision]);

  const { fondo, viables } = useMemo(() => {
    const p = porDia(sitio, duracionH, horaLlegada);
    const paradas = [];
    let n = 0;
    for (let d = 0; d < 365; d++) {
      const ok = p.nocheH[d] <= autonomiaH;
      if (ok) n += 1;
      const color = ok ? `rgba(255,184,74,${(0.3 + (0.7 * p.luzPct[d]) / 100).toFixed(2)})` : "rgba(255,255,255,.08)";
      paradas.push(`${color} ${((d / 365) * 100).toFixed(3)}% ${(((d + 1) / 365) * 100).toFixed(3)}%`);
    }
    return { fondo: `linear-gradient(90deg, ${paradas.join(", ")})`, viables: n };
  }, [sitio, duracionH, autonomiaH, horaLlegada]);

  const f = new Date(sitio.t0 + dia * DIA_MS);
  const i0 = dia * 24 + horaLlegada;
  const partesFecha = { d: dos(f.getUTCDate()), m: dos(f.getUTCMonth() + 1), a: "2027" };

  // Sumar o restar horas cruza de día cuando hace falta.
  function moverHora(delta) {
    const total = Math.max(0, Math.min(364 * 24 + 23, dia * 24 + horaLlegada + delta));
    alCambiarLlegada(Math.floor(total / 24), total % 24);
  }

  return (
    <section className="dock vidrio" aria-label={t("dock.aria")}>
      <div className="dock-fecha">
        <p className="rotulo">{t("dock.llegada")}</p>
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
        <div className="pista anio">
          <div className="pista-color" style={{ background: fondo }} aria-hidden="true" />
          <div className="aro" style={{ left: `${((dia + 0.5) / 365) * 100}%` }} aria-hidden="true" />
          <input type="range" min="0" max="364" value={dia} onChange={(e) => alCambiarLlegada(Number(e.target.value), horaLlegada)} aria-label={t("dock.fechaAria")} />
        </div>
        <div className="meses" aria-hidden="true">{formato.meses.map((m, k) => <span key={k}>{m}</span>)}</div>
        <div className="pista mision">
          <Cinta serie={sitio.luz} desde={i0} hasta={i0 + duracionH} color="var(--acento)" />
          <Cinta serie={sitio.senal} desde={i0} hasta={i0 + duracionH} color="var(--tierra)" />
          <div className="cabezal" style={{ left: `${(horaMision / (duracionH - 1)) * 100}%` }} aria-hidden="true" />
          <input type="range" min="0" max={duracionH - 1} value={horaMision} onChange={(e) => setHoraMision(Number(e.target.value))} aria-label={t("dock.momentoAria")} />
        </div>
        <p className="leyenda"><span><i style={{ background: "var(--acento)" }} />{t("dock.leyendaLuz")}</span><span><i style={{ background: "var(--tierra)" }} />{t("dock.leyendaContacto")}</span><span className="cuenta">{t("dock.cuenta", { n: viables })}</span></p>
      </div>

      <div className="dock-reloj">
        <button type="button" className="reproducir" aria-label={animando ? t("dock.pausar") : t("dock.reproducir")} aria-pressed={animando} onClick={() => setAnimando((a) => !a)}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">{animando ? <path d="M2 1h3.5v12H2zM8.5 1H12v12H8.5z" /> : <path d="M3 1l10 6-10 6z" />}</svg>
        </button>
        <div>
          <p className="rotulo">{t("dock.tiempoMision")}</p>
          <p className="reloj">T+ {dos(Math.floor(horaMision / 24))}d {dos(horaMision % 24)}h</p>
          <p className="rotulo">{t("dock.deDias", { n: duracionDias })}</p>
        </div>
      </div>
    </section>
  );
}
