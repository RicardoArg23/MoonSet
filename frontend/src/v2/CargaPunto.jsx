import { useEffect, useRef } from "react";
import { avanceEstimado } from "./carga";
import { LAT_POLAR_SUR } from "./enlaces";
import { useIdioma } from "./i18n";

// Barra fina en el borde superior del panel mientras se calcula un punto. estado: "cargando" avanza con
// avanceEstimado (sin pasar del 90 %); "listo" la completa y la desvanece; null no dibuja nada.
// Se monta de nuevo (key) con cada pedido, así un punto nuevo arranca la barra desde cero.
export function BarraProgreso({ estado }) {
  const barra = useRef(null);
  useEffect(() => {
    if (estado !== "cargando") return undefined;
    const t0 = performance.now();
    let id;
    const paso = (ahora) => {
      if (barra.current) barra.current.style.transform = `scaleX(${avanceEstimado((ahora - t0) / 1000)})`;
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [estado]);
  useEffect(() => {
    if (estado === "listo" && barra.current) barra.current.style.transform = "scaleX(1)";
  }, [estado]);
  if (!estado) return null;
  return (
    <div className={`progreso ${estado}`} aria-hidden="true">
      <i ref={barra} />
    </div>
  );
}

// Contenido del panel mientras se calcula un punto tocado (o si falló): las coordenadas del punto nuevo y
// bloques de carga en lugar de los valores, para no mostrar nunca los del sitio anterior.
export function PanelPendiente({ pendiente, alReintentar, alVolver }) {
  const { t, f } = useIdioma();
  const fallo = pendiente.estado === "error";
  const polar = pendiente.lat <= LAT_POLAR_SUR; // el backend usa el DEM de LOLA 80 m desde 80° S
  return (
    <>
      <div className="panel-sitio">
        <p className="panel-punto">{f.coordenadas(pendiente)}</p>
        <p className={fallo ? "error" : "tenue"} role={fallo ? "alert" : "status"} aria-live="polite">
          {fallo ? t("carga.error", { error: pendiente.error }) : t(polar ? "carga.calculandoPolar" : "carga.calculando")}
        </p>
      </div>
      {fallo ? (
        <div className="panel-fallo">
          <button type="button" className="primario" onClick={alReintentar}>{t("carga.reintentar")}</button>
          <button type="button" onClick={alVolver}>{t("carga.volver")}</button>
        </div>
      ) : (
        <div className="esqueleto" aria-hidden="true">
          <div className="panel-veredicto">
            <i className="bloque chip" />
            <i className="bloque veredicto" />
          </div>
          <div className="panel-medidor">
            <i className="bloque linea" />
            <i className="bloque barra" />
          </div>
          <div className="panel-cifras">
            <i className="bloque tarjeta" />
            <i className="bloque tarjeta" />
            <i className="bloque tarjeta" />
          </div>
        </div>
      )}
    </>
  );
}

// Horizonte y Alrededores mientras se calcula un punto tocado: en lugar de la vista del sitio anterior,
// las coordenadas del punto nuevo y un bloque de carga. Los avisos para lectores de pantalla ya los da
// el panel; acá no se repiten.
export function VistaPendiente({ pendiente, vista, alReintentar }) {
  const { t, f } = useIdioma();
  const fallo = pendiente.estado === "error";
  const polar = pendiente.lat <= LAT_POLAR_SUR;
  return (
    <div className={`vista-pendiente ${vista}`}>
      <p className="panel-punto">{f.coordenadas(pendiente)}</p>
      {fallo ? (
        <>
          <p className="error">{t("carga.error", { error: pendiente.error })}</p>
          <button type="button" className="primario" onClick={alReintentar}>{t("carga.reintentar")}</button>
        </>
      ) : (
        <>
          <p className="tenue">{t(polar ? "carga.calculandoPolar" : "carga.calculando")}</p>
          {vista === "alrededores" && <p className="tenue nota-chica">{t("carga.alrededoresPropio")}</p>}
          <i className="bloque panorama" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
