// Instalación como app (PWA). Sin React en la captura del evento: el navegador avisa `beforeinstallprompt` apenas carga
// la página, a veces antes de que React monte; por eso este módulo se importa en main.jsx y lo guarda.
// Solo Chrome y Edge (escritorio y Android) lo emiten. Safari de iPhone no tiene API: ahí se explican los pasos a mano.
import { useSyncExternalStore } from "react";

const CLAVE_DESCARTADO = "moonset.instalarDescartado";

let evento = null; // el aviso del navegador, guardado hasta que la persona toque "Instalar"
let instalada = false;
const oyentes = new Set();
let instantanea = { modo: null, descartado: false }; // se calcula abajo, cuando ya existen las funciones que usa

function leerDescartado() {
  try {
    return localStorage.getItem(CLAVE_DESCARTADO) === "1";
  } catch {
    return false;
  }
}

const enModoApp = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function calcular() {
  if (typeof window === "undefined") return { modo: null, descartado: false };
  const yaInstalada = instalada || enModoApp();
  // "nativo": un clic abre el cuadro de instalación del navegador. "ios": solo se pueden explicar los pasos.
  const modo = yaInstalada ? null : evento ? "nativo" : esIOS() ? "ios" : null;
  return { modo, descartado: leerDescartado() };
}

instantanea = calcular();

function avisar() {
  instantanea = calcular();
  oyentes.forEach((oyente) => oyente());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // el cuadro lo abrimos nosotros, desde nuestro botón
    evento = e;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    instalada = true;
    evento = null;
    avisar();
  });
}

/** Abre el cuadro de instalación del navegador. Devuelve true si la persona aceptó. */
export async function instalarApp() {
  if (!evento) return false;
  const aviso = evento;
  evento = null; // el aviso solo se puede usar una vez
  aviso.prompt();
  const { outcome } = await aviso.userChoice;
  if (outcome !== "accepted") avisar();
  return outcome === "accepted";
}

/** "Ahora no": el ofrecimiento automático no vuelve; el botón del cajón sigue disponible. */
export function descartarOferta() {
  try {
    localStorage.setItem(CLAVE_DESCARTADO, "1");
  } catch {
    /* sin almacenamiento (modo privado): solo se oculta en esta visita */
  }
  avisar();
}

/** @returns {{ modo: "nativo" | "ios" | null, descartado: boolean }} qué se puede ofrecer ahora */
export function useInstalar() {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    () => instantanea,
    () => ({ modo: null, descartado: false })
  );
}
