// Copia ../data/precalculado a public/precalculado para que la página funcione sin backend.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = resolve(aqui, "../../data/precalculado");
const destino = resolve(aqui, "../public/precalculado");

if (!existsSync(origen)) {
  console.warn(`[copiar-datos] No existe ${origen}. Corré backend/scripts/precalcular_sitios.py primero.`);
} else {
  rmSync(destino, { recursive: true, force: true });
  cpSync(origen, destino, { recursive: true });
  console.log(`[copiar-datos] ${origen} -> ${destino}`);
}
