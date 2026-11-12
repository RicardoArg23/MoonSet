import { cardinal, formatoHoras, horasHastaPuesta, horasHastaSalida } from "../utils/tiempo";

// Estado en el momento elegido: luz, señal y cuánto falta para que cambien.
export default function PanelEstado({ datos, indice, planificador }) {
  const { serie, parametros } = datos;
  const paso = parametros.paso_horas;
  const luz = serie.luz[indice] === 1;
  const senal = serie.senal[indice] === 1;

  const cuentaSol = luz ? horasHastaPuesta(serie.luz, indice, paso) : horasHastaSalida(serie.luz, indice, paso);
  const cuentaTierra = senal ? horasHastaPuesta(serie.senal, indice, paso) : horasHastaSalida(serie.senal, indice, paso);

  return (
    <div className="estado">
      <Tarjeta
        activo={luz} color="var(--sol)"
        titulo={luz ? "Hay luz" : "En sombra"}
        cuenta={cuentaSol}
        etiquetaCuenta={luz ? "hasta la puesta del Sol" : "hasta que salga el Sol"}
        texto={luz ? "Los paneles solares generan energía." : "El Sol está detrás del relieve: se usan baterías."}
        planificador={planificador}
        numeros={`Sol · azimut ${serie.sol_azimut[indice].toFixed(1)}° (${cardinal(serie.sol_azimut[indice])}) · elevación ${serie.sol_elevacion[indice].toFixed(2)}° · margen ${serie.margen_sol[indice].toFixed(2)}° · disco visible ${Math.round(serie.fraccion_disco_solar[indice] * 100)}%`}
      />
      <Tarjeta
        activo={senal} color="var(--tierra)"
        titulo={senal ? "Señal con la Tierra" : "Sin señal directa"}
        cuenta={cuentaTierra}
        etiquetaCuenta={senal ? "hasta la puesta de la Tierra" : "hasta que salga la Tierra"}
        texto={senal ? "Se puede transmitir directo, sin satélite." : "Hace falta un satélite relé para comunicarse."}
        planificador={planificador}
        numeros={`Tierra · azimut ${serie.tierra_azimut[indice].toFixed(1)}° (${cardinal(serie.tierra_azimut[indice])}) · elevación ${serie.tierra_elevacion[indice].toFixed(2)}° · margen ${serie.margen_tierra[indice].toFixed(2)}°`}
      />
    </div>
  );
}

function Tarjeta({ activo, color, titulo, cuenta, etiquetaCuenta, texto, planificador, numeros }) {
  return (
    <div className="tarjeta estado-tarjeta">
      <div className="estado-titulo">
        <span className="punto" style={{ background: activo ? color : "var(--linea)" }} />
        {titulo}
      </div>
      <div className="cuenta">
        <strong>{cuenta === null ? "Todo el período" : formatoHoras(cuenta)}</strong>
        <span>{cuenta === null ? (activo ? "no se pone en el período elegido" : "no sale en el período elegido") : etiquetaCuenta}</span>
      </div>
      {planificador ? <p className="numeros">{numeros}</p> : <p className="texto">{texto}</p>}
    </div>
  );
}
