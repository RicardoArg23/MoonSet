import { useMemo } from "react";
import { evaluarVecindad } from "./calculo";
import { rico, useIdioma } from "./i18n";

// Qué le pasa a la misma misión si se aluniza a unos cientos de metros del sitio.
export default function Vecindad({ sitio, vecindad, i0, duracionH, autonomiaH }) {
  const { t, f } = useIdioma();
  const { num } = f;
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
  const rumbo = f.rumbo((Math.atan2(este, norte) * 180) / Math.PI);
  const viables = celdas.filter((c) => c.viable).length;
  const b = celdas[mejor];

  let frase;
  if (mejor === medio * n + medio) frase = t("alrededores.yaMejor");
  else {
    const metros = distancia >= 1000 ? `${num(distancia / 1000, 1)} km` : `${num(distancia)} m`;
    frase = t("alrededores.frase", { distancia: metros, rumbo, noche0: centro.nocheH, noche1: b.nocheH, luz0: num(centro.luzPct), luz1: num(b.luzPct) });
  }

  return (
    <div className="vecindad">
      <div className="vecindad-mapa" style={{ "--n": n }} role="img" aria-label={t("alrededores.mapaAria", { n, viables, total: celdas.length })}>
        {celdas.map((c, k) => (
          <i
            key={k}
            className={`${c.viable ? "si" : "no"}${k === medio * n + medio ? " elegido" : ""}${k === mejor && k !== medio * n + medio ? " mejor" : ""}`}
            style={c.viable ? { background: `rgba(255,184,74,${(0.3 + (0.7 * c.luzPct) / 100).toFixed(2)})` } : undefined}
            title={t("alrededores.celda", { distancia: num(Math.hypot((k % n) - medio, Math.floor(k / n) - medio) * paso), luz: num(c.luzPct), noche: c.nocheH, altura: num(c.alturaM) }) + (c.viable ? "" : t("alrededores.noSirveSufijo"))}
          />
        ))}
      </div>
      <div className="vecindad-texto">
        <p className="vecindad-frase">{frase}</p>
        <p className="atenuado">
          {t("alrededores.explicacion", { paso: num(paso), lado: num(((n - 1) * paso) / 1000, 1) })}
          {" "}{rico(t("alrededores.cuenta", { viables, total: celdas.length }))}
        </p>
        <ul className="vecindad-leyenda">
          <li><i className="si" style={{ background: "rgba(255,184,74,1)" }} />{t("alrededores.leyendaSirve")}</li>
          <li><i className="no" />{t("alrededores.leyendaNoSirve")}</li>
          <li><i className="si elegido" style={{ background: "transparent" }} />{t("alrededores.leyendaElegido")}</li>
          <li><i className="si mejor" style={{ background: "transparent" }} />{t("alrededores.leyendaMejor")}</li>
        </ul>
        <p className="atenuado nota-chica">{t("alrededores.aproximacion")}</p>
      </div>
    </div>
  );
}
