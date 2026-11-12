import { formatoHoras } from "../utils/tiempo";

// Compara los sitios ya evaluados: % de luz y señal, rachas más largas y elevación solar.
export default function Comparacion({ resultados, seleccionado, alElegir, alQuitar }) {
  if (!resultados.length) return null;
  return (
    <section className="comparacion">
      <h2>Comparar sitios</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Sitio</th>
              <th>Luz</th>
              <th>Señal</th>
              <th>Oscuridad más larga</th>
              <th>Sin señal más largo</th>
              <th>Elevación solar máx.</th>
              <th aria-label="Quitar" />
            </tr>
          </thead>
          <tbody>
            {resultados.map(({ clave, datos }) => {
              const m = datos.metricas;
              return (
                <tr key={clave} aria-selected={clave === seleccionado} onClick={() => alElegir(clave)}>
                  <td className="nombre">{datos.sitio.nombre}</td>
                  <td><Barra valor={m.porcentaje_luz} color="var(--sol)" /></td>
                  <td><Barra valor={m.porcentaje_senal} color="var(--tierra)" /></td>
                  <td className="num">{formatoHoras(m.oscuridad_mas_larga_h)}</td>
                  <td className="num">{formatoHoras(m.sin_senal_mas_largo_h)}</td>
                  <td className="num">{m.elevacion_solar_max.toFixed(1)}°</td>
                  <td><button className="quitar" onClick={(e) => { e.stopPropagation(); alQuitar(clave); }} aria-label={`Quitar ${datos.sitio.nombre}`}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Barra({ valor, color }) {
  return (
    <div className="barra">
      <div className="pista"><div style={{ width: `${valor}%`, background: color }} /></div>
      <b>{Math.round(valor)}%</b>
    </div>
  );
}
