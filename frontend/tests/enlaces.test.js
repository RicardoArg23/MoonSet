// Tests de los enlaces a herramientas de NASA: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  centroPolar, desproyectarPolar, enlaceHorizons, enlaceMoonTrek, enlaceQuickmap, enlacesNasa, fechaHorizons, lonEste180, lonEste360,
  proyeccion, textoCoordenadas, VALIDACION_ERROR_MAX_DEG, VALIDACION_ERROR_TOPE_DEG,
} from "../src/v2/enlaces.js";

const LLEGADA = Date.UTC(2027, 4, 2, 0, 0); // 2 de mayo de 2027, 00:00 UTC
const FIN = LLEGADA + 14 * 24 * 3_600_000;

test("la longitud se pasa al este en 0..360", () => {
  assert.equal(lonEste360(-23.42157), 336.57843);
  assert.equal(lonEste360(222.69), 222.69);
  assert.equal(lonEste360(360), 0);
});

test("las fechas van en UTC con el formato de Horizons", () => {
  assert.equal(fechaHorizons(LLEGADA), "2027-05-02 00:00");
  assert.equal(fechaHorizons(FIN), "2027-05-16 00:00");
});

test("el enlace de Horizons lleva los parámetros de validar_horizons.py, en tabla alineada", () => {
  const url = new URL(enlaceHorizons({ lat: -3.01239, lon: -23.42157, inicioMs: LLEGADA, finMs: FIN, cuerpo: "tierra" }));
  assert.equal(url.origin + url.pathname, "https://ssd.jpl.nasa.gov/api/horizons.api");
  const p = Object.fromEntries(url.searchParams);
  assert.deepEqual(p, {
    format: "text",
    COMMAND: "'399'",
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: "'336.57843,-3.01239,0'",
    START_TIME: "'2027-05-02 00:00'",
    STOP_TIME: "'2027-05-16 00:00'",
    STEP_SIZE: "'1 h'",
    TIME_TYPE: "'UT'",
    QUANTITIES: "'4'",
    CSV_FORMAT: "'NO'",
    ANG_FORMAT: "'DEG'",
    EXTRA_PREC: "'YES'",
  });
});

test("Sol y Tierra solo cambian el cuerpo", () => {
  const e = enlacesNasa({ lat: -89.45, lon: 222.69, inicioMs: LLEGADA, finMs: FIN });
  assert.match(e.horizons.sol, /COMMAND=%2710%27/);
  assert.match(e.horizons.tierra, /COMMAND=%27399%27/);
  assert.equal(e.horizons.sol.replace("%2710%27", "%27399%27"), e.horizons.tierra);
});

test("al sur de 80° S se usa la proyección polar sur", () => {
  assert.equal(proyeccion(-89.45), "polar-sur");
  assert.equal(proyeccion(-80.13), "polar-sur");
  assert.equal(proyeccion(-69.37), "equirectangular");
  assert.equal(proyeccion(0.67408), "equirectangular");
});

test("las coordenadas para el buscador de QuickMap van en lat, lon este -180..180", () => {
  assert.equal(lonEste180(222.69), -137.31);
  assert.equal(textoCoordenadas(-89.45, 222.69), "-89.45, -137.31");
  assert.equal(textoCoordenadas(0.67408, 23.47297), "0.6741, 23.473");
});

test("Moon Trek centra en x = longitud este -180..180, y = latitud, vista geográfica", () => {
  const { url, vista } = enlaceMoonTrek({ lat: 0.67408, lon: 23.47297 });
  assert.equal(vista, "geografica");
  const [base, hash] = url.split("#");
  assert.equal(base, "https://trek.nasa.gov/moon/");
  const p = new URLSearchParams(hash);
  assert.equal(p.get("x"), "23.47297");
  assert.equal(p.get("y"), "0.67408");
  assert.equal(p.get("p"), "urn:ogc:def:crs:EPSG::104903");
  assert.equal(p.get("b"), "moon");
  assert.equal(p.has("e"), false);
  assert.equal(enlaceMoonTrek({ lat: 0.67408, lon: 23.47297 }).vista, "geografica");
});

test("QuickMap arma un rectángulo en metros centrado en el sitio", () => {
  const m = (1_737_400 * Math.PI) / 180;
  const url = new URL(enlaceQuickmap({ lat: 22.387, lon: 37.294 }).url);
  assert.equal(url.origin, "https://quickmap.lroc.im-ldi.com");
  assert.equal(url.searchParams.get("proj"), "10");
  const [x0, y0, x1, y1] = url.searchParams.get("prjExtent").split(",").map(Number);
  assert.ok(Math.abs((x0 + x1) / 2 / m - 37.294) < 1e-3);
  assert.ok(Math.abs((y0 + y1) / 2 / m - 22.387) < 1e-3);
});

// Sitios polares de la lista (data/sitios.json) y el centro de las URLs reales que se usaron de referencia.
const POLARES = [
  { nombre: "Connecting Ridge", lat: -89.45, lon: 222.69 },
  { nombre: "Borde de Shackleton", lat: -89.78, lon: 204.27 },
  { nombre: "Macizo Malapert", lat: -85.9876, lon: 2.0528 },
  { nombre: "IM-1 Odysseus", lat: -80.13, lon: 1.44 },
];
const mismaLonEste = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("el centro polar, desproyectado, da la lat/lon del sitio", () => {
  for (const s of POLARES) {
    const { x, y } = centroPolar(s.lat, s.lon);
    const v = desproyectarPolar(x, y);
    assert.ok(Math.abs(v.lat - s.lat) < 1e-6, s.nombre);
    assert.ok(mismaLonEste(v.lon, s.lon) < 1e-4, s.nombre);
  }
});

test("la proyección es la de las URLs reales de Moon Trek y QuickMap (centro cerca de Shackleton)", () => {
  // Moon Trek: x=6805.77, y=-6471.63 -> 89,69° S 133,6° E. QuickMap: centro del prjExtent -> 89,63° S 137,1° E.
  const mt = desproyectarPolar(6805.77457109595, -6471.632537841384);
  assert.ok(Math.abs(mt.lat + 89.69) < 0.01 && Math.abs(mt.lon - 133.56) < 0.1);
  const qm = desproyectarPolar((-15131.4882299 + 30508.6790547) / 2, (-20485.9153772 + 3955.9000976) / 2);
  assert.ok(Math.abs(qm.lat + 89.63) < 0.01 && Math.abs(qm.lon - 137.07) < 0.1);
});

test("Moon Trek polar: x, y del sitio en metros, IAU2000:30120 y sin extensión", () => {
  for (const s of POLARES) {
    const e = enlaceMoonTrek(s);
    assert.equal(e.vista, "polar-sur");
    const p = new URLSearchParams(e.url.split("#")[1]);
    assert.equal(p.get("p"), "urn:ogc:def:crs:IAU2000::30120");
    assert.equal(p.get("b"), "moon");
    assert.equal(p.get("z"), "8");
    assert.equal(p.has("e"), false);
    const v = desproyectarPolar(Number(p.get("x")), Number(p.get("y")));
    assert.ok(Math.abs(v.lat - s.lat) < 1e-5 && mismaLonEste(v.lon, s.lon) < 1e-3, s.nombre);
  }
});

test("QuickMap polar: proj=27 y un rectángulo de 40 x 25 km centrado en el sitio, sin stack ni defs", () => {
  for (const s of POLARES) {
    const e = enlaceQuickmap(s);
    assert.equal(e.vista, "polar-sur");
    const url = new URL(e.url);
    assert.equal(url.searchParams.get("proj"), "27");
    assert.equal(url.searchParams.has("stack"), false);
    assert.equal(url.searchParams.has("defs"), false);
    const [x0, y0, x1, y1] = url.searchParams.get("prjExtent").split(",").map(Number);
    assert.ok(Math.abs(x1 - x0 - 40_000) < 1 && Math.abs(y1 - y0 - 25_000) < 1);
    const v = desproyectarPolar((x0 + x1) / 2, (y0 + y1) / 2);
    assert.ok(Math.abs(v.lat - s.lat) < 1e-5 && mismaLonEste(v.lon, s.lon) < 1e-3, s.nombre);
  }
});

test("al norte de 80° S los visores siguen en vista geográfica", () => {
  for (const s of [{ lat: -69.373, lon: 32.319 }, { lat: 0.67408, lon: 23.47297 }]) {
    assert.equal(enlaceMoonTrek(s).vista, "geografica");
    assert.equal(new URL(enlaceQuickmap(s).url).searchParams.get("proj"), "10");
  }
});

test("el sello de validación usa los valores de docs/VALIDACION.md", () => {
  const doc = readFileSync(new URL("../../docs/VALIDACION.md", import.meta.url), "utf-8");
  const global = doc.split("## Global")[1].split("##")[0];
  const filas = global.split(/\r?\n/).filter((l) => /^\| (sol|tierra) \|/.test(l));
  assert.equal(filas.length, 2);
  // Columnas: Cuerpo | Δaz máx | Δaz medio | Δel máx | Δel medio | Sep. máx
  const maximo = Math.max(...filas.flatMap((l) => l.split("|").slice(2, -1).map(Number)));
  assert.equal(maximo, VALIDACION_ERROR_MAX_DEG);
  assert.ok(maximo < VALIDACION_ERROR_TOPE_DEG);
});
