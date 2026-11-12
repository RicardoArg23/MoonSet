// Acceso a datos. Dos modos:
// - Con VITE_API_URL (archivo .env): consulta el backend FastAPI. Permite coordenadas y fechas libres.
// - Sin VITE_API_URL: lee los JSON precalculados de public/precalculado. No necesita servidor.
const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const BASE = import.meta.env.BASE_URL;

export const modoApi = Boolean(API);

async function pedir(url, opciones) {
  const r = await fetch(url, opciones);
  if (!r.ok) {
    let detalle = `${r.status} ${r.statusText}`;
    try {
      const j = await r.json();
      if (j.detail) detalle = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch { /* respuesta sin JSON */ }
    throw new Error(detalle);
  }
  return r.json();
}

export async function listarSitios() {
  if (modoApi) return pedir(`${API}/sitios`);
  const indice = await pedir(`${BASE}precalculado/indice.json`);
  return indice.sitios;
}

export async function evaluarSitio(id, params) {
  if (!modoApi) return pedir(`${BASE}precalculado/${id}.json`);
  const q = new URLSearchParams({
    inicio: params.inicio, dias: params.dias, paso_horas: params.paso_horas, altura_m: params.altura_m,
  });
  return pedir(`${API}/sitios/${encodeURIComponent(id)}?${q}`);
}

export async function evaluarCoordenadas(params) {
  if (!modoApi) {
    throw new Error("Las coordenadas personalizadas necesitan el backend. Creá frontend/.env con VITE_API_URL.");
  }
  return pedir(`${API}/evaluar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}
