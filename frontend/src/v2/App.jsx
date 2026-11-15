import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { cargarCoordenadas, cargarGeometria, cargarSitios, cargarVecindad, hayBackend } from "./datos";
import { conMargenComunicacion, evaluarMision, tramos } from "./calculo";
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
import EnlacesNasa, { SelloValidacion } from "./EnlacesNasa";
import { BarraProgreso, PanelPendiente, VistaPendiente } from "./CargaPunto";
import "./estilos.css";

const Globo = lazy(() => import("./Globo"));
const Inicio = lazy(() => import("./inicio/Inicio"));
const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
const MAX_FIJADOS = 4;
const SITIO_INICIAL = "connecting-ridge";
const VISTAS = ["globo", "mapa", "horizonte", "alrededores", "comparar"]; // sus nombres están en i18n: vistas.<id>
const dos = (n) => String(n).padStart(2, "0");
// Qué piezas de la cabina arranca viendo cada perfil de la pantalla de inicio. Es solo el punto de partida:
// el menú lateral (botón MoonSet) permite prender o apagar cada una después.
const FUNCIONES_POR_PERFIL = {
  explorar: { globo: true, mapa: false, horizonte: true, alrededores: false, comparar: false, parametros: false, puntos: false, lineaTiempo: false },
  planificar: { globo: true, mapa: true, horizonte: true, alrededores: true, comparar: true, parametros: true, puntos: true, lineaTiempo: true },
};
// El perfil elegido va en el hash (#explorar, #planificar): recargar conserva la cabina y "atrás" vuelve al inicio.
const perfilDelHash = () => {
  const perfil = window.location.hash.slice(1);
  return perfil in FUNCIONES_POR_PERFIL ? perfil : null;
};

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
  const [perfil, setPerfil] = useState(perfilDelHash);
  useEffect(() => {
    const alCambiarHash = () => setPerfil(perfilDelHash());
    window.addEventListener("hashchange", alCambiarHash);
    return () => window.removeEventListener("hashchange", alCambiarHash);
  }, []);
  return (
    <ProveedorIdioma>
      {perfil ? (
        <Cabina key={perfil} perfil={perfil} />
      ) : (
        <Suspense fallback={null}>
          <Inicio alEntrar={(elegido) => { window.location.hash = elegido; }} />
        </Suspense>
      )}
    </ProveedorIdioma>
  );
}

function Cabina({ perfil }) {
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
  const [margenCom, setMargenCom] = useState(0); // margen mínimo de la Tierra sobre el relieve para comunicarse (°)
  const [horaMision, setHoraMision] = useState(0);
  const [fijados, setFijados] = useState([]); // [{ sitioId, dia, horaLlegada }]
  const [vecindades, setVecindades] = useState({}); // id -> grilla | null
  const [verPuntos, setVerPuntos] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  // En el perfil explorar la cabina arranca solo con la Luna: el panel de respuesta se despliega al elegir un sitio.
  const [panelAbierto, setPanelAbierto] = useState(perfil !== "explorar");
  const [funciones, setFunciones] = useState(FUNCIONES_POR_PERFIL[perfil]);
  const [coord, setCoord] = useState({ lat: "-88.80", lon: "125.00" });
  const [estadoCoord, setEstadoCoord] = useState(""); // error de validación del formulario de "Mis puntos"
  // Punto tocado que se está calculando (o que falló): { lat, lon, estado: "cargando" | "error", error, n }.
  const [pendiente, setPendiente] = useState(null);
  const [progreso, setProgreso] = useState(null); // barra del panel: { n, estado: "cargando" | "listo" }
  const pedido = useRef(null); // AbortController del último pedido: solo cuenta el último punto tocado
  const pedidosHechos = useRef(0);
  useEffect(() => () => pedido.current?.abort(), []); // al salir de la cabina no queda un pedido colgado
  const [enfoque, setEnfoque] = useState({ modo: "lejos" }); // a qué altura lleva el globo la cámara
  const [detalle, setDetalle] = useState({ capa: "wac", metrosPorPixel: BASE_METROS_POR_PIXEL }); // imagen que se ve en el globo
  const marcaRef = useRef(null);
  const menuRef = useRef(null);
  const cerrarMenuRef = useRef(null);

  useEffect(() => {
    Promise.all([cargarSitios(), cargarGeometria()])
      .then(([s, g]) => {
        setBase(s);
        setGeometria(g);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!menuAbierto) return undefined;
    cerrarMenuRef.current?.focus();
    const alTeclado = (evento) => {
      if (evento.key === "Escape") {
        setMenuAbierto(false);
        marcaRef.current?.focus();
      } else if (evento.key === "Tab") {
        const controles = menuRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled)") ?? [];
        const primero = controles[0];
        const ultimo = controles[controles.length - 1];
        if (evento.shiftKey && document.activeElement === primero) {
          evento.preventDefault();
          ultimo?.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primero?.focus();
        }
      }
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [menuAbierto]);

  // La grilla de alrededores se pide una vez por sitio, cuando se lo elige. Los puntos propios no la
  // tienen (se precalcula solo para los sitios de la lista al sur de 85° S): ni se la pide.
  useEffect(() => {
    if (!sitioId || sitioId in vecindades) return undefined;
    if (base && !base.some((s) => s.sitio.id === sitioId)) {
      setVecindades((x) => ({ ...x, [sitioId]: null }));
      return undefined;
    }
    let vigente = true;
    cargarVecindad(sitioId)
      .catch(() => null)
      .then((v) => vigente && setVecindades((x) => ({ ...x, [sitioId]: v })));
    return () => { vigente = false; };
  }, [sitioId, vecindades, base]);

  // Si se elige un sitio sin grilla estando en Alrededores, se vuelve al globo en vez de mostrar una vista vacía.
  useEffect(() => {
    if (vista === "alrededores" && vecindades[sitioId] === null) setVista("globo");
  }, [vista, sitioId, vecindades]);

  // Los sitios con la señal según el margen para comunicación: todo lo que mira el contacto usa esta lista.
  const sitios = useMemo(
    () => (base ? [...base, ...guardados, ...(prueba ? [prueba] : [])].map((s) => conMargenComunicacion(s, margenCom)) : null),
    [base, guardados, prueba, margenCom]
  );
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
  const esPrueba = prueba !== null && sitio.sitio.id === prueba.sitio.id;
  const esGuardado = guardados.some((s) => s.sitio.id === sitio.sitio.id);
  const diaViable = e.sobrevive ? null : fechaViableEnergia(sitio, sistema, dia, duracionH, horaLlegada);
  const minimoDiaViable = diaViable === null ? null : evaluarEnergia(sitio, sistema, diaViable * 24 + horaLlegada, duracionH, { serie: false }).minimoPct;
  // Entre los sitios que sí sirven, el que más contacto con la Tierra tiene (y a igual contacto, más luz).
  const mejorOtro = e.sobrevive
    ? null
    : evaluados.filter((r) => r.e.sobrevive && r.s !== sitio).sort((a, b) => b.m.senalPct - a.m.senalPct || b.m.luzPct - a.m.luzPct)[0];
  const vecindad = vecindades[sitio.sitio.id];
  // null: ya se sabe que no hay grilla (undefined es que todavía se está pidiendo).
  const sinVecindad = vecindad === null;
  const motivoSinVecindad = !sinVecindad ? "" : base.some((s) => s.sitio.id === sitio.sitio.id) ? t("alrededores.noDisponibleNorte") : t("alrededores.noDisponiblePropio");
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
  // Tocar la Luna para probar un punto: con "Mis puntos" activo, o en el perfil explorar si hay backend que lo calcule.
  const tocarLuna = funciones.puntos || (perfil === "explorar" && hayBackend);
  const deCerca = detalle.metrosPorPixel < 1000; // el globo está acercado: el botón ofrece volver a la Luna entera

  function cambiarFuncion(clave, activa) {
    const siguientes = { ...funciones, [clave]: activa };
    setFunciones(siguientes);
    if (VISTAS.includes(clave) && !activa && vista === clave) {
      setVista(VISTAS.find((v) => siguientes[v]) ?? "globo");
    }
  }

  function elegirSitio(id) {
    cancelarPendiente(); // elegir otro sitio mientras se calcula un punto lo deja de lado
    // Salir de un punto de prueba lo descarta: no se acumulan puntos que nadie pidió guardar.
    if (prueba && id !== prueba.sitio.id) setPrueba(null);
    setSitioId(id);
    setPanelAbierto(true);
    setHoraMision(0);
    setEnfoque({ modo: "lejos" }); // al cambiar de sitio se vuelve a ver la Luna entera
  }
  function cambiarLlegada(d, h) {
    setDia(d);
    setHoraLlegada(h);
    setHoraMision(0);
  }

  // Pide un año de datos para el punto. El panel pasa enseguida al punto nuevo (bloques de carga, nunca los
  // valores del sitio anterior) y, si se toca otro punto antes de la respuesta, el pedido viejo se cancela.
  async function probarPunto(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
      setEstadoCoord(t("puntos.errorRango"));
      return;
    }
    setEstadoCoord("");
    pedido.current?.abort();
    const control = new AbortController();
    pedido.current = control;
    const n = ++pedidosHechos.current;
    setPendiente({ lat, lon, estado: "cargando", n });
    setProgreso({ n, estado: "cargando" });
    setPanelAbierto(true);
    try {
      const nuevo = await cargarCoordenadas(lat, lon, { signal: control.signal });
      if (pedido.current !== control) return; // llegó tarde: ya se tocó otro punto
      pedido.current = null;
      const existente = guardados.find((s) => s.sitio.id === nuevo.sitio.id);
      setPrueba(existente ? null : nuevo); // reemplaza al punto de prueba anterior
      setSitioId(nuevo.sitio.id);
      setHoraMision(0);
      setPendiente(null);
      setProgreso({ n, estado: "listo" });
      setTimeout(() => setProgreso((p) => (p?.n === n ? null : p)), 700); // se completa y se desvanece
    } catch (err) {
      if (control.signal.aborted || pedido.current !== control) return; // cancelado a propósito
      pedido.current = null;
      setPendiente({ lat, lon, estado: "error", error: err.message, n });
      setProgreso(null);
    }
  }
  function cancelarPendiente() {
    pedido.current?.abort();
    pedido.current = null;
    setPendiente(null);
    setProgreso(null);
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
    <div className={`cabina en-${vista}${panelAbierto ? "" : " sin-panel"}${funciones.lineaTiempo ? "" : " sin-dock"}`}>
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
            onPunto={tocarLuna ? puntoEnGlobo : null}
            pendiente={pendiente?.estado === "cargando" ? pendiente : null}
          />
        </Suspense>
      </div>
      <div className="resplandor" aria-hidden="true" />

      <header className="barra">
        <button
          ref={marcaRef}
          type="button"
          className="marca vidrio"
          aria-label={t("app.abrirMenu")}
          aria-expanded={menuAbierto}
          aria-controls="menu-lateral"
          onClick={() => setMenuAbierto((abierto) => !abierto)}
        >
          <img src={`${import.meta.env.BASE_URL}marca/moonset-imagotipo.png`} alt="MoonSet" width="509" height="184" />
        </button>
        {funciones.parametros && (
          <div className="parametros vidrio">
            <label>{t("parametros.misionDe")}<input type="number" min="1" max="30" value={duracionDias} onChange={(e) => setDuracionDias(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />{t("parametros.dias")}</label>
          </div>
        )}
        {funciones.parametros && <Sistema sistema={sistema} perfilId={perfilId} alElegirPerfil={elegirPerfil} alCambiar={cambiarSistema} margenCom={margenCom} alCambiarMargen={setMargenCom} />}
        {funciones.puntos && <div className="puntos">
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
                <button type="submit" className="primario" disabled={!hayBackend || pendiente?.estado === "cargando"}>{pendiente?.estado === "cargando" ? t("puntos.calculando") : t("puntos.probar")}</button>
              </form>
              {!hayBackend && <p className="tenue">{t("puntos.sinBackend")}</p>}
              {estadoCoord && <p className="error" role="alert">{estadoCoord}</p>}
            </div>
          )}
        </div>}
        {/* Las vistas van siempre al final, a la derecha: sumar herramientas no las corre de lugar. */}
        {VISTAS.some((v) => funciones[v]) && (
          <nav className="vistas vidrio" aria-label={t("vistas.aria")}>
            {VISTAS.filter((v) => funciones[v]).map((v) => {
              // aria-disabled en vez de disabled: el botón sigue mostrando el tooltip y se puede enfocar.
              const bloqueada = v === "alrededores" && sinVecindad;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  aria-disabled={bloqueada || undefined}
                  title={bloqueada ? motivoSinVecindad : undefined}
                  onClick={() => !bloqueada && setVista(v)}
                >
                  {t(`vistas.${v}`)}{v === "comparar" && fijados.length > 0 ? ` · ${fijados.length}` : ""}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      {menuAbierto && (
        <div className="menu-capa">
          <button
            type="button"
            className="menu-fondo"
            aria-label={t("app.cerrarMenu")}
            onClick={() => {
              setMenuAbierto(false);
              marcaRef.current?.focus();
            }}
          />
          <aside ref={menuRef} id="menu-lateral" className="menu-lateral vidrio" role="dialog" aria-modal="true" aria-label={t("app.menu")}>
            <button
              ref={cerrarMenuRef}
              type="button"
              className="menu-cerrar"
              aria-label={t("app.cerrarMenu")}
              onClick={() => {
                setMenuAbierto(false);
                marcaRef.current?.focus();
              }}
            >
              ×
            </button>
            <div className="menu-contenido">
              <div className="menu-cabeza">
                <a className="menu-inicio" href="#"><span aria-hidden="true">←</span>{t("menu.inicio")}</a>
                <div className="idioma" role="group" aria-label={t("app.idioma")}>
                  {idiomas.map((i) => (
                    <button key={i} type="button" aria-pressed={idioma === i} onClick={() => setIdioma(i)}>{i.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <h2>{t("menu.ajustes")}</h2>
              <section className="menu-grupo" aria-labelledby="menu-vistas">
                <h3 id="menu-vistas">{t("menu.vistas")}</h3>
                {VISTAS.map((v) => (
                  <label className="menu-opcion" key={v}>
                    <span>{t(`vistas.${v}`)}</span>
                    <input
                      type="checkbox"
                      checked={funciones[v]}
                      disabled={funciones[v] && VISTAS.filter((opcion) => funciones[opcion]).length === 1}
                      onChange={(e) => cambiarFuncion(v, e.target.checked)}
                    />
                  </label>
                ))}
              </section>
              <section className="menu-grupo" aria-labelledby="menu-herramientas">
                <h3 id="menu-herramientas">{t("menu.herramientas")}</h3>
                {["parametros", "puntos", "lineaTiempo"].map((clave) => (
                  <label className="menu-opcion" key={clave}>
                    <span>{t(`menu.${clave}`)}</span>
                    <input
                      type="checkbox"
                      checked={funciones[clave]}
                      onChange={(e) => cambiarFuncion(clave, e.target.checked)}
                    />
                  </label>
                ))}
              </section>
            </div>
          </aside>
        </div>
      )}

      {panelAbierto && <aside className={`panel vidrio ${pendiente ? "cargando" : e.sobrevive ? "si" : "no"}`} aria-live="polite" aria-busy={pendiente?.estado === "cargando" || undefined}>
        <BarraProgreso key={progreso?.n} estado={progreso?.estado ?? null} />
        {pendiente ? (
          <PanelPendiente pendiente={pendiente} alReintentar={() => probarPunto(pendiente.lat, pendiente.lon)} alVolver={cancelarPendiente} />
        ) : (<>
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
          {funciones.puntos && esPrueba ? (
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

        <SelloValidacion />
        <EnlacesNasa lat={sitio.sitio.lat} lon={sitio.sitio.lon} inicioMs={sitio.t0 + i0 * HORA_MS} finMs={sitio.t0 + (i0 + duracionH) * HORA_MS} conHorizons={perfil === "planificar"} />

        {/* Fijar y exportar comparten fila para que el panel no necesite scroll. Exportar es una herramienta de
            planificación: el perfil explorar no la muestra. */}
        <div className="panel-pie">
          {funciones.comparar && (
            <button type="button" className="primario fijar" disabled={yaFijado || fijados.length >= MAX_FIJADOS} onClick={fijar}>
              {yaFijado ? t("panel.yaEnComparar") : fijados.length >= MAX_FIJADOS ? t("panel.maximo", { n: MAX_FIJADOS }) : t("panel.fijar")}
            </button>
          )}
          {perfil !== "explorar" && <button type="button" className="exportar" onClick={exportarCsv} title={t("panel.exportarAyuda")}>{t("panel.exportar")}</button>}
        </div>
        {funciones.puntos && esGuardado && <button type="button" className="quitar-punto" onClick={() => quitarPunto(sitio.sitio.id)}>{t("panel.quitarPunto")}</button>}
        </>)}
      </aside>}

      <main className="centro">
        {vista === "globo" && (
          <div className="pista-globo vidrio">
            <p>{!panelAbierto ? t("globo.pistaExplorar") : hayBackend ? t("globo.pistaBackend") : t("globo.pistaSinBackend")}</p>
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
              onPunto={tocarLuna ? puntoEnGlobo : null}
              vecindad={vecindad}
              i0={i0}
              duracionH={duracionH}
              sistema={sistema}
              hayBackend={hayBackend}
              pendiente={pendiente?.estado === "cargando" ? pendiente : null}
            />
          </section>
        )}

        {/* Mientras se calcula un punto tocado, Horizonte y Alrededores no muestran el sitio anterior. */}
        {(vista === "horizonte" || vista === "alrededores") && pendiente && (
          <section className="tarjeta vidrio" aria-busy={pendiente.estado === "cargando" || undefined}>
            <VistaPendiente pendiente={pendiente} vista={vista} alReintentar={() => probarPunto(pendiente.lat, pendiente.lon)} />
          </section>
        )}

        {vista === "horizonte" && !pendiente && (
          <section className="tarjeta vidrio">
            <VistaHorizonte sitio={sitio} i={iAhora} />
          </section>
        )}

        {vista === "alrededores" && !pendiente && (
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
                        setVista(VISTAS.find((v) => funciones[v]) ?? "globo");
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

      {funciones.lineaTiempo && <Dock
        esperando={pendiente !== null}
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
      />}

      <p className="creditos">{t("app.creditos")}</p>
    </div>
  );
}
