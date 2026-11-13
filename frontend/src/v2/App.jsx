import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { cargarCoordenadas, cargarGeometria, cargarSitios, cargarVecindad, hayBackend } from "./datos";
import { coordenadas, evaluarMision, fechaCorta, fechaLarga, fechaViableCercana, num, porDia, tramos } from "./calculo";
import Dock from "./Dock";
import VistaHorizonte from "./VistaHorizonte";
import Vecindad from "./Vecindad";
import MapaPolar from "./MapaPolar";
import "./estilos.css";

const Globo = lazy(() => import("./Globo"));
const DIA_MS = 86_400_000;
const MAX_FIJADOS = 4;
const SITIO_INICIAL = "connecting-ridge";
const VISTAS = [
  { id: "globo", nombre: "Globo" },
  { id: "mapa", nombre: "Mapa" },
  { id: "horizonte", nombre: "Horizonte" },
  { id: "alrededores", nombre: "Alrededores" },
  { id: "comparar", nombre: "Comparar" },
];
const corto = (nombre) => nombre.split(" — ")[0];
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

// Barra que compara la noche más larga con la batería. La escala es compartida para poder comparar.
function Medidor({ nocheH, autonomiaH, tope }) {
  return (
    <div className="medidor" role="img" aria-label={`Noche más larga de ${nocheH} horas, batería para ${autonomiaH} horas`}>
      <i style={{ transform: `scaleX(${Math.min(1, nocheH / tope)})`, background: nocheH <= autonomiaH ? "var(--bien)" : "var(--mal)" }} />
      <b style={{ left: `${Math.min(100, (autonomiaH / tope) * 100)}%` }} />
    </div>
  );
}

export default function App() {
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
  const [autonomiaH, setAutonomiaH] = useState(100);
  const [horaMision, setHoraMision] = useState(0);
  const [fijados, setFijados] = useState([]); // [{ sitioId, dia, horaLlegada }]
  const [vecindades, setVecindades] = useState({}); // id -> grilla | null
  const [verPuntos, setVerPuntos] = useState(false);
  const [coord, setCoord] = useState({ lat: "-88.80", lon: "125.00" });
  const [estadoCoord, setEstadoCoord] = useState(""); // "", "cargando" o un mensaje de error

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
    () => (sitios ? sitios.map((s) => ({ s, m: evaluarMision(s, i0, duracionH, autonomiaH) })) : []),
    [sitios, i0, duracionH, autonomiaH]
  );

  if (error) {
    return (
      <main className="aviso">
        <p>No se pudieron cargar los datos: {error}</p>
        <p className="tenue">Corré backend/scripts/precalcular_anual.py y reiniciá el servidor del frontend.</p>
      </main>
    );
  }
  if (!sitio || !geometria) return <main className="aviso tenue">Cargando efemérides y relieve…</main>;

  const m = evaluados.find((r) => r.s === sitio).m;
  const viables = new Set(evaluados.filter((r) => r.m.viable).map((r) => r.s.sitio.id));
  const hora = Math.min(horaMision, duracionH - 1);
  const iAhora = i0 + hora;
  const iGeo = Math.min(geometria.sol_lat.length - 1, iAhora);
  const esPrueba = prueba !== null && sitio === prueba;
  const esGuardado = guardados.includes(sitio);
  const diaViable = m.viable ? null : fechaViableCercana(sitio, dia, duracionH, autonomiaH, horaLlegada);
  // Entre los sitios que sí sirven, el que más contacto con la Tierra tiene (y a igual contacto, más luz).
  const mejorOtro = m.viable
    ? null
    : evaluados.filter((r) => r.m.viable && r.s !== sitio).sort((a, b) => b.m.senalPct - a.m.senalPct || b.m.luzPct - a.m.luzPct)[0];
  const vecindad = vecindades[sitio.sitio.id];
  const yaFijado = fijados.some((f) => f.sitioId === sitio.sitio.id && f.dia === dia && f.horaLlegada === horaLlegada);
  const tope = Math.max(200, autonomiaH * 2);

  function elegirSitio(id) {
    // Salir de un punto de prueba lo descarta: no se acumulan puntos que nadie pidió guardar.
    if (prueba && id !== prueba.sitio.id) setPrueba(null);
    setSitioId(id);
    setHoraMision(0);
  }
  function cambiarLlegada(d, h) {
    setDia(d);
    setHoraLlegada(h);
    setHoraMision(0);
  }

  async function probarPunto(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
      setEstadoCoord("Revisá los valores: la latitud va de −90 a 90.");
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
      setEstadoCoord(`No se pudo calcular: ${e.message}`);
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
  function fijar() {
    if (esPrueba) guardarPrueba(); // un escenario fijado necesita que su punto exista
    setFijados((x) => [...x, { sitioId: sitio.sitio.id, dia, horaLlegada }]);
  }

  const fijadosVista = fijados
    .map((f, k) => {
      const s = sitios.find((x) => x.sitio.id === f.sitioId);
      const f0 = f.dia * 24 + f.horaLlegada;
      return s ? { f, k, s, f0, r: evaluarMision(s, f0, duracionH, autonomiaH) } : null;
    })
    .filter(Boolean);
  const mejorFijado = fijadosVista.length > 1 ? fijadosVista.reduce((a, b) => (b.r.nocheH < a.r.nocheH ? b : a)) : null;

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
            onElegir={elegirSitio}
            onPunto={puntoEnGlobo}
          />
        </Suspense>
      </div>
      <div className="resplandor" aria-hidden="true" />

      <header className="barra">
        <div className="marca vidrio"><i aria-hidden="true" />MoonSet</div>
        <nav className="vistas vidrio" aria-label="Vistas">
          {VISTAS.map((v) => (
            <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => setVista(v.id)}>
              {v.nombre}{v.id === "comparar" && fijados.length > 0 ? ` · ${fijados.length}` : ""}
            </button>
          ))}
        </nav>
        <div className="parametros vidrio">
          <label>Misión de<input type="number" min="1" max="30" value={duracionDias} onChange={(e) => setDuracionDias(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />días</label>
          <label>Batería<input type="number" min="0" max="720" step="10" value={autonomiaH} onChange={(e) => setAutonomiaH(Math.max(0, Math.min(720, Number(e.target.value) || 0)))} />h</label>
        </div>
        <div className="puntos">
          <button type="button" className="vidrio" aria-expanded={verPuntos} onClick={() => setVerPuntos((v) => !v)}>
            Mis puntos{guardados.length > 0 ? ` · ${guardados.length}` : ""}
          </button>
          {verPuntos && (
            <div className="puntos-lista vidrio">
              <div className="puntos-cabeza">
                <b>Mis puntos</b>
                <button type="button" disabled={guardados.length === 0} onClick={quitarTodos}>Quitar todos</button>
              </div>
              {guardados.length === 0 && <p className="tenue">Todavía no guardaste ninguno. Tocá la Luna para probar un punto y guardalo si te sirve.</p>}
              {guardados.map((s) => (
                <div className="punto-fila" key={s.sitio.id}>
                  <button type="button" className="enlace" onClick={() => elegirSitio(s.sitio.id)}>{coordenadas(s.sitio)}</button>
                  <button type="button" onClick={() => quitarPunto(s.sitio.id)}>Quitar</button>
                </div>
              ))}
              <form
                className="puntos-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  probarPunto(Number(coord.lat), Number(coord.lon));
                }}
              >
                <label>Latitud<input type="number" step="any" min="-90" max="90" value={coord.lat} onChange={(e) => setCoord({ ...coord, lat: e.target.value })} /></label>
                <label>Longitud este<input type="number" step="any" min="-180" max="360" value={coord.lon} onChange={(e) => setCoord({ ...coord, lon: e.target.value })} /></label>
                <button type="submit" className="primario" disabled={!hayBackend || estadoCoord === "cargando"}>{estadoCoord === "cargando" ? "Calculando…" : "Probar"}</button>
              </form>
              {!hayBackend && <p className="tenue">Probar puntos propios necesita el servidor de cálculo encendido.</p>}
              {estadoCoord && estadoCoord !== "cargando" && <p className="error" role="alert">{estadoCoord}</p>}
            </div>
          )}
        </div>
      </header>

      <aside className={`panel vidrio ${m.viable ? "si" : "no"}`} aria-live="polite">
        <div className="panel-sitio">
          <select value={sitio.sitio.id} onChange={(e) => elegirSitio(e.target.value)} aria-label="Sitio de alunizaje">
            {sitios.map((s) => <option key={s.sitio.id} value={s.sitio.id}>{corto(s.sitio.nombre)}</option>)}
          </select>
          <p className="tenue">{coordenadas(sitio.sitio)} · {sitio.horizonte.fuente === "esfera" ? "sin relieve" : "con relieve real"}</p>
        </div>

        <div className="panel-veredicto">
          <p className="chip"><i aria-hidden="true" />{m.nocheH === 0 ? "Hay luz toda la misión" : m.viable ? `Le sobran ${autonomiaH - m.nocheH} h de batería` : `Le faltan ${m.faltanH} h de batería`}</p>
          <h1>{m.viable ? "Sobrevive" : "No sobrevive"}</h1>
        </div>

        <div className="panel-medidor">
          <p><span>Noche más larga <b>{m.nocheH} h</b></span><span>Batería <b>{autonomiaH} h</b></span></p>
          <Medidor nocheH={m.nocheH} autonomiaH={autonomiaH} tope={tope} />
        </div>

        <dl className="panel-cifras">
          <div><dt>Luz solar</dt><dd>{num(m.luzPct)}<small> %</small></dd></div>
          <div><dt>Contacto</dt><dd>{num(m.senalPct)}<small> %</small></dd></div>
          <div title="Energía que recibe un panel que sigue al Sol, respecto del máximo posible"><dt>Energía</dt><dd>{num(m.energiaSeguidorPct)}<small> %</small></dd></div>
        </dl>

        <div className="panel-opciones">
          {esPrueba ? (
            <>
              <p className="rotulo">Punto de prueba, sin guardar</p>
              <p className="nota">El próximo toque en la Luna lo reemplaza. Guardalo si querés conservarlo.</p>
              <div className="dupla">
                <button type="button" className="primario" onClick={guardarPrueba}>Guardar punto</button>
                <button type="button" onClick={descartarPrueba}>Descartar</button>
              </div>
            </>
          ) : m.viable ? (
            <>
              <p className="rotulo">Qué se puede hacer</p>
              <p className="nota vacio">No hace falta cambiar nada: con esta fecha y esta hora la misión llega al final.</p>
            </>
          ) : (
            <>
              <p className="rotulo">Qué se puede hacer</p>
              {diaViable !== null && (
                <button type="button" className="opcion" onClick={() => cambiarLlegada(diaViable, horaLlegada)}>
                  <span><b>Esperar al {fechaLarga(sitio.t0 + diaViable * DIA_MS)}</b><small>{diaViable - dia} {diaViable - dia === 1 ? "día" : "días"} más · noche de {porDia(sitio, duracionH, horaLlegada).nocheH[diaViable]} h</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              )}
              {mejorOtro && (
                <button type="button" className="opcion" onClick={() => elegirSitio(mejorOtro.s.sitio.id)}>
                  <span><b>Ir a {corto(mejorOtro.s.sitio.nombre)}</b><small>noche de {mejorOtro.m.nocheH} h · {mejorOtro.m.senalPct === 0 ? "sin contacto" : `${num(mejorOtro.m.senalPct)} % de contacto`}</small></span>
                  <i aria-hidden="true">→</i>
                </button>
              )}
              {diaViable === null && !mejorOtro && <p className="nota vacio">Ninguna alternativa con estos parámetros. Probá con más batería o una misión más corta.</p>}
            </>
          )}
        </div>

        <button type="button" className="primario fijar" disabled={yaFijado || fijados.length >= MAX_FIJADOS} onClick={fijar}>
          {yaFijado ? "Ya está en Comparar" : fijados.length >= MAX_FIJADOS ? `Máximo de ${MAX_FIJADOS} escenarios` : "Fijar para comparar"}
        </button>
        {esGuardado && <button type="button" className="quitar-punto" onClick={() => quitarPunto(sitio.sitio.id)}>Quitar este punto de mis puntos</button>}
      </aside>

      <main className="centro">
        {vista === "globo" && (
          <p className="pista-globo vidrio">
            {hayBackend ? "Arrastrá para girar. Tocá la Luna para probar un punto." : "Arrastrá para girar. Los puntos amarillos sirven en la fecha elegida; los grises, no."}
          </p>
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
              autonomiaH={autonomiaH}
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
              <Vecindad sitio={sitio} vecindad={vecindad} i0={i0} duracionH={duracionH} autonomiaH={autonomiaH} />
            ) : (
              <p className="tarjeta-vacia">El mapa de alrededores está calculado para los sitios de la lista al sur de 85° S: Connecting Ridge, Borde de Shackleton, Borde de de Gerlache y Macizo Malapert.</p>
            )}
          </section>
        )}

        {vista === "comparar" && (
          <section className="tarjeta vidrio comparar">
            {fijadosVista.length === 0 ? (
              <p className="tarjeta-vacia">Todavía no fijaste escenarios. Elegí un sitio y una fecha y tocá "Fijar para comparar"; podés fijar hasta {MAX_FIJADOS}.</p>
            ) : (
              <div className="columnas" style={{ "--n": fijadosVista.length }}>
                {fijadosVista.map(({ f, k, s, f0, r }) => (
                  <article key={`${f.sitioId}/${f.dia}/${f.horaLlegada}`} className={`columna ${r.viable ? "si" : "no"}${mejorFijado && mejorFijado.k === k ? " mejor" : ""}`}>
                    <header>
                      <div>
                        <p className="rotulo">{mejorFijado && mejorFijado.k === k ? "Noche más corta" : `Escenario ${"ABCD"[k]}`}</p>
                        <h3>{corto(s.sitio.nombre)}</h3>
                        <p className="tenue">{fechaCorta(s.t0 + f.dia * DIA_MS)} · {dos(f.horaLlegada)}:00 UTC</p>
                      </div>
                      <button type="button" className="equis" aria-label="Quitar este escenario" onClick={() => setFijados((x) => x.filter((_, j) => j !== k))}>
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" /></svg>
                      </button>
                    </header>
                    <p className="veredicto-chico">{r.viable ? "Sobrevive" : "No sobrevive"}</p>
                    <p className="tenue margen">{r.viable ? `Le sobran ${autonomiaH - r.nocheH} h` : `Le faltan ${r.faltanH} h`}</p>
                    <p className="par"><span>Noche más larga</span><b>{r.nocheH} h</b></p>
                    <Medidor nocheH={r.nocheH} autonomiaH={autonomiaH} tope={Math.max(tope, ...fijadosVista.map((x) => x.r.nocheH))} />
                    <p className="par"><span>Luz solar</span><b>{num(r.luzPct)} %</b></p>
                    <p className="par"><span>Contacto</span><b>{num(r.senalPct)} %</b></p>
                    <p className="par"><span>Energía</span><b>{num(r.energiaSeguidorPct)} %</b></p>
                    <p className="par"><span>Sol al llegar</span><b>{r.solVisible ? "visible" : "oculto"}{r.hCambioSol !== null && `, ${r.hCambioSol} h`}</b></p>
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
                      Ver este escenario
                    </button>
                  </article>
                ))}
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
        autonomiaH={autonomiaH}
        horaMision={hora}
        setHoraMision={setHoraMision}
      />

      <p className="creditos">Relieve LOLA 80 m (al sur de 80° S) · mapa en estereográfica polar · efemérides JPL DE421 · imagen NASA SVS/LROC · <a href="?clasico">versión anterior</a></p>
    </div>
  );
}
