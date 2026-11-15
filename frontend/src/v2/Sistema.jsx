import { useEffect, useState } from "react";
import { BATERIAS, CONSTANTE_SOLAR_KW_M2, PERFIL_PERSONALIZADO, PERFILES, potenciaNominalKW } from "./configEnergia";
import { MARGEN_COMUNICACION_MAX_DEG } from "./calculo";
import { useIdioma } from "./i18n";

// Campo numérico con su unidad. Guarda el texto tal como se escribe ("0," o vacío) y solo avisa
// cuando hay un número válido; si el valor cambia desde afuera (otro perfil), se actualiza.
function Campo({ etiqueta, unidad, valor, alCambiar, paso = "any", min = 0, max, entero = false, ayuda }) {
  const comoTexto = (v) => (v == null ? "" : String(v));
  const [texto, setTexto] = useState(comoTexto(valor));
  useEffect(() => {
    const actual = texto === "" ? null : Number(texto);
    if (actual !== valor) setTexto(comoTexto(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function cambiar(s) {
    setTexto(s);
    if (s === "") return;
    const x = entero ? Math.round(Number(s)) : Number(s);
    if (Number.isFinite(x) && x >= min && (max === undefined || x <= max)) alCambiar(x);
  }

  return (
    <label className="campo" title={ayuda}>
      <span>{etiqueta}{ayuda && <i className="ayuda" aria-hidden="true"> ⓘ</i>}</span>
      <span className="campo-entrada">
        <input
          type="number"
          inputMode="decimal"
          step={entero ? 1 : paso}
          min={min}
          max={max}
          value={texto}
          onChange={(e) => cambiar(e.target.value)}
        />
        <small>{unidad}</small>
      </span>
    </label>
  );
}

function Ficha({ tipo }) {
  const { t, f } = useIdioma();
  const { num } = f;
  const b = BATERIAS[tipo];
  const rango = (d, dec = 0) => t("sistema.ficha.rango", { min: num(d.min, dec), max: num(d.max, dec) });
  return (
    <dl className="ficha">
      <div><dt>{t("sistema.ficha.densidad")}</dt><dd>{num(b.densidadWhKg.defecto)} Wh/kg <small>{rango(b.densidadWhKg)}</small></dd></div>
      <div><dt>{t("sistema.ficha.ciclos")}</dt><dd>{num(b.ciclos.defecto)} <small>{rango(b.ciclos)}</small></dd></div>
      <div><dt>{t("sistema.ficha.temperatura")}</dt><dd>{t("sistema.ficha.temperaturaValor", { min: f.conSigno(b.temperaturaC.min, 0), max: num(b.temperaturaC.max) })}</dd></div>
      <div><dt>{t("sistema.ficha.autodescarga")}</dt><dd>{num(b.autodescargaMensualPct.defecto, 1)} %/{t("sistema.ficha.mes")} <small>{rango(b.autodescargaMensualPct)}</small></dd></div>
      <div><dt>{t("sistema.ficha.eficiencia")}</dt><dd>{num(b.eficienciaPct.defecto)} % <small>{rango(b.eficienciaPct)}</small></dd></div>
      <div><dt>{t("sistema.ficha.tasaC")}</dt><dd>{num(b.tasaC.defecto, 1)} C {b.tasaC.ejemplo && <small>{t("sistema.ficha.ejemplo")}</small>}</dd></div>
      <p className="tenue">{t("sistema.ficha.nota")}</p>
    </dl>
  );
}

// Botón de la barra superior con el resumen del sistema y, desplegado, todas las entradas en capas:
// perfil, datos a la vista y "Avanzado" (cerrado). Cualquier cambio pasa el perfil a "Personalizado",
// salvo el margen para comunicación, que es de la antena y no del sistema de energía.
export default function Sistema({ sistema, perfilId, alElegirPerfil, alCambiar, margenCom, alCambiarMargen }) {
  const { t, f } = useIdioma();
  const { num } = f;
  const [abierto, setAbierto] = useState(false);
  const [verFicha, setVerFicha] = useState(false);
  const perfil = PERFILES.find((p) => p.id === perfilId);
  const nombrePerfil = t(`sistema.perfiles.${perfilId}`);
  const cap = sistema.capacidadKWh;
  const resumen = `${nombrePerfil} · ${BATERIAS[sistema.tipoBateria].nombre} · ${num(cap, cap < 10 && cap % 1 ? 1 : 0)} kWh`;
  const picoKW = CONSTANTE_SOLAR_KW_M2 * sistema.areaPanelM2 * sistema.paneles * (sistema.eficienciaPanelPct / 100);
  const nominalKW = potenciaNominalKW(sistema);
  const campo = (clave) => ({ valor: sistema[clave], alCambiar: (v) => alCambiar({ [clave]: v }) });

  return (
    <div className="sistema">
      <button type="button" className="vidrio" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} title={t("sistema.botonAyuda")}>
        <span className="sistema-icono" aria-hidden="true">⚡</span>{resumen}
      </button>
      {abierto && (
        <div className="sistema-panel vidrio">
          <div className="sistema-perfil">
            <label>
              <span className="rotulo">{t("sistema.perfil")}</span>
              <select value={perfilId} onChange={(e) => alElegirPerfil(e.target.value)}>
                {PERFILES.map((p) => <option key={p.id} value={p.id}>{t(`sistema.perfiles.${p.id}`)}</option>)}
                <option value={PERFIL_PERSONALIZADO}>{t(`sistema.perfiles.${PERFIL_PERSONALIZADO}`)}</option>
              </select>
            </label>
            {perfil?.ejemplo && <span className="etiqueta-ejemplo" title={t("sistema.ejemploAyuda")}>{t("sistema.ejemplo")}</span>}
          </div>

          <div className="sistema-bateria">
            <span className="rotulo">{t("sistema.bateria")}</span>
            <div className="segmentos" role="group" aria-label={t("sistema.bateria")}>
              {Object.entries(BATERIAS).map(([id, b]) => (
                <button key={id} type="button" aria-pressed={sistema.tipoBateria === id} onClick={() => alCambiar({ tipoBateria: id, tasaC: BATERIAS[id].tasaC.defecto })}>{b.nombre}</button>
              ))}
            </div>
            <button type="button" className="enlace" aria-expanded={verFicha} onClick={() => setVerFicha((v) => !v)}>ⓘ {t("sistema.verFicha")}</button>
          </div>
          {verFicha && <Ficha tipo={sistema.tipoBateria} />}

          <div className="campos">
            <Campo etiqueta={t("sistema.capacidad")} unidad="kWh" paso="0.1" {...campo("capacidadKWh")} />
            <Campo etiqueta={t("sistema.paneles")} unidad={t("sistema.unidadPaneles")} entero {...campo("paneles")} />
            <Campo etiqueta={t("sistema.areaPanel")} unidad="m²" paso="0.1" {...campo("areaPanelM2")} />
            <p className="campo-dato"><span>{t("sistema.pico")}</span><b>{num(picoKW, picoKW < 10 ? 2 : 0)} kW</b></p>
            <Campo etiqueta={t("sistema.potenciaNormal")} unidad="kW" paso="0.01" {...campo("potenciaNormalKW")} />
            <Campo etiqueta={t("sistema.potenciaMinima")} unidad="kW" paso="0.01" {...campo("potenciaMinimaKW")} />
          </div>

          <details className="avanzado">
            <summary>{t("sistema.avanzado")}</summary>
            <div className="campos">
              <Campo etiqueta={t("sistema.eficienciaPanel")} unidad="%" max={100} {...campo("eficienciaPanelPct")} />
              <label className="campo">
                <span>{t("sistema.orientacion")}</span>
                <select value={sistema.orientacion} onChange={(e) => alCambiar({ orientacion: e.target.value })}>
                  <option value="seguidor">{t("sistema.seguidor")}</option>
                  <option value="horizontal">{t("sistema.horizontal")}</option>
                </select>
              </label>
              <Campo etiqueta={t("sistema.reserva")} unidad="%" max={100} {...campo("reservaPct")} />
              <Campo etiqueta={t("sistema.redundancia")} unidad="%" {...campo("redundanciaPct")} />
              <Campo etiqueta={t("sistema.tasaC")} unidad="C" paso="0.1" {...campo("tasaC")} />
              <p className="campo-dato"><span>{t("sistema.potenciaNominal")}</span><b>{num(nominalKW, nominalKW < 10 ? 2 : 0)} kW</b></p>
              <Campo etiqueta={t("sistema.calefaccion")} unidad="kW" paso="0.01" {...campo("calefaccionKW")} />
              <Campo etiqueta={t("sistema.margenCom")} unidad="°" paso="0.5" max={MARGEN_COMUNICACION_MAX_DEG} ayuda={t("sistema.margenComAyuda")} valor={margenCom} alCambiar={alCambiarMargen} />
            </div>
            <p className="tenue nota-chica">{t("sistema.calefaccionNota")}</p>
          </details>
        </div>
      )}
    </div>
  );
}
