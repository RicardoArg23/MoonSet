// Solo números: el avance estimado de la barra de carga al calcular un punto. Sin React, se prueba con Node.
//
// No sabemos cuánto va a tardar el backend (~1 s, a veces más), así que la barra no promete un tiempo:
// avanza rápido al principio y se frena acercándose al 90 % sin llegar nunca (curva asintótica). Solo
// se completa cuando llega la respuesta.

export const AVANCE_TOPE = 0.9;
const CONSTANTE_S = 0.8; // a los 0,8 s va por el 57 %, a los 2 s por el 83 %, a los 4 s por el 89 %

/** Fracción de la barra (0 a AVANCE_TOPE) después de `segundos` de espera. */
export function avanceEstimado(segundos) {
  if (!(segundos > 0)) return 0;
  return AVANCE_TOPE * (1 - Math.exp(-segundos / CONSTANTE_S));
}
