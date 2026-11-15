import { useSyncExternalStore } from "react";

/** Si la ventana cumple una consulta de medios CSS; se actualiza sola cuando cambia. */
export function useMedia(consulta) {
  return useSyncExternalStore(
    (avisar) => {
      const lista = window.matchMedia(consulta);
      lista.addEventListener("change", avisar);
      return () => lista.removeEventListener("change", avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => false
  );
}

export const ANGOSTO = "(max-width: 980px)";
export const CON_PUNTERO = "(hover: hover) and (pointer: fine)";
