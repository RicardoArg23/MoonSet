import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { crearTraductor, IDIOMAS, IDIOMA_BASE } from "./traductor";
import { crearFormato } from "../formato";

const CLAVE_GUARDADA = "moonset.idioma";
const Contexto = createContext(null);

// Idioma inicial: el que se eligió antes; si no, el del navegador; si no, español.
function idiomaInicial() {
  try {
    const guardado = localStorage.getItem(CLAVE_GUARDADA);
    if (guardado in IDIOMAS) return guardado;
  } catch {
    // Sin acceso al almacenamiento (modo privado): se sigue con el idioma del navegador.
  }
  const delNavegador = (navigator.language || "").slice(0, 2).toLowerCase();
  return delNavegador in IDIOMAS ? delNavegador : IDIOMA_BASE;
}

export function ProveedorIdioma({ children }) {
  const [idioma, setIdioma] = useState(idiomaInicial);

  useEffect(() => {
    document.documentElement.lang = idioma;
    try {
      localStorage.setItem(CLAVE_GUARDADA, idioma);
    } catch {
      // No se pudo guardar la preferencia: vale solo para esta sesión.
    }
  }, [idioma]);

  const valor = useMemo(() => {
    const t = crearTraductor(idioma);
    return { idioma, setIdioma, idiomas: Object.keys(IDIOMAS), t, f: crearFormato(t) };
  }, [idioma]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** @returns {{ idioma: string, setIdioma: Function, idiomas: string[], t: Function, f: ReturnType<typeof crearFormato> }} */
export function useIdioma() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useIdioma se usa dentro de <ProveedorIdioma>");
  return valor;
}

/** Convierte las marcas <b>…</b> de un texto traducido en negritas de React. */
export function rico(texto) {
  return texto.split(/<b>(.*?)<\/b>/).map((parte, k) => (k % 2 ? <b key={k}>{parte}</b> : parte));
}
