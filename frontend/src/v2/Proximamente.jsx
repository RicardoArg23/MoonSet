import { createContext, useContext, useEffect, useRef } from "react";
import { IDS_MODELOS, contenidoModal } from "./proximamente.js"; // con extensión: en Windows "Proximamente" y "proximamente" son el mismo nombre
import { useIdioma } from "./i18n";
import "./proximamente.css";

// La cabina pone acá la función que abre el modal: abrir(modelo | null). Así la franja del panel, el campo de
// calefacción y el cajón lo abren sin pasar props por el medio. Sin proveedor no hay nada que abrir (null).
const Contexto = createContext(null);
export const ProveedorProximamente = Contexto.Provider;
/** @returns {((modelo?: string|null) => void) | null} */
export const useProximamente = () => useContext(Contexto);

function Candado() {
  return (
    <svg className="prox-candado" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2.2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * Franja del panel del sitio: "Riesgos de la misión · Próximamente", en una sola línea. Tocarla abre el modal.
 * Los tres chips (uno por modelo) no ocupan alto: con mouse o teclado aparecen debajo, flotando; en pantallas
 * angostas van a la vista en una segunda línea (movil.css). No muestra ningún valor: todavía no se calcula nada.
 */
export function FranjaRiesgos({ style }) {
  const { t } = useIdioma();
  const abrir = useProximamente();
  if (!abrir) return null;
  return (
    <div className="riesgos" style={style} role="group" aria-label={t("proximamente.franjaAria")}>
      <button type="button" className="riesgos-titulo" onClick={() => abrir(null)}>
        <Candado />
        <b>{t("proximamente.franja")}</b>
        <span className="riesgos-etiqueta">{t("proximamente.etiqueta")}</span>
      </button>
      <div className="riesgos-chips">
        {IDS_MODELOS.map((id) => (
          <button key={id} type="button" className="riesgos-chip" aria-label={t("proximamente.chipAria", { modelo: t(`proximamente.modelos.${id}.nombre`) })} onClick={() => abrir(id)}>
            <Candado />{t(`proximamente.modelos.${id}.nombre`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Línea chica junto al campo de calefacción: hoy es una potencia fija; abre el modal en el modelo térmico. */
export function NotaCalefaccion() {
  const { t } = useIdioma();
  const abrir = useProximamente();
  if (!abrir) return null;
  return <button type="button" className="enlace prox-calefaccion" onClick={() => abrir("termico")}>{t("proximamente.calefaccion")}</button>;
}

const ENFOCABLES = 'button:not([disabled]), a[href], [tabindex="0"]';

/**
 * Modal "Próximamente en MoonSet": los tres modelos y la nota del terreno. Solo texto, sin números ni gráficos.
 * Accesible: role dialog, el foco queda adentro, Esc y un clic afuera lo cierran. Devolver el foco a quien lo
 * abrió es tarea de `alCerrar` (la cabina sabe qué botón fue).
 * @param {object} props
 * @param {string|null} props.inicial modelo que se resalta y se trae a la vista al abrir
 * @param {"explorar"|"planificar"} props.perfilVista explorar: preguntas simples; planificar: el detalle
 */
export default function Proximamente({ inicial = null, perfilVista, alCerrar }) {
  const { t } = useIdioma();
  const dialogo = useRef(null);
  const contenido = contenidoModal(t, perfilVista);

  useEffect(() => {
    const nodo = dialogo.current;
    const tarjeta = inicial ? nodo.querySelector(`[data-modelo="${inicial}"]`) : null;
    (tarjeta ?? nodo).focus({ preventScroll: true });
    tarjeta?.scrollIntoView({ block: "nearest" });
    // En pantallas angostas la página tiene scroll: mientras el modal está abierto, se queda quieta.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [inicial]);

  function alTeclado(evento) {
    evento.stopPropagation(); // los atajos de la cabina (P, Esc del cajón) no corren con el modal abierto
    if (evento.key === "Escape") {
      alCerrar();
      return;
    }
    if (evento.key !== "Tab") return;
    const enfocables = [...dialogo.current.querySelectorAll(ENFOCABLES)];
    const primero = enfocables[0];
    const ultimo = enfocables.at(-1);
    const adentro = enfocables.includes(document.activeElement);
    if (evento.shiftKey ? !adentro || document.activeElement === primero : !adentro || document.activeElement === ultimo) {
      evento.preventDefault();
      (evento.shiftKey ? ultimo : primero).focus();
    }
  }

  return (
    <div className="prox-fondo" onPointerDown={(evento) => evento.target === evento.currentTarget && alCerrar()} onKeyDown={alTeclado}>
      <section ref={dialogo} className="prox-modal" role="dialog" aria-modal="true" aria-labelledby="prox-titulo" aria-describedby="prox-subtitulo" tabIndex={-1}>
        <header className="prox-cabeza">
          <div>
            <h2 id="prox-titulo">{contenido.titulo}</h2>
            <p id="prox-subtitulo">{contenido.subtitulo}</p>
          </div>
          <button type="button" className="equis" aria-label={t("proximamente.cerrar")} onClick={alCerrar}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </header>

        <div className="prox-modelos">
          {contenido.modelos.map((m) => (
            <article key={m.id} className={`prox-tarjeta${m.id === inicial ? " resaltada" : ""}`} data-modelo={m.id} tabIndex={-1} aria-labelledby={`prox-${m.id}`}>
              <p className="prox-meta">
                <span>{m.prioridad}</span>
                <span className="prox-estado"><Candado />{m.estado}</span>
              </p>
              <h3 id={`prox-${m.id}`}>{m.nombre}</h3>
              <p className="prox-pregunta">{m.pregunta}</p>
              {m.partes.map((parte, k) => (
                <p key={k} className="prox-parte">{parte.rotulo && <b>{parte.rotulo}</b>}{parte.texto}</p>
              ))}
              {m.formula && <p className="prox-formula"><code>{m.formula.texto}</code><span>{m.formula.leyenda}</span></p>}
            </article>
          ))}
        </div>

        <p className="prox-nota">{contenido.nota}</p>
      </section>
    </div>
  );
}
