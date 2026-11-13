// Carga los datos anuales precalculados (public/anual, copiados desde data/anual). No necesita backend.
import { prepararSitio } from "./calculo";

const BASE = import.meta.env.BASE_URL;
const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/** true si hay backend configurado (frontend/.env con VITE_API_URL): habilita coordenadas propias. */
export const hayBackend = Boolean(API);

async function pedir(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return r.json();
}

/** @returns {Promise<object[]>} sitios con sus series derivadas, polares primero */
export async function cargarSitios() {
  const indice = await pedir(`${BASE}anual/indice.json`);
  const crudos = await Promise.all(indice.sitios.map((s) => pedir(`${BASE}anual/${s.archivo}`)));
  return crudos.map(prepararSitio).sort((a, b) => a.sitio.lat - b.sitio.lat);
}

/** Puntos subsolar y subterrestre de cada hora (para iluminar el globo). */
export function cargarGeometria() {
  return pedir(`${BASE}anual/geometria.json`);
}

/** Un año de datos para coordenadas cualesquiera, calculado por el backend. */
export async function cargarCoordenadas(lat, lon) {
  if (!hayBackend) throw new Error("Las coordenadas propias necesitan el backend encendido.");
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return prepararSitio(await pedir(`${API}/anual?${q}`));
}

/** Grilla de horizontes alrededor de un sitio polar. null si ese sitio no la tiene precalculada. */
export async function cargarVecindad(id) {
  const r = await fetch(`${BASE}anual/vecindad-${id}.json`);
  if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
  return r.json();
}

/** Metadatos e imagen de fondo del mapa 2D del polo sur (data/mapa). null si no se generó. */
export async function cargarMapa() {
  const r = await fetch(`${BASE}mapa/polo_sur.json`);
  if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
  const meta = await r.json();
  return { ...meta, url: `${BASE}mapa/${meta.imagen}` };
}
