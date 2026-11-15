import { useEffect, useRef } from "react";
import { BATERIAS } from "./configEnergia";
import { explicar, textoExplicacion } from "./explicar";
import { DIAS_2027, MEJORES, REGIONES, TOLERANCIAS, preguntaBateria, preguntaCerca, preguntaPrimera, preguntaPuestas, preguntaSemana } from "./planificar";
import { useIdioma } from "./i18n";
import "./planificador.css";

const DIA_MS = 86_400_000;
const PREGUNTAS = ["semana", "bateria", "puestas", "primera", "cerca"];
const MENSAJES_VISIBLES = 4;
// kWh redondeados hacia arriba: lo que hace falta nunca se muestra menor de lo que es.
const kwhArriba = (x) => Math.ceil(x * 10 - 1e-9) / 10;

/** Ícono del casco de astronauta, con el mismo trazo que los demás íconos de la barra. */
export function IconoAstronauta() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 11.5a7 7 0 0 1 14 0v3.2a3.3 3.3 0 0 1-3.3 3.3H8.3A3.3 3.3 0 0 1 5 14.7z" />
      <rect x="8" y="9" width="8" height="5.2" rx="2.6" />
      <path d="M8.5 21h7M2.8 12.5v2.4M21.2 12.5v2.4" />
    </svg>
  );
}

/** Pestañas "Sitio | Planificar" y la X que cierra el modo. Van arriba del panel mientras el modo está abierto. */
export function PestanasPlan({ pestana, alElegir, alCerrar }) {
  const { t } = useIdioma();
  return (
    <div className="plan-pestanas">
      <div className="segmentos" role="group" aria-label={t("plan.pestanasAria")}>
        <button type="button" aria-pressed={pestana === "sitio"} onClick={() => alElegir("sitio")}>{t("plan.pestanaSitio")}</button>
        <button type="button" aria-pressed={pestana === "planificar"} onClick={() => alElegir("planificar")}>{t("plan.pestanaPlanificar")}</button>
      </div>
      <button type="button" className="equis" aria-label={t("plan.cerrar")} onClick={alCerrar}>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" /></svg>
      </button>
    </div>
  );
}

/** Lista de frases de explicar() ya traducidas. La usan las tarjetas del ranking y el panel del sitio. */
export function Explicaciones({ frases }) {
  const { t, f } = useIdioma();
  if (frases.length === 0) return null;
  return (
    <ul className="porque" aria-label={t("explicar.aria")}>
      {frases.map((frase) => <li key={frase.regla} className={`tono-${frase.tono}`}>{textoExplicacion(frase, t, f.num)}</li>)}
    </ul>
  );
}

/**
 * Modo planificación del panel: cuatro preguntas y, después de "Buscar sitios", el ranking.
 * No guarda estado propio: todo vive en `estado` (Cabina), así cambiar de pestaña no pierde nada.
 * @param {object} props
 * @param {object} props.estado { paso, perfilId, region, dia, tolerancia, duracionDias, ranking, abierta, hilo }
 * @param {(cambios: object) => void} props.alCambiar
 * @param {{ id: string, valores: object }[]} props.perfiles perfiles de energía que se pueden elegir
 * @param {number} props.t0 ms del 1 de enero de 2027 (inicio de los datos)
 * @param {Record<string, object|null|undefined>} props.vecindades grillas de alrededores ya pedidas
 */
export default function Planificador({ estado, alCambiar, perfiles, totalSitios, t0, buscando, alBuscar, alVer, alComparar, aviso, alDeshacer, vecindades, perfilVista }) {
  const { t, f } = useIdioma();
  const { num, fechaLarga, nombreCorto } = f;
  const preguntas = useRef(null);
  const ultimo = useRef(null);
  const mensajes = estado.hilo.length;
  useEffect(() => {
    if (mensajes > 0) ultimo.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mensajes]);

  const fecha = (dia) => fechaLarga(t0 + dia * DIA_MS);
  const isoDe = (dia) => new Date(t0 + dia * DIA_MS).toISOString().slice(0, 10);
  const detallePerfil = (v) => t("plan.perfilDetalle", { bateria: BATERIAS[v.tipoBateria].nombre, kwh: num(v.capacidadKWh, v.capacidadKWh % 1 ? 1 : 0), n: v.paneles });
  const dias = (n) => t("plan.etiquetaDuracion", { n });

  if (estado.paso === "preguntas" || !estado.ranking) {
    const perfilElegido = perfiles.some((p) => p.id === estado.perfilId) ? estado.perfilId : perfiles[0].id;
    return (
      <form className="plan" onSubmit={(evento) => { evento.preventDefault(); alBuscar(); }}>
        <div className="plan-titulo">
          <h2>{t("plan.titulo")}</h2>
          <p className="tenue">{t("plan.bajada")}</p>
        </div>

        <fieldset className="plan-paso">
          <legend><span>1</span>{t("plan.queLlevas")}</legend>
          {perfiles.map((p) => (
            <button key={p.id} type="button" className="plan-opcion ancha" aria-pressed={perfilElegido === p.id} onClick={() => alCambiar({ perfilId: p.id })}>
              <b>{t(`sistema.perfiles.${p.id}`)}</b>
              <small>{detallePerfil(p.valores)}</small>
            </button>
          ))}
        </fieldset>

        <fieldset className="plan-paso">
          <legend><span>2</span>{t("plan.donde")}</legend>
          <div className="plan-fila">
            {REGIONES.map((region) => (
              <button key={region} type="button" className="plan-opcion" aria-pressed={estado.region === region} onClick={() => alCambiar({ region })}>
                <b>{t(region === "polo" ? "plan.regionPolo" : "plan.regionTodos")}</b>
                <small>{region === "polo" ? t("plan.regionPoloDetalle") : t("plan.regionTodosDetalle", { n: totalSitios })}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="plan-paso">
          <legend><span>3</span>{t("plan.cuando")}</legend>
          <input
            type="date"
            className="plan-campo"
            aria-label={t("plan.fechaAria")}
            min={isoDe(0)}
            max={isoDe(DIAS_2027 - 1)}
            required
            value={isoDe(estado.dia)}
            onChange={(evento) => {
              const dia = Math.round((Date.parse(evento.target.value) - t0) / DIA_MS);
              if (Number.isFinite(dia)) alCambiar({ dia: Math.max(0, Math.min(DIAS_2027 - 1, dia)) });
            }}
          />
          <p className="rotulo">{t("plan.tolerancia")}</p>
          <div className="plan-fila">
            {TOLERANCIAS.map((n) => (
              <button key={n} type="button" className="plan-opcion chica" aria-pressed={estado.tolerancia === n} onClick={() => alCambiar({ tolerancia: n })}>
                {n === 0 ? t("plan.toleranciaFija") : t("plan.toleranciaDias", { n })}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="plan-paso">
          <legend><span>4</span>{t("plan.cuanto")}</legend>
          <label className="plan-duracion">
            <input type="number" className="plan-campo" aria-label={t("plan.duracionAria")} min="1" max="30" value={estado.duracionDias} onChange={(evento) => alCambiar({ duracionDias: Math.max(1, Math.min(30, Math.round(Number(evento.target.value)) || 1)) })} />
            {t("plan.dias")}
          </label>
        </fieldset>

        <button type="submit" className="primario plan-buscar" disabled={buscando}>{buscando ? t("plan.buscando") : t("plan.buscar")}</button>
        <p className="tenue plan-nota">{t("plan.nota")}</p>
      </form>
    );
  }

  const r = estado.ranking;
  const sirven = r.filas.filter((fila) => fila.sobrevive).length;
  const abierta = r.filas.find((fila) => fila.id === estado.abierta) ?? r.filas[0];
  const nMejores = Math.min(MEJORES, r.filas.length);

  function preguntar(id) {
    const { sitio, dia } = abierta;
    let datos;
    if (id === "semana") datos = preguntaSemana(sitio, r.sistema, dia, r.duracionH);
    else if (id === "bateria") datos = preguntaBateria(sitio, r.sistema, dia, r.duracionH);
    else if (id === "puestas") datos = preguntaPuestas(sitio, dia);
    else if (id === "primera") datos = preguntaPrimera(sitio, r.sistema, dia, r.duracionH);
    else datos = preguntaCerca(sitio, vecindades[abierta.id], r.sistema, dia, r.duracionH);
    alCambiar({ hilo: [...estado.hilo, { id, dia, datos }] });
  }

  const horasYDias = (h) => (h >= 48 ? t("plan.r.horasDias", { h: num(h), d: num(h / 24, 1) }) : t("formato.horas", { h: num(h) }));
  // La respuesta se arma al dibujar (no al preguntar): si se cambia el idioma, el hilo se traduce solo.
  function respuesta({ id, dia, datos: d }) {
    if (id === "semana") {
      if (d.fuera) return t("plan.r.semanaFuera");
      const cambio = d.despues.sobrevive ? (d.antes.sobrevive ? "sigue" : "pasa") : d.antes.sobrevive ? "deja" : "sigueSin";
      return t("plan.r.semana", { fecha: fecha(d.dia), cambio: t(`plan.r.cambio.${cambio}`), luz0: num(d.antes.luzPct), luz1: num(d.despues.luzPct), noche0: num(d.antes.nocheH), noche1: num(d.despues.nocheH), contacto0: num(d.antes.senalPct), contacto1: num(d.despues.senalPct) });
    }
    if (id === "bateria") {
      const cap = num(d.capacidadKWh, d.capacidadKWh % 1 ? 1 : 0);
      if (d.capacidadMinimaKWh === null) return t("plan.r.bateriaNinguna", { paneles: d.paneles }) + (d.panelesMinimos === null ? t("plan.r.bateriaNada") : t("plan.r.bateriaConPaneles", { n: d.panelesMinimos }));
      if (d.capacidadMinimaKWh === 0) return t("plan.r.bateriaSobra", { cap }); // nunca "0 kWh"
      const min = num(kwhArriba(d.capacidadMinimaKWh), 1);
      if (d.sobrevive) return t("plan.r.bateriaAlcanza", { min, cap, pct: num(Math.floor(d.sobraPct)) });
      return t("plan.r.bateriaFalta", { min, cap, faltan: num(kwhArriba(d.capacidadMinimaKWh - d.capacidadKWh), 1), paneles: d.paneles }) + (d.panelesMinimos === null ? "" : t("plan.r.bateriaOPaneles", { n: d.panelesMinimos }));
    }
    if (id === "puestas") {
      const sol = d.hSol === null ? t(d.solVisible ? "plan.r.sol.noSePone" : "plan.r.sol.noSale") : t(d.solVisible ? "plan.r.sol.sePone" : "plan.r.sol.sale", { t: horasYDias(d.hSol) });
      let tierra;
      if (d.tierraNunca) tierra = t("plan.r.tierra.nunca");
      else if (d.hTierra === null) tierra = t(d.tierraVisible ? "plan.r.tierra.noSeEsconde" : "plan.r.tierra.noAparece");
      else tierra = t(d.tierraVisible ? "plan.r.tierra.seEsconde" : "plan.r.tierra.aparece", { t: horasYDias(d.hTierra) });
      return t("plan.r.puestas", { fecha: fecha(dia), sol, tierra });
    }
    if (id === "primera") {
      if (d.dia === null) return t("plan.r.primeraNinguna", { desde: fecha(d.desde) });
      return d.dia === d.desde ? t("plan.r.primeraYa", { fecha: fecha(d.dia) }) : t("plan.r.primera", { desde: fecha(d.desde), fecha: fecha(d.dia) });
    }
    return t(d.esElSitio ? "plan.r.cercaSitio" : "plan.r.cerca", {
      total: d.total,
      paso: num(d.pasoM),
      viables: d.viables,
      distancia: f.longitud(d.mejor.distanciaM),
      veredicto: t(d.mejor.viable ? "plan.r.cercaSobrevive" : "plan.r.cercaNoSobrevive"),
      luz: num(d.mejor.luzPct),
      contacto: num(d.mejor.contactoPct),
      noche: num(d.mejor.nocheH),
    });
  }

  return (
    <div className="plan">
      <div className="plan-respuestas">
        <ul aria-label={t("plan.respuestasAria")}>
          <li>{t(`sistema.perfiles.${r.perfilId}`)}</li>
          <li>{t(r.region === "polo" ? "plan.regionPolo" : "plan.regionTodos")}</li>
          <li>{r.tolerancia ? t("plan.etiquetaFechaTolerancia", { fecha: fecha(r.dia), n: r.tolerancia }) : t("plan.etiquetaFecha", { fecha: fecha(r.dia) })}</li>
          <li>{dias(r.duracionDias)}</li>
        </ul>
        <button type="button" onClick={() => alCambiar({ paso: "preguntas" })}>{t("plan.editar")}</button>
      </div>

      <div className="plan-resumen" aria-live="polite">
        <h2>{sirven > 0 ? t("plan.resumen", { n: sirven, total: r.filas.length }) : t("plan.resumenNinguno", { total: r.filas.length })}</h2>
        <p className="tenue">{t(sirven > 0 ? "plan.ordenSirven" : "plan.ordenNinguno")}</p>
      </div>

      <ol className="plan-lista">
        {r.filas.map((fila, k) => {
          const desplegada = fila.id === abierta.id;
          const nombre = nombreCorto(fila.sitio.sitio);
          const veredicto = fila.sobrevive ? t("panel.sobrevive") : fila.primera === null ? t("plan.noEn2027") : t("plan.sirveDesde", { fecha: fecha(fila.primera) });
          return (
            <li
              key={fila.id}
              className={`plan-tarjeta ${fila.sobrevive ? "si" : "no"}${desplegada ? " abierta" : ""}`}
              onMouseEnter={() => alCambiar({ sobre: fila.id })}
              onMouseLeave={() => alCambiar({ sobre: null })}
            >
              <button type="button" className="plan-cabeza" aria-expanded={desplegada} onFocus={() => alCambiar({ sobre: fila.id })} onBlur={() => alCambiar({ sobre: null })} onClick={() => !desplegada && alCambiar({ abierta: fila.id, hilo: [] })}>
                <span className="plan-puesto">{k + 1}</span>
                <b>{nombre}{fila.sitio.sitio.aproximado && <abbr title={t("plan.aproximadoMarca")}> *</abbr>}</b>
                <span className="plan-pill">{desplegada && !fila.sobrevive ? t("panel.noSobrevive") : veredicto}</span>
              </button>
              {desplegada && (
                <div className="plan-cuerpo">
                  <p className="plan-llegada">
                    {t("plan.llegada")} <b>{fecha(fila.dia)}</b>{" "}
                    <span className="tenue">({fila.desvio === 0 ? t("plan.laElegida") : t("plan.desvio", { signo: fila.desvio > 0 ? "+" : "−", n: Math.abs(fila.desvio) })})</span>
                  </p>
                  {!fila.sobrevive && <p className="plan-desde">{veredicto}</p>}
                  <dl className="plan-cifras">
                    <div><dd>{num(fila.m.luzPct)} %</dd><dt>{t("plan.luz")}</dt></div>
                    <div><dd>{num(fila.m.senalPct)} %</dd><dt>{t("plan.contacto")}</dt></div>
                    <div><dd>{num(fila.m.nocheH)} h</dd><dt>{t("plan.nocheMax")}</dt></div>
                  </dl>
                  <Explicaciones frases={explicar({ m: fila.m, e: fila.e, sistema: r.sistema }, fila.sitio, perfilVista)} />
                  <div className="plan-acciones">
                    <button type="button" className="primario" onClick={() => alVer(fila)}>{t("plan.verEnApp")}</button>
                    <button type="button" onClick={() => preguntas.current?.scrollIntoView({ block: "start", behavior: "smooth" })}>{t("plan.preguntar")}</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <section className="plan-chat" ref={preguntas}>
        <p className="rotulo">{t("plan.preguntasTitulo")}</p>
        <p className="plan-sobre">{t("plan.preguntasSobre", { sitio: nombreCorto(abierta.sitio.sitio), fecha: fecha(abierta.dia), dias: dias(r.duracionDias) })}</p>
        <div className="plan-chips">
          {PREGUNTAS.map((id) => {
            const sinGrilla = id === "cerca" && !vecindades[abierta.id];
            return (
              <button key={id} type="button" disabled={sinGrilla} title={sinGrilla ? t("plan.cercaNoDisponible") : undefined} onClick={() => preguntar(id)}>
                {t(`plan.p.${id}`)}
              </button>
            );
          })}
        </div>
        <div className="plan-hilo" aria-live="polite">
          {estado.hilo.length === 0 && <p className="tenue plan-nota">{t("plan.preguntasVacio")}</p>}
          {estado.hilo.slice(-MENSAJES_VISIBLES).map((mensaje, k, visibles) => (
            <div key={estado.hilo.length - visibles.length + k} className="plan-mensaje" ref={k === visibles.length - 1 ? ultimo : null}>
              <p className="burbuja pregunta">{t(`plan.p.${mensaje.id}`)}</p>
              <p className="burbuja respuesta">{respuesta(mensaje)}<small>{t("plan.calculadoCon", { funciones: mensaje.datos.funciones })}</small></p>
            </div>
          ))}
        </div>
      </section>

      {alComparar && (
        <div className="plan-comparar">
          <button type="button" onClick={alComparar}>{t("plan.comparar", { n: nMejores })}</button>
          {aviso && (
            <p className="plan-aviso" role="status">
              {t("plan.reemplazados", { n: aviso.n })}
              <button type="button" className="enlace" onClick={alDeshacer}>{t("plan.deshacer")}</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
