// Copia ../data/precalculado y ../data/anual a public/ para que la página funcione sin backend.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const carpetas = ["precalculado", "anual"];

for (const carpeta of carpetas) {
  const origen = resolve(aqui, "../../data", carpeta);
  const destino = resolve(aqui, "../public", carpeta);
  if (!existsSync(origen)) {
    console.warn(`[copiar-datos] No existe ${origen}. Corré los scripts de backend/scripts/ primero.`);
    continue;
  }
  rmSync(destino, { recursive: true, force: true });
  cpSync(origen, destino, { recursive: true });
  console.log(`[copiar-datos] ${origen} -> ${destino}`);
}
