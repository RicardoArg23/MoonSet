// Tests del recorrido guiado: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAVE_VISTO, conAccion, irAPaso, marcarTutorialVisto, pasosDe, tutorialVisto } from "../src/v2/tutorial.js";
import { IDIOMAS } from "../src/v2/i18n/traductor.js";

const inicio = { paso: 0, hecho: false, sentido: 1 };

test("cada perfil tiene su recorrido: corto en explorar, completo en planificar", () => {
  assert.deepEqual(pasosDe("explorar").map((p) => p.id), ["sitio", "respuesta", "duracion", "horizonte", "astronautaExplorar", "agregar", "fechaNueva", "finExplorar"]);
  assert.equal(pasosDe("planificar").length, 12);
  assert.ok(pasosDe("explorar").every((p) => p.necesita !== "plan" && p.accion !== "plan"), "explorar presenta el asistente pero no lo abre");
  assert.deepEqual(pasosDe("otro"), pasosDe("planificar"));
  const ids = pasosDe("explorar").map((p) => p.id);
  assert.ok(pasosDe("explorar").every((p) => ![].concat(p.objetivo).some((o) => ["sistema", "fijar"].includes(o))), "explorar no señala herramientas que no tiene");
  assert.ok(ids.indexOf("agregar") < ids.indexOf("fechaNueva"), "la línea de tiempo se señala recién después de enseñar a sumarla");
});

test("todos los pasos tienen sus textos en los dos idiomas, y los que piden una acción dicen cuál", () => {
  for (const perfil of ["explorar", "planificar"]) {
    for (const paso of pasosDe(perfil)) {
      for (const idioma of ["es", "en"]) {
        const textos = IDIOMAS[idioma].tutorial.pasos[paso.id];
        assert.ok(textos?.titulo && textos?.texto, `${idioma}: faltan textos de ${paso.id}`);
        assert.equal(Boolean(textos.hace), Boolean(paso.accion), `${idioma}: ${paso.id} y su "hace" no coinciden`);
        assert.equal(Array.isArray(textos.lista), Boolean(paso.lista), `${idioma}: ${paso.id} y su lista no coinciden`);
      }
    }
  }
});

test("avanzar más allá del último paso termina; retroceder no pasa del primero", () => {
  assert.deepEqual(irAPaso(inicio, 1, 5), { paso: 1, hecho: false, sentido: 1 });
  assert.deepEqual(irAPaso({ paso: 4, hecho: true, sentido: 1 }, 5, 5), { paso: -1, hecho: false, sentido: 1 });
  assert.deepEqual(irAPaso({ paso: 2, hecho: false, sentido: 1 }, 1, 5), { paso: 1, hecho: false, sentido: -1 });
  assert.equal(irAPaso(inicio, -1, 5).paso, 0);
});

test("solo la acción que pide el paso lo da por hecho, y una sola vez", () => {
  const pasos = pasosDe("explorar");
  assert.equal(conAccion(inicio, pasos, "duracion"), inicio, "otra acción no cuenta");
  const hecho = conAccion(inicio, pasos, "sitio");
  assert.equal(hecho.hecho, true);
  assert.equal(conAccion(hecho, pasos, "sitio"), hecho, "repetir no cambia nada");
  const lectura = { paso: 1, hecho: false, sentido: 1 };
  assert.equal(conAccion(lectura, pasos, "sitio"), lectura, "un paso de lectura no se completa con acciones");
  const fuera = { paso: -1, hecho: false, sentido: 1 };
  assert.equal(conAccion(fuera, pasos, "sitio"), fuera, "sin recorrido en curso no pasa nada");
});

test("la invitación se muestra hasta que se marca como vista; sin almacenamiento no insiste", () => {
  const datos = new Map();
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) };
  assert.equal(tutorialVisto(almacen), false);
  marcarTutorialVisto(almacen);
  assert.equal(datos.get(CLAVE_VISTO), "1");
  assert.equal(tutorialVisto(almacen), true);
  const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
  assert.equal(tutorialVisto(roto), true);
  assert.doesNotThrow(() => marcarTutorialVisto(roto));
});
