import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACCIONES, CIFRAS, HERRAMIENTAS, PERFILES_BASE, PERSONALIZADO, VISTAS, buscarAjustes, conBloqueMovido, conCifra, conVista } from "./ajustes";
import { MARGEN_COMUNICACION_MAX_DEG } from "./calculo";
import { useIdioma } from "./i18n";
import { ANGOSTO, CON_PUNTERO, useMedia } from "./useMedia";
import "./cajon.css";

const DURACION_MAX_DIAS = 30;
const ESPERA_AL_PASAR_MS = 140; // el mouse puede cruzar una fila camino a otra sin abrirla
const DESTELLO_MS = 1800;
const MARGEN_PANTALLA = 12;
const TOPE_SUPERIOR = 78; // las pantallas flotantes no tapan la barra

const Icono = ({ d, grosor = 1.6 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const I = {
  ojo: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z",
  ojoNo: "M3 3l18 18M10.6 5.7A9.9 9.9 0 0112 5.5c6.4 0 10 6.5 10 6.5a17 17 0 01-3.2 4M6.5 7.3A17 17 0 002 12s3.6 6.5 10 6.5a9.6 9.6 0 004-.9M9.9 9.9a3 3 0 004.2 4.2",
  derecha: "M9 6l6 6-6 6",
  izquierda: "M15 6l-6 6 6 6",
  arriba: "M6 15l6-6 6 6",
  abajo: "M6 9l6 6 6-6",
  cerrar: "M6 6l12 12M18 6L6 18",
  lupa: "M11 4.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM16 16l4.5 4.5",
  tilde: "M5 12.5l4.5 4.5L19 7.5",
  tacho: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3",
};

/**
 * Cajón de personalización: una lista de secciones a la derecha y pantallas flotantes que se abren al costado
 * (al pasar el mouse en escritorio, con un toque en táctil). Todo sale de la lista `secciones`.
 */
export default function Cajon({ config, alCambiar, activo, hayPropio, alElegirPerfil, alRestablecer, alCerrar, duracionDias, alCambiarDuracion, margenCom, alCambiarMargen }) {
  const { idioma, setIdioma, idiomas, t, f } = useIdioma();
  const angosto = useMedia(ANGOSTO);
  const conPuntero = useMedia(CON_PUNTERO) && !angosto;
  const [ruta, setRuta] = useState([]); // [] | [sección] | [sección, detalle]
  const [consulta, setConsulta] = useState("");
  const [resaltado, setResaltado] = useState(null);
  const raizRef = useRef(null);
  const flotantesRef = useRef([]);
  const esperaRef = useRef(0);

  const vistasActivas = VISTAS.filter((v) => config.vistas[v]);
  const bloquesVisibles = config.orden.filter((b) => config.bloques[b]).length + ACCIONES.filter((a) => config.acciones[a]).length;
  const filaBloque = (clave, grupo, extra = {}) => ({
    tipo: "bloque",
    clave: `bloque-${clave}`,
    texto: t(`ajustes.bloques.${clave}`),
    valor: config[grupo][clave],
    alCambiar: (activa) => alCambiar((c) => ({ ...c, [grupo]: { ...c[grupo], [clave]: activa } })),
    ...extra,
  });
  const detalleCifras = {
    id: "cifras",
    titulo: t("ajustes.bloques.cifras"),
    items: CIFRAS.map((c) => ({
      tipo: "tilde",
      clave: `cifra-${c}`,
      texto: t(`ajustes.cifras.${c}`),
      valor: config.cifras.includes(c),
      alCambiar: (activa) => alCambiar((cfg) => conCifra(cfg, c, activa)),
    })),
  };

  const secciones = [
    {
      id: "panel",
      titulo: t("ajustes.secciones.panel"),
      resumen: config.panel ? t("ajustes.resumen.bloques", { n: bloquesVisibles, total: config.orden.length + ACCIONES.length }) : t("ajustes.resumen.oculto"),
      items: [
        { tipo: "interruptor", clave: "panel", texto: t("ajustes.panel.mostrar"), ayuda: t("ajustes.panel.mostrarAyuda"), valor: config.panel, alCambiar: (activa) => alCambiar((c) => ({ ...c, panel: activa })) },
        { tipo: "rotulo", texto: t("ajustes.panel.bloques") },
        ...config.orden.map((b, i) =>
          filaBloque(b, "bloques", {
            subir: i > 0 ? () => alCambiar((c) => conBloqueMovido(c, b, -1)) : null,
            bajar: i < config.orden.length - 1 ? () => alCambiar((c) => conBloqueMovido(c, b, 1)) : null,
            conOrden: true,
            resumen: b === "cifras" && config.bloques.cifras ? t("ajustes.resumen.cifras", { n: config.cifras.length }) : null,
            detalle: b === "cifras" ? detalleCifras : null,
          })
        ),
        { tipo: "rotulo", texto: t("ajustes.panel.acciones") },
        ...ACCIONES.map((a) => filaBloque(a, "acciones")),
      ],
    },
    {
      id: "vistas",
      titulo: t("ajustes.secciones.vistas"),
      resumen: t("ajustes.resumen.activas", { n: vistasActivas.length, total: VISTAS.length }),
      items: [
        ...VISTAS.map((v) => ({
          tipo: "tilde",
          clave: `vista-${v}`,
          texto: t(`vistas.${v}`),
          valor: config.vistas[v],
          inactivo: config.vistas[v] && vistasActivas.length === 1,
          alCambiar: (activa) => alCambiar((c) => conVista(c, v, activa)),
        })),
        { tipo: "nota", texto: t("ajustes.vistasNota") },
      ],
    },
    {
      id: "herramientas",
      titulo: t("ajustes.secciones.herramientas"),
      resumen: t("ajustes.resumen.visibles", { n: HERRAMIENTAS.filter((h) => config.herramientas[h]).length, total: HERRAMIENTAS.length }),
      items: HERRAMIENTAS.map((h) => ({
        tipo: "interruptor",
        clave: `herramienta-${h}`,
        texto: t(`ajustes.herramientas.${h}`),
        ayuda: t(`ajustes.herramientas.${h}Ayuda`),
        valor: config.herramientas[h],
        alCambiar: (activa) => alCambiar((c) => ({ ...c, herramientas: { ...c.herramientas, [h]: activa } })),
      })),
    },
    {
      id: "mision",
      titulo: t("ajustes.secciones.mision"),
      resumen: t("ajustes.resumen.mision", { dias: duracionDias, margen: f.num(margenCom, 1) }),
      items: [
        { tipo: "rango", clave: "duracion", texto: t("ajustes.mision.duracion"), min: 1, max: DURACION_MAX_DIAS, paso: 1, valor: duracionDias, salida: t("ajustes.mision.dias", { n: duracionDias }), alCambiar: alCambiarDuracion },
        { tipo: "rango", clave: "margen", texto: t("sistema.margenCom"), min: 0, max: MARGEN_COMUNICACION_MAX_DEG, paso: 0.5, valor: margenCom, salida: `${f.num(margenCom, 1)}°`, alCambiar: alCambiarMargen },
        { tipo: "nota", texto: t("ajustes.mision.nota") },
      ],
    },
  ];

  // Índice del buscador: sale de la misma lista, así un ajuste nuevo queda buscable sin tocar nada más.
  const buscables = (items) => items.filter((it) => it.tipo !== "rotulo" && it.tipo !== "nota");
  const indice = [
    { texto: t("app.idioma"), contexto: t("ajustes.titulo"), ruta: [], clave: "idioma", claves: "language español english" },
    ...secciones.flatMap((s) => [
      { texto: s.titulo, ruta: [s.id], clave: null },
      ...buscables(s.items).flatMap((it) => [
        { texto: it.texto, contexto: s.titulo, ruta: it.detalle ? [s.id, it.detalle.id] : [s.id], clave: it.clave, claves: it.ayuda },
        ...(it.detalle ? buscables(it.detalle.items).map((sub) => ({ texto: sub.texto, contexto: `${s.titulo} › ${it.texto}`, ruta: [s.id, it.detalle.id], clave: sub.clave })) : []),
      ]),
    ]),
  ];
  const resultados = buscarAjustes(indice, consulta);

  const seccion = secciones.find((s) => s.id === ruta[0]) ?? null;
  const detalle = seccion?.items.find((it) => it.detalle?.id === ruta[1])?.detalle ?? null;
  const rutaValida = seccion ? (detalle ? ruta : ruta.slice(0, 1)) : [];
  const claveRuta = rutaValida.join("/");

  // Con mouse, pasar por una fila abre su pantalla y pasar por otra la cambia; el clic solo la fija.
  const abrir = (destino) => setRuta((actual) => (!conPuntero && actual.join("/") === destino.join("/") ? destino.slice(0, -1) : destino));
  function alPasar(evento) {
    if (!conPuntero || consulta) return;
    const fila = evento.target.closest("[data-fila]");
    const nivel = evento.target.closest("[data-nivel]");
    if (!fila || !nivel) return;
    const destino = fila.dataset.ruta ? fila.dataset.ruta.split("/") : rutaValida.slice(0, Number(nivel.dataset.nivel));
    clearTimeout(esperaRef.current);
    if (destino.join("/") === claveRuta) return;
    esperaRef.current = setTimeout(() => setRuta(destino), ESPERA_AL_PASAR_MS);
  }
  useEffect(() => () => clearTimeout(esperaRef.current), []);

  // Cada pantalla flotante se pega a la izquierda de la anterior, a la altura de la fila que la abrió.
  function posicionar() {
    const flotantes = flotantesRef.current.filter(Boolean);
    flotantes.forEach((tarjeta, k) => {
      const contenedor = k === 0 ? raizRef.current : flotantes[k - 1];
      if (!contenedor) return;
      const ancla = contenedor.querySelector(`[data-ruta="${rutaValida.slice(0, k + 1).join("/")}"]`) ?? contenedor;
      const caja = contenedor.getBoundingClientRect();
      const alto = tarjeta.offsetHeight;
      const arriba = Math.max(TOPE_SUPERIOR, ancla.getBoundingClientRect().top - 8);
      tarjeta.style.left = `${caja.left - 6 - tarjeta.offsetWidth}px`;
      tarjeta.style.top = `${Math.max(TOPE_SUPERIOR, Math.min(arriba, window.innerHeight - MARGEN_PANTALLA - alto))}px`;
    });
  }
  useLayoutEffect(posicionar); // después de cada render: cambian filas, textos y alturas
  useEffect(() => {
    window.addEventListener("resize", posicionar);
    return () => window.removeEventListener("resize", posicionar);
  });

  useEffect(() => {
    const alTeclado = (evento) => {
      if (evento.key !== "Escape") return;
      if (rutaValida.length) setRuta(rutaValida.slice(0, -1));
      else alCerrar();
    };
    // Como en un menú: un clic fuera de las pantallas flotantes las cierra; el cajón queda abierto.
    const alApretar = (evento) => {
      if (rutaValida.length && !angosto && !evento.target.closest("[data-nivel]")) setRuta([]);
    };
    window.addEventListener("keydown", alTeclado);
    document.addEventListener("pointerdown", alApretar);
    return () => {
      window.removeEventListener("keydown", alTeclado);
      document.removeEventListener("pointerdown", alApretar);
    };
  });

  useEffect(() => {
    if (!resaltado) return undefined;
    document.querySelector(`[data-clave="${resaltado}"]`)?.scrollIntoView({ block: "nearest" });
    const id = setTimeout(() => setResaltado(null), DESTELLO_MS);
    return () => clearTimeout(id);
  }, [resaltado]);

  function irAResultado(entrada) {
    setRuta(entrada.ruta);
    setResaltado(entrada.clave);
    setConsulta("");
  }

  const destello = (clave) => (clave && clave === resaltado ? " cj-destello" : "");

  // Función común y no componente: así un control no se vuelve a montar (y no pierde el arrastre) en cada render.
  function fila(item, base) {
    if (item.tipo === "rotulo") return <p className="cj-rotulo">{item.texto}</p>;
    if (item.tipo === "nota") return <p className="cj-nota">{item.texto}</p>;
    if (item.tipo === "interruptor") {
      return (
        <div className={`cj-interruptor${destello(item.clave)}`} data-fila data-clave={item.clave}>
          <span>{item.texto}{item.ayuda && <small>{item.ayuda}</small>}</span>
          <button type="button" className="cj-llave" role="switch" aria-checked={item.valor} aria-label={item.texto} onClick={() => item.alCambiar(!item.valor)} />
        </div>
      );
    }
    if (item.tipo === "tilde") {
      return (
        <button type="button" className={`cj-tilde${destello(item.clave)}`} role="checkbox" aria-checked={item.valor} disabled={item.inactivo} data-fila data-clave={item.clave} onClick={() => item.alCambiar(!item.valor)}>
          <span className="cj-caja"><Icono d={I.tilde} grosor={2.6} /></span>
          <span>{item.texto}</span>
        </button>
      );
    }
    if (item.tipo === "rango") {
      const id = `cj-${item.clave}`;
      return (
        <div className={`cj-rango${destello(item.clave)}`} data-fila data-clave={item.clave}>
          <label htmlFor={id}>{item.texto}<output>{item.salida}</output></label>
          <input id={id} type="range" min={item.min} max={item.max} step={item.paso} value={item.valor} onChange={(e) => item.alCambiar(Number(e.target.value))} />
        </div>
      );
    }
    // Bloque del panel: ojo para mostrar u ocultar, flechas para el orden y, si tiene opciones, su pantalla.
    const rutaDetalle = item.detalle ? [...base, item.detalle.id] : null;
    const abierta = rutaDetalle !== null && claveRuta === rutaDetalle.join("/");
    const resumen = !item.valor ? t("ajustes.resumen.oculto") : item.resumen;
    return (
      <div className={`cj-bloque${item.valor ? "" : " apagado"}${abierta ? " abierta" : ""}${destello(item.clave)}`} data-fila data-clave={item.clave} data-ruta={rutaDetalle?.join("/")}>
        <button type="button" className="cj-ojo" aria-pressed={item.valor} aria-label={t(item.valor ? "ajustes.panel.ocultarBloque" : "ajustes.panel.mostrarBloque", { nombre: item.texto })} onClick={() => item.alCambiar(!item.valor)}>
          <Icono d={item.valor ? I.ojo : I.ojoNo} />
        </button>
        <button type="button" className="cj-nombre" aria-expanded={rutaDetalle ? abierta : undefined} onClick={() => (rutaDetalle ? abrir(rutaDetalle) : item.alCambiar(!item.valor))}>
          <span>{item.texto}</span>
          {resumen && <small>{resumen}</small>}
        </button>
        {item.conOrden && (
          <span className="cj-mover">
            <button type="button" disabled={!item.subir} aria-label={t("ajustes.panel.subir", { nombre: item.texto })} onClick={item.subir ?? undefined}><Icono d={I.arriba} grosor={2.4} /></button>
            <button type="button" disabled={!item.bajar} aria-label={t("ajustes.panel.bajar", { nombre: item.texto })} onClick={item.bajar ?? undefined}><Icono d={I.abajo} grosor={2.4} /></button>
          </span>
        )}
        {rutaDetalle && <span className="cj-flecha"><Icono d={I.derecha} grosor={2} /></span>}
      </div>
    );
  }

  const lista = (items, base) => items.map((item, k) => <Fragment key={item.clave ?? `${item.tipo}-${k}`}>{fila(item, base)}</Fragment>);
  const volver = (
    <button type="button" className="cj-redondo" aria-label={t("ajustes.volver")} onClick={() => setRuta(rutaValida.slice(0, -1))}><Icono d={I.izquierda} grosor={2} /></button>
  );

  const cuerpoRaiz = consulta
    ? resultados.length
      ? resultados.map((e, k) => (
          <button type="button" className="cj-resultado" key={`${e.clave}-${k}`} onClick={() => irAResultado(e)}>
            <b>{e.texto}</b>
            {e.contexto && <small>{e.contexto}</small>}
          </button>
        ))
      : <p className="cj-nota">{t("ajustes.sinResultados")}</p>
    : secciones.map((s) => (
        <button type="button" className="cj-seccion" key={s.id} data-fila data-ruta={s.id} aria-expanded={rutaValida[0] === s.id} onClick={() => abrir([s.id])}>
          <span><b>{s.titulo}</b><small>{s.resumen}</small></span>
          <Icono d={I.derecha} grosor={2} />
        </button>
      ));

  // En pantalla angosta no hay lugar al costado: el cajón muestra una sola pantalla, con botón para volver.
  const enAngosto = angosto && seccion;
  const tituloAngosto = detalle ? detalle.titulo : seccion?.titulo;

  return (
    <>
      <aside ref={raizRef} id="cajon-ajustes" className="cajon cj-nivel" data-nivel="0" aria-label={t("ajustes.titulo")} onMouseOver={alPasar} onMouseLeave={() => clearTimeout(esperaRef.current)}>
        <div className="cj-cabeza">
          <div className="cj-titulo">
            {enAngosto && volver}
            <h2>{enAngosto ? tituloAngosto : t("ajustes.titulo")}</h2>
            <div className={`cj-idioma${destello("idioma")}`} role="group" aria-label={t("app.idioma")} data-clave="idioma">
              {idiomas.map((i) => <button key={i} type="button" aria-pressed={idioma === i} onClick={() => setIdioma(i)}>{i.toUpperCase()}</button>)}
            </div>
            <button type="button" className="cj-redondo" aria-label={t("ajustes.cerrar")} onClick={alCerrar}><Icono d={I.cerrar} /></button>
          </div>
          {!enAngosto && (
            <>
              <div className="cj-perfiles">
                <div role="group" aria-label={t("ajustes.perfiles.aria")}>
                  {PERFILES_BASE.map((p) => <button key={p} type="button" aria-pressed={activo === p} onClick={() => alElegirPerfil(p)}>{t(`ajustes.perfiles.${p}`)}</button>)}
                  <button type="button" aria-pressed={activo === PERSONALIZADO} aria-disabled={!hayPropio || undefined} title={hayPropio ? undefined : t("ajustes.perfiles.personalizadoAyuda")} onClick={() => hayPropio && alElegirPerfil(PERSONALIZADO)}>{t("ajustes.perfiles.personalizado")}</button>
                </div>
                {hayPropio && <button type="button" className="cj-tacho" data-ayuda={t("ajustes.perfiles.restablecer")} aria-label={t("ajustes.perfiles.restablecer")} onClick={alRestablecer}><Icono d={I.tacho} /></button>}
              </div>
              <label className="cj-buscar">
                <Icono d={I.lupa} />
                <input type="search" value={consulta} placeholder={t("ajustes.buscar")} aria-label={t("ajustes.buscar")} onChange={(e) => setConsulta(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="cj-cuerpo" onScroll={posicionar}>
          {enAngosto ? lista((detalle ?? seccion).items, rutaValida.slice(0, 1)) : cuerpoRaiz}
        </div>
      </aside>

      {!angosto && seccion && (
        <section ref={(n) => { flotantesRef.current[0] = n; }} key={seccion.id} className="cj-flotante cj-nivel" data-nivel="1" aria-label={seccion.titulo} onMouseOver={alPasar} onMouseLeave={() => clearTimeout(esperaRef.current)}>
          <h3>{seccion.titulo}</h3>
          <div className="cj-cuerpo" onScroll={posicionar}>{lista(seccion.items, [seccion.id])}</div>
        </section>
      )}
      {!angosto && detalle && (
        <section ref={(n) => { flotantesRef.current[1] = n; }} key={`${seccion.id}/${detalle.id}`} className="cj-flotante cj-nivel" data-nivel="2" aria-label={detalle.titulo} onMouseOver={alPasar}>
          <h3>{detalle.titulo}</h3>
          <div className="cj-cuerpo">{lista(detalle.items, rutaValida)}</div>
        </section>
      )}
    </>
  );
}
