// Solo texto: la misión elegida o los escenarios fijados, como CSV. Sin React, se prueba con Node.
//
// Formato según el idioma de la interfaz (RFC 4180, fin de línea CRLF):
//   es: ";" como separador y coma decimal, para que Excel en castellano lo abra con doble clic;
//   en: "," como separador y punto decimal.
// Arriba van líneas de metadatos que empiezan con "#" (sitio, misión, sistema de energía); después,
// el encabezado y los datos. Los nombres de columna son fijos y llevan la unidad: no cambian con el
// idioma, para que el archivo se pueda procesar siempre igual.
import { evaluarMision, fraccionDisco } from "./calculo.js";
import { BATERIAS, potenciaNominalKW } from "./configEnergia.js";
import { evaluarEnergia } from "./energia.js";

const HORA_MS = 3_600_000;

export const FORMATOS = {
  es: { separador: ";", decimal: "," },
  en: { separador: ",", decimal: "." },
};
const formatoDe = (idioma) => FORMATOS[idioma] ?? FORMATOS.en;

export const COLUMNAS = [
  "fecha_utc",
  "hora_mision",
  "sol_elevacion_deg",
  "sol_azimut_deg",
  "sol_margen_relieve_deg",
  "disco_solar_visible_pct",
  "luz",
  "tierra_elevacion_deg",
  "tierra_azimut_deg",
  "tierra_margen_relieve_deg",
  "contacto",
  "generacion_kw",
  "consumo_kw",
  "bateria_kwh",
  "bateria_pct",
];

export const COLUMNAS_COMPARACION = [
  "escenario",
  "sitio",
  "lat_deg",
  "lon_este_deg",
  "llegada_utc",
  "duracion_h",
  "perfil",
  "tipo_bateria",
  "capacidad_kwh",
  "sobrevive",
  "bateria_minima_pct",
  "luz_pct",
  "contacto_pct",
  "noche_mas_larga_h",
  "energia_generada_kwh",
  "energia_consumida_kwh",
  "masa_bateria_kg",
];

/** Un campo CSV: entre comillas si tiene el separador, comillas o salto de línea. */
export function campo(v, separador = ",") {
  const s = String(v);
  const especial = s.includes(separador) || /["\r\n]/.test(s);
  return especial ? `"${s.replace(/"/g, '""')}"` : s;
}

const fecha = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
const siNo = (x) => (x ? "si" : "no");

// Herramientas de un formato: números con su separador decimal y filas con su separador de campos.
function herramientas(idioma) {
  const { separador, decimal } = formatoDe(idioma);
  const num = (x, d) => (d === undefined ? String(x) : Number(x).toFixed(d)).replace(".", decimal);
  const fila = (valores) => valores.map((v) => campo(v, separador)).join(separador);
  return { num, fila };
}

// Metadatos del sistema de energía: iguales en los dos archivos.
function metaSistema(sistema, perfil, num) {
  const ejemplo = perfil?.ejemplo ? "si (no son de una mision real)" : perfil?.id === "personalizado" ? "no, cargados por el usuario" : "no";
  return [
    ["perfil", perfil?.id ?? ""],
    ["valores_de_ejemplo", ejemplo],
    ["bateria", `${BATERIAS[sistema.tipoBateria].nombre}, ${num(sistema.capacidadKWh)} kWh, tasa C ${num(sistema.tasaC)}`],
    ["paneles", `${sistema.paneles} x ${num(sistema.areaPanelM2)} m2, eficiencia ${num(sistema.eficienciaPanelPct)} %, ${sistema.orientacion}`],
    ["consumo_kw", `operacion ${num(sistema.potenciaNormalKW)}, minima ${num(sistema.potenciaMinimaKW)}, calefaccion ${num(sistema.calefaccionKW)}`],
    ["reserva_pct", num(sistema.reservaPct)],
    ["redundancia_pct", num(sistema.redundanciaPct)],
    ["potencia_nominal_kw", num(potenciaNominalKW(sistema), 3)],
  ];
}

const CRITERIO = ["criterio", "luz = asoma el borde del disco solar sobre el relieve; contacto = el centro de la Tierra esta sobre el relieve"];

function texto(meta, cabeza, filas, fila) {
  const lineas = meta.map(([k, v]) => `# ${k}: ${String(v).replace(/[\r\n]+/g, " ")}`);
  lineas.push(fila(cabeza), ...filas.map(fila));
  return lineas.join("\r\n") + "\r\n";
}

/**
 * CSV de la misión que llega en el índice i0 del sitio y dura duracionH horas, una fila por hora.
 * perfil: { id, ejemplo } del sistema elegido (para avisar si son valores de ejemplo).
 * idioma: "es" o "en" (separadores, ver FORMATOS).
 */
export function csvMision({ sitio, sistema, perfil, i0, duracionH, idioma = "en" }) {
  const { num, fila } = herramientas(idioma);
  const r = evaluarEnergia(sitio, sistema, i0, duracionH);
  const n = r.soc.length;
  const s = sitio.sitio;
  const meta = [
    ["generado_por", "MoonSet"],
    ["sitio", s.nombre ? `${s.id} (${s.nombre})` : s.id],
    ["lat_deg", num(s.lat)],
    ["lon_este_deg", num(s.lon)],
    ["coordenada_aproximada", siNo(s.aproximado)],
    ["horizonte", sitio.horizonte.fuente],
    ["llegada_utc", fecha(sitio.t0 + i0 * HORA_MS)],
    ["duracion_h", n],
    ...metaSistema(sistema, perfil, num),
    ["sobrevive", siNo(r.sobrevive)],
    ["bateria_minima_pct", num(r.minimoPct, 2)],
    CRITERIO,
  ];

  const filas = [];
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    filas.push([
      fecha(sitio.t0 + i * HORA_MS),
      k,
      num(sitio.sol_el[i], 3),
      num(sitio.sol_az[i], 3),
      num(sitio.margenSol[i], 3),
      num(100 * fraccionDisco(sitio.margenSol[i]), 1),
      sitio.luz[i],
      num(sitio.tierra_el[i], 3),
      num(sitio.tierra_az[i], 3),
      num(sitio.margenTierra[i], 3),
      sitio.senal[i],
      num(r.generacionKW[k], 4),
      num(r.consumoKW[k], 4),
      num(r.soc[k] * r.capacidadUsableKWh, 4),
      num(100 * r.soc[k], 2),
    ]);
  }
  return texto(meta, COLUMNAS, filas, fila);
}

/**
 * CSV de la vista Comparar: una fila por escenario fijado, todos con el mismo sistema de energía.
 * escenarios: [{ sitio, i0 }] en el orden de la vista (A, B, C, D).
 */
export function csvComparacion({ escenarios, sistema, perfil, duracionH, idioma = "en" }) {
  const { num, fila } = herramientas(idioma);
  const aproximados = escenarios.filter((x) => x.sitio.sitio.aproximado).map((x) => x.sitio.sitio.id);
  const meta = [
    ["generado_por", "MoonSet"],
    ["escenarios", escenarios.length],
    ["duracion_pedida_h", duracionH],
    ["coordenada_aproximada", aproximados.length ? [...new Set(aproximados)].join(" ") : "ninguna"],
    ...metaSistema(sistema, perfil, num),
    CRITERIO,
  ];

  const filas = escenarios.map(({ sitio, i0 }, k) => {
    const m = evaluarMision(sitio, i0, duracionH);
    const e = evaluarEnergia(sitio, sistema, i0, duracionH, { serie: false });
    const s = sitio.sitio;
    return [
      "ABCDEFGHIJ"[k] ?? k + 1,
      s.id,
      num(s.lat),
      num(s.lon),
      fecha(sitio.t0 + i0 * HORA_MS),
      Math.max(0, Math.min(sitio.muestras, i0 + duracionH) - i0),
      perfil?.id ?? "",
      BATERIAS[sistema.tipoBateria].nombre,
      num(sistema.capacidadKWh),
      siNo(e.sobrevive),
      num(e.minimoPct, 2),
      num(m.luzPct, 2),
      num(m.senalPct, 2),
      m.nocheH,
      num(e.generadaKWh, 3),
      num(e.consumidaKWh, 3),
      num(e.masaKg, 2),
    ];
  });
  return texto(meta, COLUMNAS_COMPARACION, filas, fila);
}

/** Nombre de archivo: moonset_connecting-ridge_2027-05-02T00h_14d.csv */
export function nombreArchivo(sitio, i0, duracionH) {
  const llegada = new Date(sitio.t0 + i0 * HORA_MS).toISOString().slice(0, 13);
  const id = sitio.sitio.id.replace(/[^\w.-]+/g, "_");
  return `moonset_${id}_${llegada}h_${Math.round(duracionH / 24)}d.csv`;
}

/** Nombre de archivo de la comparación: moonset_comparacion_3_escenarios_14d.csv */
export function nombreComparacion(n, duracionH) {
  return `moonset_comparacion_${n}_escenarios_${Math.round(duracionH / 24)}d.csv`;
}
