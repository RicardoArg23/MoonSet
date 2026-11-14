// Configuración del modelo de energía: tipos de batería, valores por defecto y perfiles de misión.
// Es el único archivo que hay que tocar para cambiar estos números; energia.js solo los usa.

// Datos de las baterías: vienen del equipo. De cada dato se guarda el rango y el valor por defecto
// que usa la simulación. La tasa C es un valor de ejemplo (sin rango todavía): con ella se calcula
// la potencia nominal (máxima descarga continua) = capacidad total x tasa C.
export const BATERIAS = {
  "li-ion": {
    nombre: "Li-ion",
    densidadWhKg: { min: 150, max: 250, defecto: 200 },
    ciclos: { min: 500, max: 2000, defecto: 1000 },
    temperaturaC: { min: -20, max: 60 },
    autodescargaMensualPct: { min: 5, max: 15, defecto: 10 },
    eficienciaPct: { min: 90, max: 95, defecto: 92 }, // ida y vuelta (carga + descarga)
    tasaC: { defecto: 1, ejemplo: true }, // potencia nominal = capacidad total x tasa C
  },
  "li-s": {
    nombre: "Li-S",
    densidadWhKg: { min: 300, max: 500, defecto: 400 },
    ciclos: { min: 300, max: 500, defecto: 400 },
    temperaturaC: { min: -20, max: 60 },
    autodescargaMensualPct: { min: 5, max: 10, defecto: 7.5 },
    eficienciaPct: { min: 50, max: 95, defecto: 80 },
    tasaC: { defecto: 0.5, ejemplo: true },
  },
};

export const CONSTANTE_SOLAR_KW_M2 = 1.361;

// Opciones del desplegable "Avanzado" que no dependen del perfil.
export const AVANZADO_DEFECTO = {
  eficienciaPanelPct: 30,
  orientacion: "seguidor", // "seguidor" (sigue al Sol) o "horizontal" (fijo acostado)
  reservaPct: 20, // % del estado de carga (sobre la capacidad usable) que no se puede bajar
  redundanciaPct: 0, // % de capacidad de respaldo que no se usa en operación normal
  calefaccionKW: 0, // la noche polar está a más de 150 °C bajo cero; las baterías operan desde −20 °C
};

// VALORES DE EJEMPLO: los pasó el equipo para probar el modelo y se van a reemplazar por valores de
// misiones reales con fuente. La interfaz muestra "valores de ejemplo" junto al selector.
// Lo que un perfil no define toma el valor de AVANZADO_DEFECTO.
// Elegir un perfil carga todos sus valores. "Personalizado" no tiene valores propios: es el estado
// en que queda el panel cuando el usuario cambia cualquier dato.
export const PERFILES = [
  {
    id: "modulo-chico",
    nombre: "Módulo de alunizaje chico",
    ejemplo: true,
    valores: { ...AVANZADO_DEFECTO, tipoBateria: "li-ion", tasaC: BATERIAS["li-ion"].tasaC.defecto, capacidadKWh: 5, paneles: 6, areaPanelM2: 1, potenciaNormalKW: 0.3, potenciaMinimaKW: 0.05, calefaccionKW: 0.05 },
  },
  {
    id: "rover",
    nombre: "Rover",
    ejemplo: true,
    valores: { ...AVANZADO_DEFECTO, tipoBateria: "li-s", tasaC: BATERIAS["li-s"].tasaC.defecto, capacidadKWh: 4, paneles: 3, areaPanelM2: 1, potenciaNormalKW: 0.45, potenciaMinimaKW: 0.08, calefaccionKW: 0.1 },
  },
  {
    id: "base",
    nombre: "Base de larga duración",
    ejemplo: true,
    valores: { ...AVANZADO_DEFECTO, tipoBateria: "li-ion", tasaC: BATERIAS["li-ion"].tasaC.defecto, capacidadKWh: 300, paneles: 60, areaPanelM2: 2, potenciaNormalKW: 10, potenciaMinimaKW: 2, calefaccionKW: 1 },
  },
];
export const PERFIL_PERSONALIZADO = "personalizado";
export const PERFIL_INICIAL = "modulo-chico";

/** Potencia nominal de la batería (kW): capacidad total x tasa C. Sin tasa C usa la del tipo. */
export function potenciaNominalKW(sistema) {
  return sistema.capacidadKWh * (sistema.tasaC ?? BATERIAS[sistema.tipoBateria].tasaC.defecto);
}

/** Valores por defecto de la batería elegida, en el formato que usa la simulación. */
export function parametrosBateria(tipo) {
  const b = BATERIAS[tipo];
  return {
    densidadWhKg: b.densidadWhKg.defecto,
    ciclos: b.ciclos.defecto,
    autodescargaMensualPct: b.autodescargaMensualPct.defecto,
    eficienciaPct: b.eficienciaPct.defecto,
  };
}
