import { useState } from "react";
import { useIdioma } from "./i18n";
import { descartarOferta, instalarApp, useInstalar } from "./instalar.js";
import "./instalar.css";

const COMPARTIR = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M6 12v7h12v-7" /></svg>;

/** Ofrecimiento flotante para instalar MoonSet. Aparece solo si se puede instalar y no se descartó antes. */
export function OfertaInstalar() {
  const { t } = useIdioma();
  const { modo, descartado } = useInstalar();
  const hay = Boolean(modo) && !descartado;
  // Aparece junto con la portada (sin espera: si no, se podía entrar a la herramienta sin verla). El lugar se reserva desde que se sabe que se puede instalar.
  return (
    <div className={`instalar-reserva${hay ? " abierta" : ""}`}>
      {hay && (
        <aside className={`instalar-oferta${modo === "ios" ? " instalar-ios" : ""}`} role="region" aria-label={t("instalar.titulo")}>
          <img src={`${import.meta.env.BASE_URL}marca/icono-192.png`} alt="" width="44" height="44" />
          <div className="instalar-texto">
            <b>{t("instalar.titulo")}</b>
            {modo === "nativo" ? <small>{t("instalar.detalle")}</small> : <small>{t("instalar.pasosIOS1")}{COMPARTIR}{t("instalar.pasosIOS2")}</small>}
          </div>
          <div className="instalar-acciones">
            {modo === "nativo" && <button type="button" className="primario" onClick={async () => { if (await instalarApp()) descartarOferta(); }}>{t("instalar.boton")}</button>}
            <button type="button" className="instalar-descartar" aria-label={modo === "nativo" ? t("instalar.ahoraNo") : t("instalar.entendido")} onClick={descartarOferta}>
              <span className="instalar-descartar-texto">{modo === "nativo" ? t("instalar.ahoraNo") : t("instalar.entendido")}</span>
              <svg className="instalar-descartar-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

/** Fila para el cajón de ajustes: instalar a pedido, también si se había descartado el ofrecimiento. */
export function useFilaInstalar() {
  const { modo } = useInstalar();
  const [pasos, setPasos] = useState(false);
  if (!modo) return null;
  return {
    modo,
    pasos,
    alTocar: async () => {
      if (modo === "nativo") await instalarApp();
      else setPasos((p) => !p);
    },
  };
}

export const DESCARGAR = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" /></svg>;
