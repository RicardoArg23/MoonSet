// Cómo se muestran números, fechas, coordenadas y nombres según el idioma.
// calculo.js solo devuelve números; todo lo que sea texto para la pantalla sale de acá.
// Las conversiones de unidades de medida, cuando se sumen, van también en este módulo.

/**
 * @param {(clave: string, params?: object) => any} t traductor del idioma activo
 * @returns funciones de formato ligadas a ese idioma
 */
export function crearFormato(t) {
  const local = t("formato.local");
  const fecha = (opciones) => new Intl.DateTimeFormat(local, { timeZone: "UTC", ...opciones });
  const larga = fecha({ day: "numeric", month: "long" });
  const corta = fecha({ day: "numeric", month: "short" });
  const mes = fecha({ month: "short" });

  function num(x, decimales = 0) {
    return x.toLocaleString(local, { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  function coordenadas({ lat, lon }) {
    return `${num(Math.abs(lat), 2)}° ${lat < 0 ? "S" : "N"} · ${num(((lon % 360) + 360) % 360, 2)}° E`;
  }

  /** Nombre completo del sitio en el idioma activo ("Misión — lugar"). */
  function nombreSitio(sitio) {
    if (sitio.categoria === "personalizado") return t("formato.puntoPropio", { coordenadas: coordenadas(sitio) });
    const traducido = t(`sitios.${sitio.id}`);
    return traducido === `sitios.${sitio.id}` ? sitio.nombre : traducido;
  }

  return {
    num,
    coordenadas,
    conSigno: (x, decimales = 2) => (x < 0 ? "−" : "+") + num(Math.abs(x), decimales),
    fechaLarga: (ms) => larga.format(ms),
    fechaCorta: (ms) => corta.format(ms),
    /** Abreviaturas de los 12 meses, de tres letras. */
    meses: Array.from({ length: 12 }, (_, m) => mes.format(Date.UTC(2027, m, 15)).replace(".", "").slice(0, 3)),
    cardinal: (az) => t("formato.cardinales")[Math.round(az / 45) % 8],
    rumbo: (az) => t("formato.rumbos")[Math.round((((az % 360) + 360) % 360) / 45) % 8],
    /** Longitud en metros: "850 m" o "2,7 km". Acá se enchufa la conversión de unidades. */
    longitud: (m) => (m >= 1000 ? `${num(m / 1000, 1)} km` : `${num(m)} m`),
    /** Duración: horas hasta tres días, después días con un decimal. */
    duracion: (h) => (h < 72 ? t("formato.horas", { h }) : t("formato.dias", { d: num(h / 24, 1) })),
    nombreSitio,
    /** Nombre sin la aclaración del lugar. */
    nombreCorto: (sitio) => nombreSitio(sitio).split(" — ")[0],
  };
}
