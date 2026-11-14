// Pantalla de inicio: presenta MoonSet y deja elegir con qué perfil entrar a la cabina.
// El fondo interactivo (Luna, Sol, Tierra, estrellas) vive en espacio.js; acá va el DOM que flota encima.
import { useEffect, useRef, useState } from "react";
import { useIdioma } from "../i18n";
import { crearEspacio } from "./espacio";
import "./inicio.css";

const BASE = import.meta.env.BASE_URL;
const ALCANCE_LETRAS = 170; // px alrededor del puntero en los que las letras del titular reaccionan

function Flecha() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Ojo({ tachado }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tachado ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      ) : (
        <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/** @param {{ alEntrar: (perfil: "explorar" | "planificar") => void }} props */
export default function Inicio({ alEntrar }) {
  const { idioma, setIdioma, idiomas, t } = useIdioma();
  const [limpia, setLimpia] = useState(false); // interfaz oculta: queda solo el espacio
  const lienzoRef = useRef(null);
  const titularRef = useRef(null);
  const espacioRef = useRef(null);
  const rotulos = { polo: useRef(null), sol: useRef(null), tierra: useRef(null) };
  const leyenda = { sol: useRef(null), tierra: useRef(null), sitios: useRef(null) };

  useEffect(() => {
    const espacio = crearEspacio(
      lienzoRef.current,
      { polo: rotulos.polo.current, sol: rotulos.sol.current, tierra: rotulos.tierra.current },
      { sol: leyenda.sol.current, tierra: leyenda.tierra.current, sitios: leyenda.sitios.current }
    );
    espacioRef.current = espacio;
    if (!espacio) return undefined;
    let vigente = true;
    // Los sitios son un adorno de esta pantalla: si el índice no carga, no se dibujan y nada más cambia.
    fetch(`${BASE}anual/indice.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((indice) => vigente && indice && espacio.ponerSitios(indice.sitios))
      .catch(() => {});
    return () => {
      vigente = false;
      espacio.destruir();
      espacioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la escena se crea una sola vez; los refs no cambian
  }, []);

  // Letras del titular: las cercanas al puntero se levantan y toman el ámbar del Sol. Solo transform y color.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const letras = [...titularRef.current.querySelectorAll(".ini-letra")].map((el) => ({ el, x: 0, y: 0, p: 0 }));
    const puntero = { x: -9999, y: -9999 };
    const medir = () => {
      for (const l of letras) {
        const r = l.el.getBoundingClientRect();
        l.x = r.left + r.width / 2;
        l.y = r.top + r.height / 2 + l.p * r.height * 0.1;
      }
    };
    const alMover = (e) => { puntero.x = e.clientX; puntero.y = e.clientY; };
    const alSalir = () => { puntero.x = puntero.y = -9999; };
    let cuadroId = 0;
    const cuadro = () => {
      cuadroId = requestAnimationFrame(cuadro);
      for (const l of letras) {
        const meta = Math.max(0, 1 - Math.hypot(puntero.x - l.x, puntero.y - l.y) / ALCANCE_LETRAS) ** 2;
        const nuevo = l.p + (meta - l.p) * 0.16;
        if (Math.abs(nuevo - l.p) > 0.002 || (nuevo < 0.004 && l.p !== 0)) {
          l.p = nuevo < 0.004 ? 0 : nuevo;
          l.el.style.setProperty("--p", l.p.toFixed(3));
        }
      }
    };
    medir();
    const espera = setTimeout(medir, 1400); // cuando termina la animación de entrada
    document.fonts?.ready.then(medir);
    window.addEventListener("pointermove", alMover);
    window.addEventListener("resize", medir);
    document.addEventListener("pointerleave", alSalir);
    cuadroId = requestAnimationFrame(cuadro);
    return () => {
      cancelAnimationFrame(cuadroId);
      clearTimeout(espera);
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("resize", medir);
      document.removeEventListener("pointerleave", alSalir);
    };
  }, [idioma]);

  useEffect(() => {
    if (!limpia) return undefined;
    const alTeclado = (e) => { if (e.key === "Escape") setLimpia(false); };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [limpia]);

  // Apuntar (o enfocar) el titular o una entrada enciende trazas sobre la Luna.
  const marcar = (clave) => ({
    onPointerEnter: () => espacioRef.current?.sobre(clave, true),
    onPointerLeave: () => espacioRef.current?.sobre(clave, false),
    onFocus: () => espacioRef.current?.sobre(clave, true),
    onBlur: () => espacioRef.current?.sobre(clave, false),
  });
  const titular = t("inicio.titular");
  const textoOjo = limpia ? t("inicio.mostrar") : t("inicio.ocultar");

  return (
    <div className={`ini${limpia ? " ini-limpia" : ""}`}>
      <canvas ref={lienzoRef} className="ini-espacio" tabIndex={0} role="img" aria-label={t("inicio.aria")} />
      <div ref={rotulos.polo} className="ini-rotulo" aria-hidden="true"><i /><span>{t("inicio.polo")}</span></div>
      <div ref={rotulos.sol} className="ini-rotulo ini-astro" aria-hidden="true"><span>{t("inicio.sol")}</span></div>
      <div ref={rotulos.tierra} className="ini-rotulo ini-astro" aria-hidden="true"><span>{t("inicio.tierra")}</span></div>

      <header className="ini-barra">
        <div className="ini-ocultable">
          <img className="ini-logo ini-sube" src={`${BASE}marca/moonset-imagotipo.png`} alt="MoonSet" width="509" height="184" />
        </div>
        <div className="ini-barra-der ini-sube" style={{ "--i": 1 }}>
          <div className="ini-idioma ini-ocultable" role="group" aria-label={t("app.idioma")}>
            {idiomas.map((i) => (
              <button key={i} type="button" aria-pressed={idioma === i} onClick={() => setIdioma(i)}>{i.toUpperCase()}</button>
            ))}
          </div>
          <button type="button" className="ini-ojo" aria-pressed={limpia} aria-label={textoOjo} title={textoOjo} onClick={() => setLimpia((x) => !x)}>
            <Ojo tachado={limpia} />
          </button>
        </div>
      </header>

      <main className="ini-invitacion ini-ocultable">
        <h1 ref={titularRef} key={idioma} aria-label={titular} {...marcar("titulo")}>
          {titular.split(" ").map((palabra, k) => (
            <span key={k} className="ini-palabra ini-sube" style={{ "--i": k * 0.6 }} aria-hidden="true">
              {[...palabra].map((letra, j) => <span key={j} className="ini-letra">{letra}</span>)}
              {" "}
            </span>
          ))}
        </h1>
        <p className="ini-bajada ini-sube" style={{ "--i": 3 }}>{t("inicio.bajada")}</p>
        <div className="ini-entradas">
          <p className="ini-pregunta ini-sube" style={{ "--i": 4 }}>{t("inicio.pregunta")}</p>
          <button type="button" className="ini-entrada ini-primaria ini-sube" style={{ "--i": 5 }} onClick={() => alEntrar("explorar")} {...marcar("explorar")}>
            <span><b>{t("inicio.explorarT")}</b><small>{t("inicio.explorarD")}</small></span>
            <Flecha />
          </button>
          <button type="button" className="ini-entrada ini-sube" style={{ "--i": 6 }} onClick={() => alEntrar("planificar")} {...marcar("planificar")}>
            <span><b>{t("inicio.planificarT")}</b><small>{t("inicio.planificarD")}</small></span>
            <Flecha />
          </button>
        </div>
      </main>

      <div className="ini-pie ini-ocultable">
        <ul className="ini-leyenda" aria-hidden="true">
          <li ref={leyenda.sol} className="ini-l-sol"><i />{t("inicio.lSol")}</li>
          <li ref={leyenda.tierra} className="ini-l-tierra"><i />{t("inicio.lTierra")}</li>
          <li ref={leyenda.sitios} className="ini-l-sitios"><i />{t("inicio.lSitios")}</li>
        </ul>
        <div className="ini-mandos ini-sube" style={{ "--i": 8 }}>
          <button type="button" className="ini-ir ini-l-sol" onClick={() => espacioRef.current?.irA("sol")}><i />{t("inicio.irSol")}</button>
          <button type="button" className="ini-ir ini-l-tierra" onClick={() => espacioRef.current?.irA("tierra")}><i />{t("inicio.irTierra")}</button>
        </div>
      </div>
      <div className="ini-ocultable">
        <p className="ini-creditos ini-sube" style={{ "--i": 8 }}>
          {t("inicio.creditos1")}<br />{t("inicio.creditos2")}<br />{t("inicio.creditos3")}
        </p>
      </div>
    </div>
  );
}
