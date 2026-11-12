import { useState } from "react";

const CATEGORIAS = { apollo: "Apollo", artemis: "Artemis / polo sur", clps: "CLPS (misiones comerciales)", otros_paises: "Otros países" };

// Lista curada agrupada por categoría + formulario de coordenadas libres.
export default function SelectorSitio({ sitios, seleccionado, alElegir, alEvaluarCoordenadas, modoApi }) {
  const [lat, setLat] = useState("-85.5");
  const [lon, setLon] = useState("30");

  const grupos = Object.entries(CATEGORIAS)
    .map(([clave, nombre]) => [nombre, sitios.filter((s) => s.categoria === clave)])
    .filter(([, lista]) => lista.length);

  const enviar = (e) => {
    e.preventDefault();
    alEvaluarCoordenadas(Number(lat), Number(lon));
  };

  return (
    <aside className="selector">
      {grupos.map(([nombre, lista]) => (
        <div key={nombre} className="grupo">
          <h3>{nombre}</h3>
          {lista.map((s) => (
            <button
              key={s.id}
              className="sitio"
              aria-pressed={seleccionado === s.id}
              onClick={() => alElegir(s.id)}
            >
              {s.nombre}
              <small>{s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°E{s.aproximado ? " · aprox." : ""}</small>
            </button>
          ))}
        </div>
      ))}

      <form className="grupo" onSubmit={enviar}>
        <h3>Coordenadas personalizadas</h3>
        <div className="coords">
          <label htmlFor="lat">Latitud<input id="lat" type="number" step="any" min="-90" max="90" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
          <label htmlFor="lon">Longitud E<input id="lon" type="number" step="any" min="-180" max="360" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        </div>
        <button type="submit" className="boton" disabled={!modoApi}>Evaluar</button>
        {!modoApi && <p className="aviso">Necesita el backend: configurá VITE_API_URL en frontend/.env.</p>}
      </form>
    </aside>
  );
}
