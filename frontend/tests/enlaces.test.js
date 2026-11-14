// Tests de los enlaces a herramientas de NASA: npm test (node:test, sin librerías).
import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceHorizons, enlaceMoonTrek, enlaceQuickmap, enlacesNasa, fechaHorizons, lonEste180, lonEste360, proyeccion, textoCoordenadas } from "../src/v2/enlaces.js";

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

test("el enlace de Horizons lleva los mismos parámetros que validar_horizons.py", () => {
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
    CSV_FORMAT: "'YES'",
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
  const { url, deepLink } = enlaceMoonTrek({ lat: 0.67408, lon: 23.47297 });
  assert.equal(deepLink, true);
  const [base, hash] = url.split("#");
  assert.equal(base, "https://trek.nasa.gov/moon/");
  const p = new URLSearchParams(hash);
  assert.equal(p.get("x"), "23.47297");
  assert.equal(p.get("y"), "0.67408");
  assert.equal(p.get("p"), "urn:ogc:def:crs:EPSG::104903");
  assert.equal(p.get("b"), "moon");
  assert.equal(p.has("e"), false);
  assert.equal(new URLSearchParams(enlaceMoonTrek({ lat: -89.45, lon: 222.69 }).url.split("#")[1]).get("x"), "-137.31");
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

test("cerca del polo el rectángulo de QuickMap no pasa de 90° y se avisa que falta la vista polar", () => {
  const m = (1_737_400 * Math.PI) / 180;
  const e = enlaceQuickmap({ lat: -89.45, lon: 222.69 });
  const [, y0] = new URL(e.url).searchParams.get("prjExtent").split(",").map(Number);
  assert.ok(y0 >= -90 * m - 1);
  assert.equal(e.vistaPolarPendiente, true);
  assert.equal(enlaceQuickmap({ lat: 0.67408, lon: 23.47297 }).vistaPolarPendiente, false);
});
