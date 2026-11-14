import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { cargarCoordenadas, cargarGeometria, cargarSitios, cargarVecindad, hayBackend } from "./datos";
import { evaluarMision, tramos } from "./calculo";
import { entradaSitio, evaluarEnergia, fechaViableEnergia, recomendar } from "./energia";
import { PERFIL_INICIAL, PERFIL_PERSONALIZADO, PERFILES } from "./configEnergia";
import { ProveedorIdioma, useIdioma } from "./i18n";
import { BASE_METROS_POR_PIXEL, CAPAS } from "./globo/teselas";
import Dock from "./Dock";
import VistaHorizonte from "./VistaHorizonte";
import Vecindad from "./Vecindad";
import MapaPolar from "./MapaPolar";
import Sistema from "./Sistema";
import { csvComparacion, csvMision, nombreArchivo, nombreComparacion } from "./exportar";
import "./estilos.css";

const Globo = lazy(() => import("./Globo"));
const DIA_MS = 86_400_000;
const MAX_FIJADOS = 4;
const SITIO_INICIAL = "connecting-ridge";
const VISTAS = ["globo", "mapa", "horizonte", "alrededores", "comparar"]; // sus nombres están en i18n: vistas.<id>
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

// Batería mínima de la misión (% de la capacidad usable) frente a la reserva, que es la marca.
function BarraCarga({ minimoPct, reservaPct, sobrevive }) {
  const { t, f } = useIdioma();
  return (
    <div className="medidor" role="img" aria-label={t("energia.barraAria", { minimo: f.num(minimoPct), reserva: f.num(reservaPct) })}>
      <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, minimoPct / 100))})`, background: sobrevive ? "var(--bien)" : "var(--mal)" }} />
      <b style={{ left: `${Math.min(100, reservaPct)}%` }} />
    </div>
  );
}

// kWh redondeados hacia arriba: lo que falta nunca se muestra menor de lo que es.
const kwhArriba = (x) => (x < 10 ? Math.ceil(x * 10) / 10 : Math.ceil(x));

export default function App() {
  return (
    <ProveedorIdioma>
      <Cabina />
    </ProveedorIdioma>
  );
}

function Cabina() {
  const { idioma, setIdioma, idiomas, t, f } = useIdioma();
  const { num, coordenadas, fechaCorta, fechaLarga, nombreCorto, duracion } = f;
  const [base, setBase] = useState(null); // sitios de la lista curada
  const [guardados, setGuardados] = useState([]); // puntos propios que el usuario decidió conservar
  const [prueba, setPrueba] = useState(null); // punto tocado en la Luna, todavía sin guardar
  const [geometria, setGeometria] = useState(null);
  const [error, setError] = useState("");
  const [vista, setVista] = useState("globo");
  const [sitioId, setSitioId] = useState(SITIO_INICIAL);
  const [dia, setDia] = useState(121); // 2 de mayo de 2027
  const [horaLlegada, setHoraLlegada] = useState(0);
  const [duracionDias, setDuracionDias] = useState(14);
  const [perfilId, setPerfilId] = useState(PERFIL_INICIAL);
  const [sistema, setSistema] = useState(() => PERFILES.find((p) => p.id === PERFIL_INICIAL).valores); // paneles + batería
  const [horaMision, setHoraMision] = useState(0);
  const [fijados, setFijados] = useState([]); // [{ sitioId, dia, horaLlegada }]
  const [vecindades, setVecindades] = useState({}); // id -> grilla | null
  const [verPuntos, setVerPuntos] = useState(false);
  const [coord, setCoord] = useState({ lat: "-88.80", lon: "125.00" });
  const [estadoCoord, setEstadoCoord] = useState(""); // "", "cargando" o un mensaje de error
  const [enfoque, setEnfoque] = useState({ modo: "lejos" }); // a qué altura lleva el globo la cámara
  const [detalle, setDetalle] = useState({ capa: "wac", metrosPorPixel: BASE_METROS_POR_PIXEL }); // imagen que se ve en el globo

  useEffect(() => {
    Promise.all([cargarSitios(), cargarGeometria()])
      .then(([s, g]) => {
        setBase(s);
        setGeometria(g);
      })
      .catch((e) => setError(e.message));
  }, []);

  // La grilla de alrededores se pide una vez por sitio, cuando se lo elige.
  useEffect(() => {
    if (!sitioId || sitioId in vecindades) return undefined;
    let vigente = true;
    cargarVecindad(sitioId)
      .catch(() => null)
      .then((v) => vigente && setVecindades((x) => ({ ...x, [sitioId]: v })));
    return () => { vigente = false; };
  }, [sitioId, vecindades]);

  const sitios = useMemo(() => (base ? [...base, ...guardados, ...(prueba ? [prueba] : [])] : null), [base, guardados, prueba]);
  const duracionH = duracionDias * 24;
  const sitio = sitios?.find((s) => s.sitio.id === sitioId) ?? sitios?.[0];
  const i0 = dia * 24 + horaLlegada;

  // Todos los sitios evaluados en la fecha elegida: colorea el globo y alimenta la sugerencia.
  const evaluados = useMemo(
    () => (sitios ? sitios.map((s) => ({ s, m: evaluarMision(s, i0, duracionH), e: evaluarEnergia(s, sistema, i0, duracionH) })) : []),
    [sitios, i0, duracionH, sistema]
  );
  // Cuánto falta o sobra en el sitio elegido (búsquedas sobre la simulación): no depende de la hora que se mira.
  const accion = useMemo(() => {
    if (!sitio) return null;
    const fin = Math.min(sitio.muestras, i0 + duracionH);
    return recomendar(sistema, entradaSitio(sitio, sistema.orientacion), i0, fin, evaluarEnergia(sitio, sistema, i0, duracionH, { serie: false }));
  }, [sitio, sistema, i0, duracionH]);

  if (error) {
    return (
      <main className="aviso">
        <p>{t("app.errorCarga", { error })}</p>
        <p className="tenue">{t("app.errorAyuda")}</p>
      </main>
    );
  }
  if (!sitio || !geometria) return <main className="aviso tenue">{t("app.cargando")}</main>;

  const { m, e } = evaluados.find((r) => r.s === sitio);
  const viables = new Set(evaluados.filter((r) => r.e.sobrevive).map((r) => r.s.sitio.id));
  const hora = Math.min(horaMision, duracionH - 1);
  const iAhora = i0 + hora;
  const iGeo = Math.min(geometria.sol_lat.length - 1, iAhora);
  const esPrueba = prueba !== null && sitio === prueba;
  const esGuardado = guardados.includes(sitio);
  const diaViable = e.sobrevive ? null : fechaViableEnergia(sitio, sistema, dia, duracionH, horaLlegada);
  const minimoDiaViable = diaViable === null ? null : evaluarEnergia(sitio, sistema, diaViable * 24 + horaLlegada, duracionH, { serie: false }).minimoPct;
  // Entre los sitios que sí sirven, el que más contacto con la Tierra tiene (y a igual contacto, más luz).
  const mejorOtro = e.sobrevive
    ? null
    : evaluados.filter((r) => r.e.sobrevive && r.s !== sitio).sort((a, b) => b.m.senalPct - a.m.senalPct || b.m.luzPct - a.m.luzPct)[0];
  const vecindad = vecindades[sitio.sitio.id];
  const yaFijado = fijados.some((f) => f.sitioId === sitio.sitio.id && f.dia === dia && f.horaLlegada === horaLlegada);
  const av = e.avisos;
  const hayAvisos = av.potenciaNominal || av.ciclos || av.nochesSinCalefaccion;
  const kwh = (x) => num(kwhArriba(x), x < 10 ? 1 : 0);
  let fraseAccion;
  if (e.sobrevive) {
    fraseAccion = accion.capacidadMinimaKWh === 0
      ? t("energia.sinBateria")
      : t("energia.sobra", { pct: num(Math.floor(accion.sobraPct)), kwh: kwh(accion.capacidadMinimaKWh) });
  } else if (accion.faltanKWh !== null && accion.faltanPaneles !== null) {
    fraseAccion = t("energia.faltan", { kwh: kwh(accion.faltanKWh), n: accion.faltanPaneles });
  } else if (accion.faltanKWh !== null) {
    fraseAccion = t("energia.panelesNoAlcanzan", { h: e.nocheMaxH, kwh: kwh(accion.faltanKWh) });
  } else if (accion.faltanPaneles !== null) {
    fraseAccion = t("energia.faltanPaneles", { n: accion.faltanPaneles });
  } else {
    fraseAccion = t("energia.nadaAlcanza");
  }

  function elegirPerfil(id) {
    setPerfilId(id);
    const p = PERFILES.find((x) => x.id === id);
    if (p) setSistema(p.valores);
  }
  function cambiarSistema(cambios) {
    setSistema((s) => ({ ...s, ...cambios }));
    setPerfilId(PERFIL_PERSONALIZADO);
  }
  const deCerca = detalle.metrosPorPixel < 1000; // el globo está acercado: el botón ofrece volver a la Luna entera

  function elegirSitio(id) {
    // Salir de un punto de prueba lo descarta: no se acumulan puntos que nadie pidió guardar.
    if (prueba && id !== prueba.sitio.id) setPrueba(null);
    setSitioId(id);
    setHoraMision(0);
    setEnfoque({ modo: "lejos" }); // al cambiar de sitio se vuelve a ver la Luna entera
  }
  function cambiarLlegada(d, h) {
    setDia(d);
    setHoraLlegada(h);
    setHoraMision(0);
  }

  async function probarPunto(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
      setEstadoCoord(t("puntos.errorRango"));
      return;
    }
    setEstadoCoord("cargando");
    try {
      const nuevo = await cargarCoordenadas(lat, lon);
      const existente = guardados.find((s) => s.sitio.id === nuevo.sitio.id);
      setPrueba(existente ? null : nuevo); // reemplaza al punto de prueba anterior
      setSitioId(nuevo.sitio.id);
      setHoraMision(0);
      setEstadoCoord("");
    } catch (e) {
      setEstadoCoord(t("puntos.errorCalculo", { error: e.message }));
    }
  }
  function puntoEnGlobo({ lat, lon }) {
    setCoord({ lat: lat.toFixed(2), lon: lon.toFixed(2) });
    if (hayBackend) probarPunto(lat, lon);
    else setVerPuntos(true);
  }
  function guardarPrueba() {
    if (!prueba) return;
    setGuardados((x) => [...x, prueba]);
    setPrueba(null);
  }
  function descartarPrueba() {
    setPrueba(null);
    setSitioId(SITIO_INICIAL);
    setHoraMision(0);
  }
  function quitarPunto(id) {
    setGuardados((x) => x.filter((s) => s.sitio.id !== id));
    setFijados((x) => x.filter((f) => f.sitioId !== id));
    if (sitioId === id) setSitioId(SITIO_INICIAL);
  }
  function quitarTodos() {
    const ids = new Set(guardados.map((s) => s.sitio.id));
    setGuardados([]);
    setFijados((x) => x.filter((f) => !ids.has(f.sitioId)));
    if (ids.has(sitioId)) setSitioId(SITIO_INICIAL);
  }
  // Descargas CSV (exportar.js): separadores según el idioma de la interfaz. La marca BOM hace que
  // Excel lea bien los acentos de los metadatos.
  const perfilActual = () => PERFILES.find((p) => p.id === perfilId) ?? { id: perfilId };
  function exportarCsv() {
    descargar(csvMision({ sitio, sistema, perfil: perfilActual(), i0, duracionH, idioma }), nombreArchivo(sitio, i0, duracionH));
  }
  function exportarComparacion() {
    const escenarios = fijadosVista.map(({ s, f0 }) => ({ sitio: s, i0: f0 }));
    descargar(csvComparacion({ escenarios, sistema, perfil: perfilActual(), duracionH, idioma }), nombreComparacion(escenarios.length, duracionH));
  }
  function descargar(csv, nombre) {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fijar() {
    if (esPrueba) guardarPrueba(); // un escenario fijado necesita que su punto exista
    setFijados((x) => [...x, { sitioId: sitio.sitio.id, dia, horaLlegada }]);
  }

  const fijadosVista = fijados
    .map((f, k) => {
      const s = sitios.find((x) => x.sitio.id === f.sitioId);
      const f0 = f.dia * 24 + f.horaLlegada;
      return s ? { f, k, s, f0, r: evaluarMision(s, f0, duracionH), en: evaluarEnergia(s, sistema, f0, duracionH, { serie: false }) } : null;
    })
    .filter(Boolean);
  // El de más margen: el que termina con más batería en su peor momento.
  const mejorFijado = fijadosVista.length > 1 ? fijadosVista.reduce((a, b) => (b.en.minimoPct > a.en.minimoPct ? b : a)) : null;

  return (
    <div className={`cabina en-${vista}`}>
      <div className="escena" aria-hidden={vista !== "globo"}>
        <Suspense fallback={null}>
          <Globo
            sitios={sitios}
            sitioId={sitio.sitio.id}
            viables={viables}
            sol={{ lat: geometria.sol_lat[iGeo], lon: geometria.sol_lon[iGeo] }}
            tierra={{ lat: geometria.tierra_lat[iGeo], lon: geometria.tierra_lon[iGeo] }}
            hayContacto={sitio.senal[iAhora] === 1}
            nombreActivo={nombreCorto(sitio.sitio)}
            rotuloTierra={t("globo.aLaTierra")}
            enfoque={enfoque}
            onDetalle={setDetalle}
            onElegir={elegirSitio}
            onPunto={puntoEnGlobo}
          />
        </Suspense>
      </div>
      <div className="resplandor" aria-hidden="true" />

      <header className="barra">
        <div className="marca vidrio"><i aria-hidden="true" />MoonSet</div>
        <nav className="vistas vidrio" aria-label={t("vistas.aria")}>
          {VISTAS.map((v) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>
              {t(`vistas.${v}`)}{v === "comparar" && fijados.length > 0 ? ` · ${fijados.length}` : ""}
            </button>
          ))}
        </nav>
        <div className="parametros vidrio">
          <label>{t("parametros.misionDe")}<input type="number" min="1" max="30" value={duracionDias} onChange={(e) => setDuracionDias(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />{t("parametros.dias")}</label>
        </div>
        <Sistema sistema={sistema} perfilId={perfilId} alElegirPerfil={elegirPerfil} alCambiar={cambiarSistema} />
        <div className="puntos">
          <button type="button" className="vidrio" aria-expanded={verPuntos} onClick={() => setVerPuntos((v) => !v)}>
            {t("puntos.titulo")}{guardados.length > 0 ? ` · ${guardados.length}` : ""}
          </button>
          {verPuntos && (
            <div className="puntos-lista vidrio">
              <div className="puntos-cabeza">
                <b>{t("puntos.titulo")}</b>
                <button type="button" disabled={guardados.length === 0} onClick={quitarTodos}>{t("puntos.quitarTodos")}</button>
              </div>
              {guardados.length === 0 && <p className="tenue">{t("puntos.vacio")}</p>}
              {guardados.map((s) => (
                <div className="punto-fila" key={s.sitio.id}>
                  <button type="button" className="enlace" onClick={() => elegirSitio(s.sitio.id)}>{coordenadas(s.sitio)}</button>
                  <button type="button" onClick={() => quitarPunto(s.sitio.id)}>{t("puntos.quitar")}</button>
                </div>
              ))}
              <form
                className="puntos-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  probarPunto(Number(coord.lat), Number(coord.lon));
                }}
              >
                <label>{t("puntos.latitud")}<input type="number" step="any" min="-90" max="90" value={coord.lat} onChange={(e) => setCoord({ ...coord, lat: e.target.value })} /></label>
                <label>{t("puntos.longitud")}<input type="number" step="any" min="-180" max="360" value={coord.lon} onChange={(e) => setCoord({ ...coord, lon: e.target.value })} /></label>
                <button type="submit" className="primario" disabled={!hayBackend || estadoCoord === "cargando"}>{estadoCoord === "cargando" ? t("puntos.calculando") : t("puntos.probar")}</button>
              </form>
              {!hayBackend && <p className="tenue">{t("puntos.sinBackend")}</p>}
              {estadoCoord && estadoCoord !== "cargando" && <p className="error" role="alert">{estadoCoord}</p>}
            </div>
          )}
        </div>
        <div className="idioma vidrio" role="group" aria-label={t("app.idioma")}>
          {idiomas.map((i) => (
            <button key={i} type="button" aria-pressed={idioma === i} onClick={() => setIdioma(i)}>{i.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <aside className={`panel vidrio ${e.sobrevive ? "si" : "no"}`} aria-live="polite">
        <div className="panel-sitio">
          <select value={sitio.sitio.id} onChange={(e) => elegirSitio(e.target.value)} aria-label={t("panel.sitioAria")}>
            {sitios.map((s) => <option key={s.sitio.id} value={s.sitio.id}>{nombreCorto(s.sitio)}</option>)}
          </select>
          <p className="tenue">{coordenadas(sitio.sitio)} · {sitio.horizonte.fuente === "esfera" ? t("panel.sinRelieve") : t("panel.conRelieve")}</p>
        </div>

        <div className="panel-veredicto">
          <p className="chip"><i aria-hidden="true" />{!e.sobrevive ? t("energia.chipFalla", { t: duracion(e.horaFalla + 1) }) : m.nocheH === 0 ? t("panel.luzToda") : t("energia.chipNoche", { t: duracion(m.nocheH) })}</p>
          <h1>{e.sobrevive ? t("panel.sobrevive") : t("panel.noSobrevive")}</h1>
        </div>

        {hayAvisos && (
          <ul className="avisos">
            {av.potenciaNominal && <li>{t("energia.avisoNominal", { max: num(av.maxDescargaKW, 2), nominal: num(av.potenciaNominalKW, 2) })}</li>}
            {av.ciclos && <li>{t("energia.avisoCiclos", { usados: num(e.ciclos, 1), vida: num(av.vidaCiclos) })}</li>}
            {av.nochesSinCalefaccion && <li>{t("energia.avisoCalefaccion")}</li>}
          </ul>
        )}

        <div className="panel-medidor">
          <p><span>{t("energia.minima")} <b>{num(e.minimoPct)} %</b></span><span>{t("energia.reserva")} <b>{num(sistema.reservaPct)} %</b></span></p>
          <BarraCarga minimoPct={e.minimoPct} reservaPct={sistema.reservaPct} sobrevive={e.sobrevive} />
        </div>
        <p className="panel-accion">{fraseAccion}</p>

        <dl className="panel-cifras">
          <div><dt>{t("panel.luzSolar")}</dt><dd>{num(m.luzPct)}<small> %</small></dd></div>
          <div><dt>{t("panel.contacto")}</dt><dd>{num(m.senalPct)}<small> %</small></dd></div>
          <div title={t("panel.energiaAyuda")}><dt>{t("panel.energia")}</dt><dd>{num(m.energiaSeguidorPct)}<small> %</small></dd></div>
        </dl>

        <details className="panel-detalle">
          <summary>{t("energia.detalle")}</summary>
          <dl>
            <div><dt>{t("energia.generada")}</dt><dd>{num(e.generadaKWh, 1)} kWh</dd></div>
            <div><dt>{t("energia.consumida")}</dt><dd>{num(e.consumidaKWh, 1)} kWh</dd></div>
            <div><dt>{t("energia.masa")}</dt><dd>{num(e.masaKg, 1)} kg</dd></div>
            <div><dt>{t("energia.autonomia")}</dt><dd>{Number.isFinite(e.autonomiaH) ? duracion(Math.round(e.autonomiaH)) : t("energia.sinConsumo")}</dd></div>
            <div><dt>{t("energia.bajoReserva")}</dt><dd>{e.horasBajoReserva} h</dd></div>
            <div><dt>{t("energia.nocheLarga")}</dt><dd>{m.nocheH} h</dd></div>
          </dl>
        </details>

        <div className="panel-opciones">
          {esPrueba ? (
            <>
              <p className="rotulo">{t("panel.pruebaRotulo")}</p>
              <p className="nota">{t("panel.pruebaNota")}</p>
              <div className="dupla">
                <button type="button" className="primario" onClick={guardarPrueba}>{t("panel.guardar")}</button>
                <button type="button" onClick={descartarPrueba}>{t("panel.descartar")}</button>
              </div>
            </>
          ) : e.sobrevive ? (
            <>
              <p className="rotulo">{t("panel.queHacer")}</p>
              <p className="nota vacio">{t("panel.nadaQueCambiar")}</p>
            </>
          ) : (
            <>
              <p className="rotulo">{t("panel.queHacer")}</p>
              {diaViable !== null && (
                <button type="button" className="opcion" onClick={() => cambiarLlegada(diaViable, horaLlegada)}>
                  <span><b>{t("panel.esperar", { fecha: fechaLarga(sitio.t0 + diaViable * DIA_MS) })}</b><small>{t("panel.esperarDetalle", { n: diaViable - dia, pct: num(minimoDiaViable) })}</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              )}
              {mejorOtro && (
                <button type="button" className="opcion" onClick={() => elegirSitio(mejorOtro.s.sitio.id)}>
                  <span><b>{t("panel.irA", { sitio: nombreCorto(mejorOtro.s.sitio) })}</b><small>{t("panel.irADetalle", { pct: num(mejorOtro.e.minimoPct), contacto: mejorOtro.m.senalPct === 0 ? t("panel.sinContacto") : t("panel.pctContacto", { pct: num(mejorOtro.m.senalPct) }) })}</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              )}
              {diaViable === null && !mejorOtro && <p className="nota vacio">{t("panel.sinAlternativa")}</p>}
            </>
          )}
        </div>

        <button type="button" className="primario fijar" disabled={yaFijado || fijados.length >= MAX_FIJADOS} onClick={fijar}>
          {yaFijado ? t("panel.yaEnComparar") : fijados.length >= MAX_FIJADOS ? t("panel.maximo", { n: MAX_FIJADOS }) : t("panel.fijar")}
        </button>
        <button type="button" className="exportar" onClick={exportarCsv} title={t("panel.exportarAyuda")}>{t("panel.exportar")}</button>
        {esGuardado && <button type="button" className="quitar-punto" onClick={() => quitarPunto(sitio.sitio.id)}>{t("panel.quitarPunto")}</button>}
      </aside>

      <main className="centro">
        {vista === "globo" && (
          <div className="pista-globo vidrio">
            <p>{hayBackend ? t("globo.pistaBackend") : t("globo.pistaSinBackend")}</p>
            <div className="pista-acciones">
              <button type="button" onClick={() => setEnfoque({ modo: deCerca ? "lejos" : "cerca" })}>
                {deCerca ? t("globo.alejar") : t("globo.acercar")}
              </button>
              <span>{t("globo.detalle", { capa: CAPAS[detalle.capa].nombre, resolucion: f.longitud(detalle.metrosPorPixel) })}</span>
            </div>
          </div>
        )}

        {vista === "mapa" && (
          <section className="tarjeta vidrio mapa-tarjeta">
            <MapaPolar
              sitios={sitios}
              sitio={sitio}
              viables={viables}
              sol={{ lat: geometria.sol_lat[iGeo], lon: geometria.sol_lon[iGeo] }}
              tierra={{ lat: geometria.tierra_lat[iGeo], lon: geometria.tierra_lon[iGeo] }}
              onElegir={elegirSitio}
              onPunto={puntoEnGlobo}
              vecindad={vecindad}
              i0={i0}
              duracionH={duracionH}
              sistema={sistema}
              hayBackend={hayBackend}
            />
          </section>
        )}

        {vista === "horizonte" && (
          <section className="tarjeta vidrio">
            <VistaHorizonte sitio={sitio} i={iAhora} />
          </section>
        )}

        {vista === "alrededores" && (
          <section className="tarjeta vidrio">
            {vecindad ? (
              <Vecindad sitio={sitio} vecindad={vecindad} i0={i0} duracionH={duracionH} sistema={sistema} />
            ) : (
              <p className="tarjeta-vacia">{t("alrededores.vacio")}</p>
            )}
          </section>
        )}

        {vista === "comparar" && (
          <section className="tarjeta vidrio comparar">
            {fijadosVista.length === 0 ? (
              <p className="tarjeta-vacia">{t("comparar.vacio", { n: MAX_FIJADOS })}</p>
            ) : (
              <div className="columnas" style={{ "--n": fijadosVista.length }}>
                {fijadosVista.map(({ f, k, s, f0, r, en }) => (
                  <article key={`${f.sitioId}/${f.dia}/${f.horaLlegada}`} className={`columna ${en.sobrevive ? "si" : "no"}${mejorFijado && mejorFijado.k === k ? " mejor" : ""}`}>
                    <header>
                      <div>
                        <p className="rotulo">{mejorFijado && mejorFijado.k === k ? t("comparar.masMargen") : t("comparar.escenario", { letra: "ABCD"[k] })}</p>
                        <h3>{nombreCorto(s.sitio)}</h3>
                        <p className="tenue">{fechaCorta(s.t0 + f.dia * DIA_MS)} · {dos(f.horaLlegada)}:00 UTC</p>
                      </div>
                      <button type="button" className="equis" aria-label={t("comparar.quitarAria")} onClick={() => setFijados((x) => x.filter((_, j) => j !== k))}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" /></svg>
                      </button>
                    </header>
                    <p className="veredicto-chico">{en.sobrevive ? t("panel.sobrevive") : t("panel.noSobrevive")}</p>
                    <p className="tenue margen">{en.sobrevive ? t("comparar.minima", { pct: num(en.minimoPct) }) : t("energia.chipFalla", { t: duracion(en.horaFalla + 1) })}</p>
                    <p className="par"><span>{t("panel.nocheLarga")}</span><b>{r.nocheH} h</b></p>
                    <BarraCarga minimoPct={en.minimoPct} reservaPct={sistema.reservaPct} sobrevive={en.sobrevive} />
                    <p className="par"><span>{t("panel.luzSolar")}</span><b>{num(r.luzPct)} %</b></p>
                    <p className="par"><span>{t("panel.contacto")}</span><b>{num(r.senalPct)} %</b></p>
                    <p className="par"><span>{t("panel.energia")}</span><b>{num(r.energiaSeguidorPct)} %</b></p>
                    <p className="par"><span>{t("comparar.solAlLlegar")}</span><b>{r.solVisible ? t("comparar.visible") : t("comparar.oculto")}{r.hCambioSol !== null && `, ${r.hCambioSol} h`}</b></p>
                    <Cinta serie={s.luz} desde={f0} hasta={f0 + duracionH} color="var(--acento)" />
                    <Cinta serie={s.senal} desde={f0} hasta={f0 + duracionH} color="var(--tierra)" />
                    <button
                      type="button"
                      className="ver"
                      onClick={() => {
                        elegirSitio(f.sitioId);
                        cambiarLlegada(f.dia, f.horaLlegada);
                        setVista("globo");
                      }}
                    >
                      {t("comparar.ver")}
                    </button>
                  </article>
                ))}
              </div>
            )}
            {fijadosVista.length > 0 && (
              <div className="comparar-pie">
                <button type="button" className="exportar" onClick={exportarComparacion} title={t("comparar.exportarAyuda")}>{t("comparar.exportar")}</button>
              </div>
            )}
          </section>
        )}
      </main>

      <Dock
        sitio={sitio}
        dia={dia}
        horaLlegada={horaLlegada}
        alCambiarLlegada={cambiarLlegada}
        duracionDias={duracionDias}
        duracionH={duracionH}
        sistema={sistema}
        soc={e.soc}
        sobrevive={e.sobrevive}
        horaMision={hora}
        setHoraMision={setHoraMision}
      />

      <p className="creditos">{t("app.creditos")}<a href="?clasico">{t("app.versionAnterior")}</a></p>
    </div>
  );
}
