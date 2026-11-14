import { useState } from "react";
import { enlacesNasa } from "./enlaces";
import { useIdioma } from "./i18n";

// Grupo "Ver en herramientas de NASA": cada botón abre la herramienta en una pestaña nueva, centrada
// en el sitio. Si falta un deep link confiable (por ahora, la vista polar), se ofrece copiar las
// coordenadas para el buscador de QuickMap.
export default function EnlacesNasa({ lat, lon, inicioMs, finMs }) {
  const { t } = useIdioma();
  const [cuerpo, setCuerpo] = useState("sol");
  const [copiado, setCopiado] = useState(false);
  const e = enlacesNasa({ lat, lon, inicioMs, finMs });
  const sinDeepLink = [e.moonTrek, e.quickmap].some((x) => !x.deepLink || x.vistaPolarPendiente);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(e.coordenadas);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso para el portapapeles: las coordenadas igual quedan a la vista para copiarlas a mano.
    }
  }

  return (
    <div className="nasa">
      <p className="rotulo">{t("nasa.titulo")}</p>
      <div className="nasa-botones">
        <span className="nasa-horizons">
          <a className="boton" href={e.horizons[cuerpo]} target="_blank" rel="noopener noreferrer" title={t("nasa.horizonsAyuda")}>{t("nasa.horizons")}</a>
          <span className="segmentos" role="group" aria-label={t("nasa.cuerpo")}>
            {["sol", "tierra"].map((c) => (
              <button key={c} type="button" aria-pressed={cuerpo === c} onClick={() => setCuerpo(c)}>{t(`nasa.${c}`)}</button>
            ))}
          </span>
        </span>
        <a className="boton" href={e.moonTrek.url} target="_blank" rel="noopener noreferrer" title={t("nasa.mapaAyuda")}>Moon Trek</a>
        <a className="boton" href={e.quickmap.url} target="_blank" rel="noopener noreferrer" title={t("nasa.mapaAyuda")}>QuickMap</a>
      </div>
      {sinDeepLink && (
        <p className="nasa-coordenadas">
          <span>{t("nasa.buscar")}</span>
          <code>{e.coordenadas}</code>
          <button type="button" onClick={copiar}>{copiado ? t("nasa.copiado") : t("nasa.copiar")}</button>
        </p>
      )}
    </div>
  );
}
