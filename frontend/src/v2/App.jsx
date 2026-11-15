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
import { PERFILES_BASE, PERSONALIZADO, VISTAS, borrarPersonalizado, configDePerfil, guardarPersonalizado, leerPersonalizado } from "./ajustes";
import { ANGOSTO, useMedia } from "./useMedia";
import Cajon from "./Cajon";
import Asa from "./Asa";
import Tutorial, { useTutorial } from "./Tutorial";
import { BarraProgreso, PanelPendiente, VistaPendiente } from "./CargaPunto";
import Planificador, { Explicaciones, IconoAstronauta, PestanasPlan } from "./Planificador";
import { HORA_LLEGADA, MEJORES, ajustarSistema, alternarPlan, estadoInicialPlan, evaluarSitio, ordenarRanking, perfilElegido, perfilParaApp, sitiosDeRegion } from "./planificar";
import { explicar } from "./explicar";
import "./estilos.css";

const Globo = lazy(() => import("./Globo"));
const Inicio = lazy(() => import("./inicio/Inicio"));
const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
const MAX_FIJADOS = 4;
const ESPERA_RECALCULO_MS = 350; // el ranking se recalcula tras este tiempo sin cambios de duración
const SITIO_INICIAL = "connecting-ridge";
const CLAVE_ASTRONAUTA = "moonset.astronautaVisto"; // el botón del astronauta ya hizo su pulso de bienvenida
const ESPERA_BARRA_MS = 300; // si el ranking tarda más que esto, se muestra la barra de carga
const AVISO_MS = 10_000; // cuánto queda a la vista "Se reemplazaron N escenarios · Deshacer"
// true solo en la primera visita. Sin almacenamiento (modo privado) no hay pulso: no se podría recordar que ya se vio.
function primeraVisita() {
  try {
    return localStorage.getItem(CLAVE_ASTRONAUTA) === null;
  } catch {
    return false;
  }
}
const dos = (n) => String(n).padStart(2, "0");
const EQUIS = <svg aria-hidden="true" width="11" height="11" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
// El perfil elegido va en el hash (#explorar, #planificar): recargar conserva la cabina y "atrás" vuelve al inicio.
const perfilDelHash = () => {
  const perfil = window.location.hash.slice(1);
  return PERFILES_BASE.includes(perfil) ? perfil : null;
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
  const { idioma, t, f } = useIdioma();
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
  // En el perfil explorar la cabina arranca solo con la Luna: el panel de respuesta se despliega al elegir un sitio.
  const [panelAbierto, setPanelAbierto] = useState(perfil !== "explorar");
  // Qué se ve en la cabina (ajustes.js). Arranca con el perfil elegido en el inicio; al cambiar algo pasa a ser
  // el perfil personalizado, que se guarda en el navegador. `origen` es el perfil del que partió.
  const [config, setConfig] = useState(() => configDePerfil(perfil));
  const [activo, setActivo] = useState(perfil);
  const [origen, setOrigen] = useState(perfil);
  const [propio, setPropio] = useState(leerPersonalizado);
  const [cajonAbierto, setCajonAbierto] = useState(false);
  // Plegar es momentáneo (un toque en el asa) y no cambia el perfil; ocultar se hace desde el cajón.
  const [panelPlegado, setPanelPlegado] = useState(false);
  const [dockPlegado, setDockPlegado] = useState(false);
  const angosto = useMedia(ANGOSTO);
  const tutorial = useTutorial(origen);
  const pasoTutorial = tutorial.paso;
  // Cada paso del tutorial deja a la vista el control que va a señalar.
  useEffect(() => {
    if (!pasoTutorial) return;
    if (pasoTutorial.vista) setVista(pasoTutorial.vista);
    if (pasoTutorial.id !== "agregar") setCajonAbierto(false); // solo ese paso trabaja con el cajón abierto
    // El modo planificación se abre solo en los pasos que lo muestran; en el resto, el recorrido sigue en la cabina.
    if (pasoTutorial.necesita === "plan" && !plan.abierto) alternarModoPlan();
    else if (pasoTutorial.necesita !== "plan" && plan.abierto) cerrarPlan();
    if (pasoTutorial.necesita === "panel") {
      setPanelAbierto(true);
      setPanelPlegado(false);
    }
    if (pasoTutorial.necesita === "dock") setDockPlegado(false);
  }, [pasoTutorial]);
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
  const ajustesRef = useRef(null);
  // Modo planificación (Planificador.jsx, estado en planificar.js). Tiene sus propias respuestas y su propio sistema
  // de energía: no toca el sitio, la fecha ni el perfil de la app hasta "Ver sitio"; la duración sí es compartida con la barra.
  const [plan, setPlan] = useState(estadoInicialPlan);
  const cambiarPlan = (cambios) => setPlan((p) => ({ ...p, ...cambios }));
  const [buscando, setBuscando] = useState(false);
  const [progresoPlan, setProgresoPlan] = useState(null); // barra del ranking: { n, estado }
  const busquedas = useRef(0);
  // La duración es una sola: la de la barra. El planificador la usa y la cambia desde su deslizador, y un ranking que
  // ya estaba a la vista se recalcula solo cuando cambia (sin esto quedaría mostrando misiones de otra duración).
  const buscarRef = useRef(null);
  const duracionDelRanking = plan.ranking?.duracionDias;
  useEffect(() => {
    setPlan((p) => (p.duracionDias === duracionDias ? p : { ...p, duracionDias }));
  }, [duracionDias]);
  useEffect(() => {
    if (duracionDelRanking === undefined || duracionDelRanking === duracionDias || !base) return undefined;
    const id = setTimeout(() => buscarRef.current?.(true), ESPERA_RECALCULO_MS);
    return () => clearTimeout(id);
  }, [duracionDias, duracionDelRanking, base]);
  const plegadoAntes = useRef(false); // cómo estaba el panel antes de abrir el modo, para dejarlo igual al cerrar
  const [avisoComparar, setAvisoComparar] = useState(null); // { n, previo } tras "Comparar los 3 mejores"
  const [pulso] = useState(primeraVisita);
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_ASTRONAUTA, "1");
    } catch {
      // Sin almacenamiento no se recuerda la visita.
    }
  }, []);
  useEffect(() => {
    if (!avisoComparar) return undefined;
    const id = setTimeout(() => setAvisoComparar(null), AVISO_MS);
    return () => clearTimeout(id);
  }, [avisoComparar]);

  useEffect(() => {
    Promise.all([cargarSitios(), cargarGeometria()])
      .then(([s, g]) => {
        setBase(s);
        setGeometria(g);
      })
      .catch((e) => setError(e.message));
  }, []);

  // La tecla P abre y cierra el cajón, salvo que se esté escribiendo en un campo.
  useEffect(() => {
    const alTeclado = (evento) => {
      const escribiendo = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");
      if (evento.key.toLowerCase() !== "p" || escribiendo || evento.ctrlKey || evento.metaKey || evento.altKey) return;
      setCajonAbierto((abierto) => !abierto);
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, []);

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

  // La tarjeta desplegada del ranking también pide su grilla: la usa la pregunta "¿hay un punto cerca?".
  const idPlan = plan.abierto && plan.ranking ? plan.abierta : null;
  useEffect(() => {
    if (!idPlan || idPlan in vecindades) return undefined;
    let vigente = true;
    cargarVecindad(idPlan)
      .catch(() => null)
      .then((v) => vigente && setVecindades((x) => ({ ...x, [idPlan]: v })));
    return () => { vigente = false; };
  }, [idPlan, vecindades]);

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

  function cambiarDuracion(dias) {
    setDuracionDias(dias);
    tutorial.cumplir("duracion");
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
  const tocarLuna = config.herramientas.puntos || (origen === "explorar" && hayBackend);
  const deCerca = detalle.metrosPorPixel < 1000; // el globo está acercado: el botón ofrece volver a la Luna entera

  // Si la vista que se estaba mirando deja de estar disponible, se pasa a la primera que sí.
  const ajustarVista = (c) => { if (!c.vistas[vista]) setVista(VISTAS.find((v) => c.vistas[v]) ?? "globo"); };
  // Todo cambio de la cabina pasa por acá: deja de ser un perfil del inicio y queda guardado como personalizado.
  function cambiarConfig(cambio) {
    const siguiente = cambio(config);
    if (siguiente === config) return;
    if (siguiente.herramientas.lineaTiempo && !config.herramientas.lineaTiempo) tutorial.cumplir("lineaTiempo");
    const base = activo === PERSONALIZADO ? origen : activo;
    setConfig(siguiente);
    setActivo(PERSONALIZADO);
    setOrigen(base);
    setPropio({ config: siguiente, origen: base });
    guardarPersonalizado(siguiente, base);
    ajustarVista(siguiente);
  }
  function elegirPerfilCabina(id) {
    const destino = id === PERSONALIZADO ? propio : { config: configDePerfil(id), origen: id };
    if (!destino) return;
    setConfig(destino.config);
    setActivo(id);
    setOrigen(destino.origen);
    ajustarVista(destino.config);
    // El hash acompaña sin recargar la cabina: al actualizar la página se vuelve al perfil de origen.
    window.history.replaceState(null, "", `#${destino.origen}`);
  }
  function restablecerPropio() {
    borrarPersonalizado();
    setPropio(null);
    if (activo === PERSONALIZADO) elegirPerfilCabina(origen);
  }

  function elegirSitio(id) {
    tutorial.cumplir("sitio");
    cancelarPendiente(); // elegir otro sitio mientras se calcula un punto lo deja de lado
    // Salir de un punto de prueba lo descarta: no se acumulan puntos que nadie pidió guardar.
    if (prueba && id !== prueba.sitio.id) setPrueba(null);
    setSitioId(id);
    setPanelAbierto(true);
    setHoraMision(0);
    setEnfoque({ modo: "lejos" }); // al cambiar de sitio se vuelve a ver la Luna entera
  }
  function cambiarLlegada(d, h) {
    tutorial.cumplir("fecha");
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
      tutorial.cumplir("sitio");
      if (!existente) setVerPuntos(true); // guardar o descartar se hace desde "Mis puntos"
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
  // Clic derecho sobre un punto propio en el globo o el mapa: lo quita, esté guardado o sea el de prueba.
  function quitarPropio(id) {
    if (prueba?.sitio.id === id) descartarPrueba();
    else quitarPunto(id);
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
    tutorial.cumplir("fijar");
    if (esPrueba) guardarPrueba(); // un escenario fijado necesita que su punto exista
    setFijados((x) => [...x, { sitioId: sitio.sitio.id, dia, horaLlegada }]);
  }

  // ---------- modo planificación ----------
  const enPlan = plan.abierto && plan.pestana === "planificar";
  const filasPlan = plan.abierto ? plan.ranking?.filas ?? null : null;
  // El astronauta alterna: cerrado, abre la pestaña Planificar (en el ranking si ya hay uno); abierto, en cualquier
  // pestaña, cierra igual que la X. Las respuestas y el ranking se conservan.
  function alternarModoPlan() {
    if (plan.abierto) {
      cerrarPlan();
      return;
    }
    tutorial.cumplir("plan");
    plegadoAntes.current = panelPlegado;
    if (vista !== "globo" && vista !== "mapa" && config.vistas.globo) setVista("globo"); // la Luna sigue a la vista
    setEnfoque({ modo: "lejos" });
    setPanelPlegado(false);
    setPlan((p) => alternarPlan(p, { perfilId, sistema, dia }));
  }
  function cerrarPlan() {
    setPlan((p) => (p.abierto ? alternarPlan(p, { perfilId, sistema, dia }) : p));
    setPanelPlegado(plegadoAntes.current);
    setAvisoComparar(null);
  }
  // Arma el ranking sitio por sitio, cediendo el hilo entre uno y otro: si tarda, la barra de carga puede avanzar.
  // `conservar`: es un recálculo por un cambio de duración; la tarjeta abierta se mantiene si sigue en el ranking.
  async function buscarSitios(conservar = false) {
    const opcion = perfilElegido(plan);
    const opciones = { region: plan.region, dia: plan.dia, tolerancia: plan.tolerancia, duracionH: duracionDias * 24 };
    const precalculados = new Set(base.map((s) => s.sitio.id)); // los puntos propios no entran
    const candidatos = sitiosDeRegion(sitios.filter((s) => precalculados.has(s.sitio.id)), plan.region);
    const n = ++busquedas.current;
    const inicio = performance.now();
    let conBarra = false;
    setBuscando(true);
    setAvisoComparar(null);
    const filas = [];
    for (const s of candidatos) {
      filas.push(evaluarSitio(s, opcion.valores, opciones));
      if (!conBarra && performance.now() - inicio > ESPERA_BARRA_MS) {
        conBarra = true;
        setProgresoPlan({ n, estado: "cargando" });
      }
      await new Promise((seguir) => setTimeout(seguir, 0));
      if (busquedas.current !== n) return; // se pidió otra búsqueda: esta ya no cuenta
    }
    const ordenadas = ordenarRanking(filas);
    setPlan((p) => ({ ...p, paso: "ranking", ranking: { ...opciones, filas: ordenadas, sistema: opcion.valores, perfilId: opcion.id, duracionDias }, abierta: conservar && ordenadas.some((fila) => fila.id === p.abierta) ? p.abierta : ordenadas[0]?.id ?? null, sobre: null, hilo: [] }));
    setBuscando(false);
    if (conBarra) {
      setProgresoPlan({ n, estado: "listo" });
      setTimeout(() => setProgresoPlan((p) => (p?.n === n ? null : p)), 700);
    }
  }
  buscarRef.current = buscarSitios;
  // "Ver sitio": recién acá el plan pasa a la app (sitio, llegada y perfil; la duración ya es una sola) y se vuelve a la pestaña Sitio.
  function verEnApp(fila) {
    const r = plan.ranking;
    elegirSitio(fila.id);
    cambiarLlegada(fila.dia, HORA_LLEGADA);
    aplicarPerfil(perfilParaApp(r)); // también los valores ajustados en el planificador
    setPlan((p) => ({ ...p, pestana: "sitio", sobre: null }));
  }
  function aplicarPerfil({ perfilId: id, sistema: valores }) {
    setPerfilId(id);
    setSistema(valores);
  }
  // "Comparar los 3 mejores": Comparar usa un solo perfil, así que también se aplica el del plan. Si había escenarios fijados se avisa y se puede deshacer todo.
  function compararMejores() {
    const r = plan.ranking;
    const previo = { fijados, perfilId, sistema, vista };
    setFijados(r.filas.slice(0, MEJORES).map((fila) => ({ sitioId: fila.id, dia: fila.dia, horaLlegada: HORA_LLEGADA })));
    aplicarPerfil(perfilParaApp(r));
    setVista("comparar");
    setAvisoComparar(fijados.length > 0 ? { n: fijados.length, previo } : null);
  }
  function deshacerComparar() {
    const { previo } = avisoComparar;
    setFijados(previo.fijados);
    setPerfilId(previo.perfilId);
    setSistema(previo.sistema);
    setVista(previo.vista);
    setAvisoComparar(null);
  }
  // Tocar un sitio en la Luna: en la pestaña Planificar despliega su tarjeta del ranking (no cambia el sitio de la app).
  function elegirEnLuna(id) {
    if (!enPlan) elegirSitio(id);
    else if (plan.paso === "ranking" && filasPlan?.some((fila) => fila.id === id) && id !== plan.abierta) cambiarPlan({ abierta: id, hilo: [] });
  }
  // Lo que el globo y el mapa muestran del plan: qué sitios sobreviven, cuál se resalta y si se mira al polo sur.
  const resaltado = enPlan && plan.paso === "ranking" && filasPlan ? plan.sobre ?? plan.abierta : null;
  // La línea de tiempo en vista previa: el sitio de la tarjeta desplegada (o la que tiene el mouse encima) con el perfil
  // y la duración del plan. Llega a Dock por props; el estado de la app no cambia.
  const filaPrevia = resaltado ? filasPlan.find((fila) => fila.id === resaltado) : null;
  const previa = filaPrevia && (() => {
    const r = plan.ranking;
    const duracionPrevia = r.duracionDias * 24;
    return {
      sitio: filaPrevia.sitio,
      dia: filaPrevia.dia,
      duracionDias: r.duracionDias,
      duracionH: duracionPrevia,
      sistema: r.sistema,
      energia: evaluarEnergia(filaPrevia.sitio, r.sistema, filaPrevia.dia * 24 + HORA_LLEGADA, duracionPrevia),
      marcas: { nombre: nombreCorto(filaPrevia.sitio.sitio), desde: Math.max(0, r.dia - r.tolerancia), hasta: Math.min(364, r.dia + r.tolerancia), elegido: r.dia },
    };
  })();
  const planLuna = !plan.abierto ? null : {
    estados: new Map((filasPlan ?? []).map((fila) => [fila.id, fila.sobrevive])),
    enPestana: enPlan,
    resaltado,
    nombreResaltado: resaltado ? nombreCorto(sitios.find((s) => s.sitio.id === resaltado).sitio) : "",
    polo: enPlan && (plan.paso === "ranking" && plan.ranking ? plan.ranking.region : plan.region) === "polo",
  };

  const fijadosVista = fijados
    .map((f, k) => {
      const s = sitios.find((x) => x.sitio.id === f.sitioId);
      const f0 = f.dia * 24 + f.horaLlegada;
      return s ? { f, k, s, f0, r: evaluarMision(s, f0, duracionH), en: evaluarEnergia(s, sistema, f0, duracionH, { serie: false }) } : null;
    })
    .filter(Boolean);
  // El de más margen: el que termina con más batería en su peor momento.
  const mejorFijado = fijadosVista.length > 1 ? fijadosVista.reduce((a, b) => (b.en.minimoPct > a.en.minimoPct ? b : a)) : null;

  const propios = new Set([...guardados, ...(prueba ? [prueba] : [])].map((s) => s.sitio.id));
  const hayPanel = (panelAbierto && config.panel) || plan.abierto;
  // En pantalla angosta todo se apila y no hay asas: nada queda plegado.
  const plegarPanel = panelPlegado && !angosto;
  const plegarDock = dockPlegado && !angosto;
  const ordenDe = (bloque) => ({ order: config.orden.indexOf(bloque) + 1 });
  const cifras = {
    luz: { rotulo: t("panel.luzSolar"), valor: num(m.luzPct), unidad: "%" },
    contacto: { rotulo: t("panel.contacto"), valor: num(m.senalPct), unidad: "%" },
    energia: { rotulo: t("panel.energia"), valor: num(m.energiaSeguidorPct), unidad: "%", ayuda: t("panel.energiaAyuda") },
    noche: { rotulo: t("ajustes.cifras.noche"), valor: num(m.nocheH), unidad: "h" },
    autonomia: { rotulo: t("ajustes.cifras.autonomia"), valor: Number.isFinite(e.autonomiaH) ? num(Math.round(e.autonomiaH)) : "—", unidad: Number.isFinite(e.autonomiaH) ? "h" : "" },
    minimo: { rotulo: t("ajustes.cifras.minimo"), valor: num(e.minimoPct), unidad: "%" },
  };

  return (
    <div className={`cabina en-${vista}${hayPanel ? "" : " sin-panel"}${config.herramientas.lineaTiempo ? "" : " sin-dock"}${cajonAbierto ? " con-cajon" : ""}${hayPanel && plegarPanel ? " panel-plegado" : ""}${plegarDock ? " dock-plegado" : ""}${plan.abierto ? " con-plan" : ""}${pasoTutorial?.id === "agregar" ? " tutorial-cajon" : ""}`}>
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
            onElegir={elegirEnLuna}
            onPunto={tocarLuna && !enPlan ? puntoEnGlobo : null}
            propios={propios}
            onQuitar={quitarPropio}
            pendiente={pendiente?.estado === "cargando" ? pendiente : null}
            plan={planLuna}
          />
        </Suspense>
      </div>
      <div className="resplandor" aria-hidden="true" />

      <header className="barra">
        <a className="marca vidrio con-ayuda" href="#" aria-label={t("ajustes.inicio")} data-ayuda={t("ajustes.inicio")}>
          <img src={`${import.meta.env.BASE_URL}marca/moonset-imagotipo.png`} alt="MoonSet" width="509" height="184" />
        </a>
        <button type="button" className={`astronauta vidrio con-ayuda${pulso ? " pulso" : ""}`} data-tutorial="astronauta" aria-pressed={plan.abierto} aria-label={t("plan.boton")} data-ayuda={t(plan.abierto ? "plan.cerrar" : "plan.boton")} onClick={alternarModoPlan}>
          <IconoAstronauta />
        </button>
        {/* La duración se ve siempre, en cualquier perfil: sin ella "sobrevive" no dice a qué. */}
        <div className="parametros vidrio" data-tutorial="duracion">
          <label>{t("parametros.misionDe")}<input type="number" min="1" max="30" value={duracionDias} onChange={(e) => cambiarDuracion(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />{t("parametros.dias")}</label>
        </div>
        {config.herramientas.parametros && <Sistema sistema={sistema} perfilId={perfilId} alElegirPerfil={elegirPerfil} alCambiar={cambiarSistema} margenCom={margenCom} alCambiarMargen={setMargenCom} />}
        {config.herramientas.puntos && <div className="puntos" data-tutorial="puntos">
          <button type="button" className="vidrio" aria-expanded={verPuntos} onClick={() => setVerPuntos((v) => !v)}>
            {t("puntos.titulo")}{guardados.length > 0 ? ` · ${guardados.length}` : ""}{prueba && <i className="punto-aviso" aria-hidden="true" />}
          </button>
          {verPuntos && (
            <div className="puntos-lista vidrio">
              <div className="puntos-cabeza">
                <b>{t("puntos.titulo")}</b>
                {guardados.length > 0 && <button type="button" onClick={quitarTodos}>{t("puntos.quitarTodos")}</button>}
              </div>
              {/* Una fila por punto: el de prueba va primero, con su botón para guardarlo. */}
              {prueba && (
                <div className="punto-fila prueba" title={t("puntos.sinGuardar")}>
                  <button type="button" className="enlace" onClick={() => elegirSitio(prueba.sitio.id)}>{coordenadas(prueba.sitio)}</button>
                  <button type="button" className="primario" onClick={guardarPrueba}>{t("puntos.guardar")}</button>
                  <button type="button" className="punto-quitar" aria-label={t("panel.descartar")} title={t("panel.descartar")} onClick={descartarPrueba}>{EQUIS}</button>
                </div>
              )}
              {guardados.map((s) => (
                <div className="punto-fila" key={s.sitio.id}>
                  <button type="button" className="enlace" onClick={() => elegirSitio(s.sitio.id)}>{coordenadas(s.sitio)}</button>
                  <button type="button" className="punto-quitar" aria-label={t("puntos.quitar")} title={t("puntos.quitar")} onClick={() => quitarPunto(s.sitio.id)}>{EQUIS}</button>
                </div>
              ))}
              {guardados.length === 0 && !prueba && <p className="tenue puntos-nota">{t("puntos.vacio")}</p>}
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
              {(guardados.length > 0 || prueba) && <p className="tenue puntos-nota">{t("puntos.clicDerecho")}</p>}
              {!hayBackend && <p className="tenue puntos-nota">{t("puntos.sinBackend")}</p>}
              {estadoCoord && <p className="error" role="alert">{estadoCoord}</p>}
            </div>
          )}
        </div>}
        {/* Las vistas van siempre al final, a la derecha: sumar herramientas no las corre de lugar. */}
        {VISTAS.some((v) => config.vistas[v]) && (
          <nav className="vistas vidrio" aria-label={t("vistas.aria")} data-tutorial="vistas">
            {VISTAS.filter((v) => config.vistas[v]).map((v) => {
              // aria-disabled en vez de disabled: el botón sigue mostrando el tooltip y se puede enfocar.
              const bloqueada = v === "alrededores" && sinVecindad;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  aria-disabled={bloqueada || undefined}
                  title={bloqueada ? motivoSinVecindad : undefined}
                  data-tutorial={v === "horizonte" ? "horizonte" : undefined}
                  onClick={() => {
                    if (bloqueada) return;
                    setVista(v);
                    tutorial.cumplir("vista");
                    if (v === "horizonte") tutorial.cumplir("horizonte");
                  }}
                >
                  {t(`vistas.${v}`)}{v === "comparar" && fijados.length > 0 ? ` · ${fijados.length}` : ""}
                </button>
              );
            })}
          </nav>
        )}
        <button type="button" className="ayuda-boton con-ayuda a-derecha" data-tutorial="ayuda" aria-pressed={pasoTutorial !== null} aria-label={t("tutorial.titulo")} data-ayuda={pasoTutorial ? undefined : t("tutorial.titulo")} onClick={() => (pasoTutorial ? tutorial.salir() : tutorial.empezar())}>?</button>
        <button ref={ajustesRef} type="button" data-tutorial="ajustes" className="ajustes con-ayuda a-derecha" aria-expanded={cajonAbierto} aria-controls="cajon-ajustes" aria-label={t("ajustes.abrir")} data-ayuda={cajonAbierto ? undefined : t("ajustes.abrir")} onClick={() => setCajonAbierto((abierto) => !abierto)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>
        </button>
      </header>

      {hayPanel && !plegarPanel && <aside className={`panel vidrio ${enPlan ? "en-plan" : pendiente ? "cargando" : e.sobrevive ? "si" : "no"}${plan.abierto ? " con-plan" : ""}`} aria-live={enPlan ? undefined : "polite"} aria-busy={(enPlan ? buscando : pendiente?.estado === "cargando") || undefined}>
        {enPlan ? <BarraProgreso key={`plan-${progresoPlan?.n}`} estado={progresoPlan?.estado ?? null} /> : <BarraProgreso key={progreso?.n} estado={progreso?.estado ?? null} />}
        {plan.abierto && <PestanasPlan pestana={plan.pestana} alElegir={(pestana) => cambiarPlan({ pestana, sobre: null })} alCerrar={cerrarPlan} />}
        {enPlan ? (
          <Planificador
            estado={plan}
            duracionDias={duracionDias}
            alCambiarDuracion={cambiarDuracion}
            alCambiar={cambiarPlan}
            alAjustar={(cambios) => setPlan((p) => ajustarSistema(p, cambios))}
            totalSitios={base.length}
            t0={base[0].t0}
            buscando={buscando}
            alBuscar={buscarSitios}
            alVer={verEnApp}
            alComparar={config.vistas.comparar ? compararMejores : null}
            aviso={avisoComparar}
            alDeshacer={deshacerComparar}
            vecindades={vecindades}
            perfilVista={origen}
          />
        ) : pendiente ? (
          <PanelPendiente pendiente={pendiente} alReintentar={() => probarPunto(pendiente.lat, pendiente.lon)} alVolver={cancelarPendiente} />
        ) : (<>
        <div className="panel-sitio">
          <select value={sitio.sitio.id} onChange={(e) => elegirSitio(e.target.value)} aria-label={t("panel.sitioAria")}>
            {sitios.map((s) => <option key={s.sitio.id} value={s.sitio.id}>{nombreCorto(s.sitio)}</option>)}
          </select>
          <p className="tenue">{coordenadas(sitio.sitio)} · {sitio.horizonte.fuente === "esfera" ? t("panel.sinRelieve") : t("panel.conRelieve")}</p>
        </div>

        <div className="panel-veredicto" data-tutorial="respuesta">
          <p className="chip"><i aria-hidden="true" />{!e.sobrevive ? t("energia.chipFalla", { t: duracion(e.horaFalla + 1) }) : m.nocheH === 0 ? t("panel.luzToda") : t("energia.chipNoche", { t: duracion(m.nocheH) })}</p>
          <h1>{e.sobrevive ? t("panel.sobrevive") : t("panel.noSobrevive")}</h1>
        </div>
        <Explicaciones frases={explicar({ m, e, sistema }, sitio, origen)} />

        {hayAvisos && (
          <ul className="avisos">
            {av.potenciaNominal && <li>{t("energia.avisoNominal", { max: num(av.maxDescargaKW, 2), nominal: num(av.potenciaNominalKW, 2) })}</li>}
            {av.ciclos && <li>{t("energia.avisoCiclos", { usados: num(e.ciclos, 1), vida: num(av.vidaCiclos) })}</li>}
            {av.nochesSinCalefaccion && <li>{t("energia.avisoCalefaccion")}</li>}
          </ul>
        )}

        {config.bloques.medidor && <div className="panel-medidor" style={ordenDe("medidor")}>
          <p><span>{t("energia.minima")} <b>{num(e.minimoPct)} %</b></span><span>{t("energia.reserva")} <b>{num(sistema.reservaPct)} %</b></span></p>
          <BarraCarga minimoPct={e.minimoPct} reservaPct={sistema.reservaPct} sobrevive={e.sobrevive} />
        </div>}
        {config.bloques.medidor && <p className="panel-accion" style={ordenDe("medidor")}>{fraseAccion}</p>}

        {config.bloques.cifras && config.cifras.length > 0 && (
          <dl className="panel-cifras" style={ordenDe("cifras")}>
            {config.cifras.map((c) => (
              <div key={c} title={cifras[c].ayuda}><dt>{cifras[c].rotulo}</dt><dd>{cifras[c].valor}{cifras[c].unidad && <small> {cifras[c].unidad}</small>}</dd></div>
            ))}
          </dl>
        )}

        {config.bloques.detalle && <details className="panel-detalle" style={ordenDe("detalle")}>
          <summary>{t("energia.detalle")}</summary>
          <dl>
            <div><dt>{t("energia.generada")}</dt><dd>{num(e.generadaKWh, 1)} kWh</dd></div>
            <div><dt>{t("energia.consumida")}</dt><dd>{num(e.consumidaKWh, 1)} kWh</dd></div>
            <div><dt>{t("energia.masa")}</dt><dd>{num(e.masaKg, 1)} kg</dd></div>
            <div><dt>{t("energia.autonomia")}</dt><dd>{Number.isFinite(e.autonomiaH) ? duracion(Math.round(e.autonomiaH)) : t("energia.sinConsumo")}</dd></div>
            <div><dt>{t("energia.bajoReserva")}</dt><dd>{e.horasBajoReserva} h</dd></div>
            <div><dt>{t("energia.nocheLarga")}</dt><dd>{m.nocheH} h</dd></div>
          </dl>
        </details>}

        {config.bloques.opciones && <div className="panel-opciones" style={ordenDe("opciones")}>
          {e.sobrevive ? (
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
        </div>}

        {config.bloques.sello && <div className="panel-bloque" style={ordenDe("sello")}><SelloValidacion /></div>}
        {config.bloques.enlaces && (
          <div className="panel-bloque" style={ordenDe("enlaces")}>
            <EnlacesNasa lat={sitio.sitio.lat} lon={sitio.sitio.lon} inicioMs={sitio.t0 + i0 * HORA_MS} finMs={sitio.t0 + (i0 + duracionH) * HORA_MS} conHorizons={origen === "planificar"} />
          </div>
        )}

        {/* Fijar y exportar comparten fila para que el panel no necesite scroll; van siempre al final. */}
        {(config.acciones.fijar || config.acciones.exportar) && (
          <div className="panel-pie">
            {config.acciones.fijar && (
              <button type="button" className="primario fijar" data-tutorial="fijar" disabled={yaFijado || fijados.length >= MAX_FIJADOS} onClick={fijar}>
                {yaFijado ? t("panel.yaEnComparar") : fijados.length >= MAX_FIJADOS ? t("panel.maximo", { n: MAX_FIJADOS }) : t("panel.fijar")}
              </button>
            )}
            {config.acciones.exportar && <button type="button" className="exportar" onClick={exportarCsv} title={t("panel.exportarAyuda")}>{t("panel.exportar")}</button>}
          </div>
        )}
        {config.herramientas.puntos && esGuardado && <button type="button" className="quitar-punto" onClick={() => quitarPunto(sitio.sitio.id)}>{t("panel.quitarPunto")}</button>}
        </>)}
      </aside>}
      {hayPanel && <Asa lado="panel" plegada={plegarPanel} etiqueta={t(plegarPanel ? "ajustes.plegar.abrirPanel" : "ajustes.plegar.panel")} alAlternar={() => setPanelPlegado((plegado) => !plegado)} />}

      <main className="centro" data-tutorial="luna">
        {vista === "globo" && config.pistaGlobo && (
          <div className="pista-globo vidrio">
            <p>{!panelAbierto ? t("globo.pistaExplorar") : hayBackend ? t("globo.pistaBackend") : t("globo.pistaSinBackend")}</p>
            <div className="pista-acciones">
              <button
                type="button"
                className="redondo-chico con-ayuda a-derecha"
                aria-label={deCerca ? t("globo.alejar") : t("globo.acercar")}
                data-ayuda={`${deCerca ? t("globo.alejar") : t("globo.acercar")} · ${t("globo.detalle", { capa: CAPAS[detalle.capa].nombre, resolucion: f.longitud(detalle.metrosPorPixel) })}`}
                onClick={() => setEnfoque({ modo: deCerca ? "lejos" : "cerca" })}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d={deCerca ? "M8 10.5h5M15 15l5 5" : "M8 10.5h5M10.5 8v5M15 15l5 5"} /></svg>
              </button>
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
              onElegir={elegirEnLuna}
              onPunto={tocarLuna && !enPlan ? puntoEnGlobo : null}
              propios={propios}
              onQuitar={quitarPropio}
              plan={planLuna}
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
                        setVista(VISTAS.find((v) => config.vistas[v]) ?? "globo");
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

      {config.herramientas.lineaTiempo && !plegarDock && (previa ? (
        <Dock
          previa={previa.marcas}
          sitio={previa.sitio}
          dia={previa.dia}
          horaLlegada={HORA_LLEGADA}
          alCambiarLlegada={() => {}}
          duracionDias={previa.duracionDias}
          duracionH={previa.duracionH}
          sistema={previa.sistema}
          soc={previa.energia.soc}
          sobrevive={previa.energia.sobrevive}
          horaMision={0}
          setHoraMision={setHoraMision}
        />
      ) : (
        <Dock
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
        />
      ))}
      {config.herramientas.lineaTiempo && <Asa lado="dock" plegada={plegarDock} etiqueta={t(plegarDock ? "ajustes.plegar.abrirDock" : "ajustes.plegar.dock")} alAlternar={() => setDockPlegado((plegado) => !plegado)} />}

      {cajonAbierto && (
        <Cajon
          config={config}
          alCambiar={cambiarConfig}
          activo={activo}
          hayPropio={propio !== null}
          alElegirPerfil={elegirPerfilCabina}
          alRestablecer={restablecerPropio}
          alCerrar={() => { setCajonAbierto(false); ajustesRef.current?.focus(); }}
          duracionDias={duracionDias}
          alCambiarDuracion={cambiarDuracion}
          margenCom={margenCom}
          alCambiarMargen={setMargenCom}
        />
      )}

      <Tutorial tutorial={tutorial} />

      <p className="creditos">{t("app.creditos")}</p>
    </div>
  );
}
