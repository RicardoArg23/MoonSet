import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { conAccion, irAPaso, marcarTutorialVisto, pasosDe, tutorialVisto } from "./tutorial";
import { rico, useIdioma } from "./i18n";
import "./tutorial.css";

const PAUSA_HECHO_MS = 950; // se ve el "Hecho" antes de pasar al paso siguiente
const ESPERA_OBJETIVO_MS = 600; // margen para que aparezca el control (un panel que se abre) antes de saltear el paso
const REVISION_MS = 250; // los paneles se mueven con transiciones: el foco los sigue
const MARGEN_FOCO = 7;
const SEPARACION = 14;
const BORDE = 10;
const PARTE_GRANDE = 0.5;

// El control que señala un paso: con varias opciones, el primero que está a la vista.
function buscarObjetivo(paso) {
  for (const nombre of [].concat(paso.objetivo)) {
    const elemento = document.querySelector(`[data-tutorial="${nombre}"]`);
    if (elemento) return elemento;
  }
  return null;
}

/**
 * Estado del recorrido guiado. `cumplir(accion)` se llama desde la cabina cuando la persona hace algo
 * (elegir un sitio, cambiar la duración…): si es lo que pide el paso, se marca hecho y avanza solo.
 * @param {string} perfil perfil del que partió la cabina: define el recorrido
 */
export function useTutorial(perfil) {
  const pasos = pasosDe(perfil);
  const [estado, setEstado] = useState({ paso: -1, hecho: false, sentido: 1 });
  const [invitado, setInvitado] = useState(() => !tutorialVisto());
  const total = pasos.length;

  const empezar = useCallback(() => {
    marcarTutorialVisto();
    setInvitado(false);
    setEstado({ paso: 0, hecho: false, sentido: 1 });
  }, []);
  const salir = useCallback(() => setEstado({ paso: -1, hecho: false, sentido: 1 }), []);
  const siguiente = useCallback(() => setEstado((e) => irAPaso(e, e.paso + 1, total)), [total]);
  const atras = useCallback(() => setEstado((e) => irAPaso(e, e.paso - 1, total)), [total]);
  const cumplir = useCallback((accion) => setEstado((e) => conAccion(e, pasosDe(perfil), accion)), [perfil]);
  const noInvitar = useCallback(() => {
    marcarTutorialVisto();
    setInvitado(false);
  }, []);

  // Hecho: se muestra un momento y pasa al siguiente.
  useEffect(() => {
    if (!estado.hecho) return undefined;
    const id = setTimeout(siguiente, PAUSA_HECHO_MS);
    return () => clearTimeout(id);
  }, [estado.hecho, estado.paso, siguiente]);

  return {
    paso: pasos[estado.paso] ?? null,
    indice: estado.paso,
    total,
    hecho: estado.hecho,
    sentido: estado.sentido,
    invitado: invitado && estado.paso < 0,
    empezar,
    salir,
    siguiente,
    atras,
    cumplir,
    noInvitar,
  };
}

const Tilde = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Mano = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4.5a5.5 5.5 0 01-5.5 5.5H13a5 5 0 01-4-2l-3.2-4.6a1.5 1.5 0 012.3-1.9L9 13.5" /></svg>;
const Equis = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

/** Invitación chica que no bloquea (solo la primera visita) y, durante el recorrido, el foco y el cartel del paso. */
export default function Tutorial({ tutorial }) {
  const { t } = useIdioma();
  const { paso, indice, total, hecho, sentido, invitado, empezar, salir, siguiente, atras, noInvitar } = tutorial;
  const focoRef = useRef(null);
  const cartelRef = useRef(null);
  const sinObjetivoDesde = useRef(0);

  // El foco rodea el control señalado y el cartel va donde haya lugar: a la derecha, a la izquierda, abajo o arriba.
  const ubicar = useCallback(() => {
    const foco = focoRef.current;
    const cartel = cartelRef.current;
    if (!paso || !foco || !cartel) return;
    const objetivo = buscarObjetivo(paso);
    const caja = objetivo?.getBoundingClientRect();
    if (!caja || caja.width === 0) {
      // El control no está (un panel oculto desde Personalizar, una vista apagada): pasado un momento, el paso se saltea.
      sinObjetivoDesde.current ||= Date.now();
      foco.style.opacity = "0";
      if (Date.now() - sinObjetivoDesde.current > ESPERA_OBJETIVO_MS) {
        sinObjetivoDesde.current = 0;
        if (sentido < 0 && indice > 0) atras();
        else siguiente();
      }
      return;
    }
    sinObjetivoDesde.current = 0;
    const x = caja.left - MARGEN_FOCO;
    const y = caja.top - MARGEN_FOCO;
    const ancho = caja.width + 2 * MARGEN_FOCO;
    const alto = caja.height + 2 * MARGEN_FOCO;
    Object.assign(foco.style, { opacity: "1", left: `${x}px`, top: `${y}px`, width: `${ancho}px`, height: `${alto}px` });
    const cw = cartel.offsetWidth;
    const ch = cartel.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    let cx = x + ancho / 2 - cw / 2;
    let cy = y - SEPARACION - ch;
    if (x + ancho + SEPARACION + cw <= W - BORDE) [cx, cy] = [x + ancho + SEPARACION, y];
    else if (x - SEPARACION - cw >= BORDE) [cx, cy] = [x - SEPARACION - cw, y];
    else if (y + alto + SEPARACION + ch <= H - BORDE) cy = y + alto + SEPARACION;
    if (paso.lugar === "izquierda") [cx, cy] = [BORDE + SEPARACION, (H - ch) / 2];
    // Un control que ocupa casi toda la pantalla (la Luna sin panel): el cartel va adentro, en su esquina.
    else if (alto > H * PARTE_GRANDE) [cx, cy] = [x + 2 * SEPARACION, y + 2 * SEPARACION];
    cartel.style.left = `${Math.max(BORDE, Math.min(cx, W - cw - BORDE))}px`;
    cartel.style.top = `${Math.max(BORDE, Math.min(cy, H - ch - BORDE))}px`;
  }, [paso, indice, sentido, siguiente, atras]);

  useLayoutEffect(() => {
    sinObjetivoDesde.current = 0;
    if (paso) buscarObjetivo(paso)?.scrollIntoView({ block: "nearest" });
    ubicar();
  }, [paso, ubicar]);
  useEffect(() => {
    if (!paso) return undefined;
    const id = setInterval(ubicar, REVISION_MS);
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    const alTeclado = (evento) => { if (evento.key === "Escape") salir(); };
    window.addEventListener("keydown", alTeclado);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("keydown", alTeclado);
    };
  }, [paso, ubicar, salir]);

  if (!paso) {
    if (!invitado) return null;
    return (
      <div className="tt-invitacion" role="region" aria-label={t("tutorial.titulo")}>
        <p>{t("tutorial.invitacion")}<small>{t("tutorial.invitacionDetalle")}</small></p>
        <button type="button" className="tt-empezar" onClick={empezar}>{t("tutorial.empezar")}</button>
        <button type="button" className="tt-equis" aria-label={t("tutorial.ahoraNo")} onClick={noInvitar}><Equis /></button>
      </div>
    );
  }

  const pide = paso.accion ? t(`tutorial.pasos.${paso.id}.hace`) : null;
  const ultimo = indice === total - 1;
  return (
    <>
      <div ref={focoRef} className={`tt-foco${hecho ? " hecho" : ""}`} aria-hidden="true" />
      <section ref={cartelRef} className="tt-cartel" role="dialog" aria-label={t("tutorial.paso", { n: indice + 1, total })} aria-live="polite">
        <div className="tt-cuenta">
          <span>{t("tutorial.paso", { n: indice + 1, total })}</span>
          <span className="tt-puntos" aria-hidden="true">{Array.from({ length: total }, (_, k) => <i key={k} className={k <= indice ? "ya" : undefined} />)}</span>
        </div>
        <h3>{t(`tutorial.pasos.${paso.id}.titulo`)}</h3>
        <p>{t(`tutorial.pasos.${paso.id}.texto`)}</p>
        {paso.lista && <ul className="tt-lista">{t(`tutorial.pasos.${paso.id}.lista`).map((item) => <li key={item}>{rico(item)}</li>)}</ul>}
        {pide && <p className={`tt-hace${hecho ? " hecho" : ""}`}>{hecho ? <Tilde /> : <Mano />}<span>{hecho ? t("tutorial.hecho") : pide}</span></p>}
        <div className="tt-pie">
          <button type="button" className="tt-salir" onClick={salir}>{t("tutorial.salir")}</button>
          {indice > 0 && <button type="button" onClick={atras}>{t("tutorial.atras")}</button>}
          <button type="button" className="tt-siguiente" onClick={siguiente}>{ultimo ? t("tutorial.terminar") : t("tutorial.siguiente")}</button>
        </div>
      </section>
    </>
  );
}
