import { useState } from "react";
import { enlacesNasa, VALIDACION_ERROR_MAX_DEG, VALIDACION_ERROR_TOPE_DEG, VALIDACION_URL } from "./enlaces";
import { useIdioma } from "./i18n";

// Grupo plegable "Ver en herramientas de NASA" (cerrado al entrar, para que el panel no necesite scroll):
// cada botón abre la herramienta en una pestaña nueva, centrada en el sitio (vista polar al sur de 80° S).
// Las tablas de Horizons son de planificación: solo se muestran en ese perfil. Copiar las coordenadas
// queda siempre, por si algún visor no cae en el sitio.
export default function EnlacesNasa({ lat, lon, inicioMs, finMs, conHorizons }) {
  const { t } = useIdioma();
  const [copiado, setCopiado] = useState(false);
  const e = enlacesNasa({ lat, lon, inicioMs, finMs });
  const ayudaMapa = t(e.moonTrek.vista === "polar-sur" ? "nasa.mapaAyudaPolar" : "nasa.mapaAyuda");

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
    <details className="nasa">
      <summary>{t("nasa.titulo")}</summary>
      <div className="nasa-botones">
        {conHorizons && ["sol", "tierra"].map((c) => (
          <a key={c} className="boton" href={e.horizons[c]} target="_blank" rel="noopener noreferrer" title={t("nasa.horizonsAyuda")}>{t(`nasa.horizons_${c}`)}</a>
        ))}
        <a className="boton" href={e.moonTrek.url} target="_blank" rel="noopener noreferrer" title={ayudaMapa}>Moon Trek</a>
        <a className="boton" href={e.quickmap.url} target="_blank" rel="noopener noreferrer" title={ayudaMapa}>QuickMap</a>
      </div>
      <p className="nasa-coordenadas">
        <span>{t("nasa.buscar")}</span>
        <code>{e.coordenadas}</code>
        <button type="button" onClick={copiar}>{copiado ? t("nasa.copiado") : t("nasa.copiar")}</button>
      </p>
    </details>
  );
}

// Sello con el resultado de docs/VALIDACION.md (el tope y el máximo salen de ese documento; un test lo comprueba).
export function SelloValidacion() {
  const { t, f } = useIdioma();
  return (
    <a
      className="sello-validacion"
      href={VALIDACION_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t("nasa.validadoAyuda", { max: f.num(VALIDACION_ERROR_MAX_DEG, 5) })}
    >
      {t("nasa.validado", { tope: f.num(VALIDACION_ERROR_TOPE_DEG, 4) })}
    </a>
  );
}
