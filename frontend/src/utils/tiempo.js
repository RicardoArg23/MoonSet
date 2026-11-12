const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatoFecha(iso) {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export function formatoFechaCorta(iso) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function formatoHoras(h) {
  if (h === null || h === undefined) return "—";
  if (h === 0) return "nunca";
  if (h < 1) return "menos de 1 h";
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} días`;
}

// Horas desde el índice i hasta que el valor (1 = visible) pasa a 0.
// Devuelve 0 si ya está oculto y null si no se oculta antes del fin del período.
export function horasHastaPuesta(serie, i, pasoHoras) {
  if (!serie[i]) return 0;
  for (let k = i + 1; k < serie.length; k++) {
    if (!serie[k]) return (k - i) * pasoHoras;
  }
  return null;
}

export function horasHastaSalida(serie, i, pasoHoras) {
  if (serie[i]) return 0;
  for (let k = i + 1; k < serie.length; k++) {
    if (serie[k]) return (k - i) * pasoHoras;
  }
  return null;
}

export function cardinal(az) {
  return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(az / 45) % 8];
}

export function alturaHorizonte(horizonte, az) {
  const a = ((az % 360) + 360) % 360;
  const i = Math.floor(a);
  const f = a - i;
  return horizonte[i] * (1 - f) + horizonte[(i + 1) % 360] * f;
}
