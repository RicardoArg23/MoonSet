import { useEffect, useRef, useState } from "react";
import { evaluarCoordenadas, evaluarSitio, listarSitios, modoApi } from "./api/datos";
import { formatoFecha } from "./utils/tiempo";
import SelectorSitio from "./componentes/SelectorSitio";
import VistaPanoramica from "./componentes/VistaPanoramica";
import PanelEstado from "./componentes/PanelEstado";
import LineaDeTiempo from "./componentes/LineaDeTiempo";
import Comparacion from "./componentes/Comparacion";

const PARAMETROS_INICIALES = { inicio: "2027-01-01T00:00:00Z", dias: 30, paso_horas: 1, altura_m: 2 };

export default function App() {
  const [sitios, setSitios] = useState([]);
  const [resultados, setResultados] = useState([]); // [{ clave, datos }] en orden de evaluación
  const [actual, setActual] = useState(null); // clave del resultado mostrado
  const [indice, setIndice] = useState(0);
  const [planificador, setPlanificador] = useState(false);
  const [parametros, setParametros] = useState(PARAMETROS_INICIALES);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [animando, setAnimando] = useState(false);
  const timer = useRef(null);

  const datos = resultados.find((r) => r.clave === actual)?.datos;

  async function cargar(clave, promesa, mostrar = true) {
    setCargando(true);
    setError("");
    try {
      const d = await promesa;
      setResultados((prev) => [...prev.filter((r) => r.clave !== clave), { clave, datos: d }]);
      if (mostrar) setActual(clave);
      setIndice((i) => Math.min(i, d.serie.tiempos.length - 1));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  const elegirSitio = (id) => {
    if (resultados.some((r) => r.clave === id)) return setActual(id);
    cargar(id, evaluarSitio(id, parametros));
  };

  const evaluarLibre = (lat, lon) =>
    cargar(`coord:${lat},${lon}`, evaluarCoordenadas({ lat, lon, ...parametros }));

  const quitar = (clave) => {
    setResultados((prev) => prev.filter((r) => r.clave !== clave));
    if (clave === actual) setActual(resultados.find((r) => r.clave !== clave)?.clave ?? null);
  };

  // Al cambiar fechas o altura (solo con backend), se recalculan los sitios ya cargados
  const aplicarParametros = (nuevos) => {
    setParametros(nuevos);
    resultados.forEach(({ clave, datos: d }) => {
      const p = clave.startsWith("coord:")
        ? evaluarCoordenadas({ lat: d.sitio.lat, lon: d.sitio.lon, ...nuevos })
        : evaluarSitio(clave, nuevos);
      cargar(clave, p, clave === actual);
    });
  };

  useEffect(() => {
    listarSitios()
      .then((lista) => {
        setSitios(lista);
        const inicial = lista.find((s) => s.id === "connecting-ridge") ?? lista[0];
        if (inicial) cargar(inicial.id, evaluarSitio(inicial.id, PARAMETROS_INICIALES));
      })
      .catch((e) => setError(`No se pudo cargar la lista de sitios: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!animando || !datos) return;
    const n = datos.serie.tiempos.length;
    timer.current = setInterval(() => setIndice((i) => (i + 1) % n), 60);
    return () => clearInterval(timer.current);
  }, [animando, datos]);

  return (
    <div className={`app${planificador ? " planificador" : ""}`}>
      <header>
        <div>
          <h1>MoonSet</h1>
          <p className="subtitulo">Cuándo se ponen el Sol y la Tierra, en cualquier lugar de la Luna.</p>
        </div>
        <div className="segmentado" role="group" aria-label="Modo">
          <button aria-pressed={!planificador} onClick={() => setPlanificador(false)}>Explorador</button>
          <button aria-pressed={planificador} onClick={() => setPlanificador(true)}>Planificador</button>
        </div>
      </header>

      <div className="layout">
        <SelectorSitio
          sitios={sitios}
          seleccionado={actual}
          alElegir={elegirSitio}
          alEvaluarCoordenadas={evaluarLibre}
          modoApi={modoApi}
        />

        <main>
          {error && <p className="error" role="alert">{error}</p>}
          {cargando && <p className="cargando">Calculando…</p>}

          {modoApi && planificador && (
            <Parametros valores={parametros} alAplicar={aplicarParametros} />
          )}

          {datos ? (
            <>
              <h2 className="sitio-titulo">{datos.sitio.nombre}</h2>
              <VistaPanoramica datos={datos} indice={indice} />
              <div className="tiempo">
                <button className="boton" onClick={() => setAnimando((a) => !a)}>
                  {animando ? "❚❚ Pausa" : "▶ Animar"}
                </button>
                <input
                  id="tiempo" type="range" min="0" max={datos.serie.tiempos.length - 1}
                  value={indice} onChange={(e) => setIndice(Number(e.target.value))}
                  aria-label="Fecha y hora"
                />
                <span className="fecha">{formatoFecha(datos.serie.tiempos[indice])}</span>
              </div>
              <PanelEstado datos={datos} indice={indice} planificador={planificador} />
              {planificador && <LineaDeTiempo datos={datos} indice={indice} alCambiar={setIndice} />}
            </>
          ) : (
            !error && <p className="vacio">Elegí un sitio de la lista para empezar.</p>
          )}

          <Comparacion resultados={resultados} seleccionado={actual} alElegir={setActual} alQuitar={quitar} />

          <footer>
            {modoApi ? "Datos calculados por el backend MoonSet." : "Modo sin servidor: datos precalculados (enero de 2027, 30 días)."}{" "}
            Efemérides JPL DE421 · relieve LOLA cuando está disponible.
          </footer>
        </main>
      </div>
    </div>
  );
}

function Parametros({ valores, alAplicar }) {
  const [v, setV] = useState({ ...valores, inicio: valores.inicio.slice(0, 10) });
  const enviar = (e) => {
    e.preventDefault();
    alAplicar({ ...v, inicio: `${v.inicio}T00:00:00Z`, dias: Number(v.dias), altura_m: Number(v.altura_m), paso_horas: Number(v.paso_horas) });
  };
  return (
    <form className="parametros tarjeta" onSubmit={enviar}>
      <label htmlFor="p-inicio">Inicio (UTC)<input id="p-inicio" type="date" value={v.inicio} onChange={(e) => setV({ ...v, inicio: e.target.value })} /></label>
      <label htmlFor="p-dias">Días<input id="p-dias" type="number" min="1" max="366" value={v.dias} onChange={(e) => setV({ ...v, dias: e.target.value })} /></label>
      <label htmlFor="p-paso">Paso (h)<input id="p-paso" type="number" min="0.25" max="24" step="0.25" value={v.paso_horas} onChange={(e) => setV({ ...v, paso_horas: e.target.value })} /></label>
      <label htmlFor="p-altura">Altura del panel (m)<input id="p-altura" type="number" min="0" max="100" value={v.altura_m} onChange={(e) => setV({ ...v, altura_m: e.target.value })} /></label>
      <button type="submit" className="boton">Recalcular</button>
    </form>
  );
}
