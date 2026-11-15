// Genera public/validacion.html a partir de ../data/validacion/horizons.json (la salida de backend/scripts/validar_horizons.py).
// Es la página a la que lleva el sello «Validado contra JPL Horizons»: no se edita a mano, se regenera en cada dev/build.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = resolve(aqui, "../../data/validacion/horizons.json");
const nombres = resolve(aqui, "../../data/sitios.json");
const destino = resolve(aqui, "../public/validacion.html");

if (!existsSync(origen)) {
  console.warn(`[generar-validacion] No existe ${origen}. Corré backend/scripts/validar_horizons.py primero.`);
  process.exit(0);
}

const datos = JSON.parse(readFileSync(origen, "utf8"));
const nombreDe = new Map(existsSync(nombres) ? JSON.parse(readFileSync(nombres, "utf8")).sitios.map((s) => [s.id, s.nombre]) : []);
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const grados = (x) => (x ?? 0).toFixed(5);
const coord = (x) => x.toFixed(4);
const instante = (iso) => iso.replace("T", " ").replace(/:00Z$/, "").replace("Z", "");

const { metadatos: meta, global: global_, sitios, fuera_de_umbral: fuera } = datos;
const maximo = Math.max(...["sol", "tierra"].flatMap((c) => ["azimut", "elevacion", "separacion"].map((m) => global_[c][m].max)));
const nombreCuerpo = { sol: ["Sol", "Sun"], tierra: ["Tierra", "Earth"] };
const cuerpo = (c) => `<span data-es="${nombreCuerpo[c][0]}" data-en="${nombreCuerpo[c][1]}">${nombreCuerpo[c][0]}</span>`;
const sitio = (id) => esc(nombreDe.get(id) ?? id);

const cabecera = `<thead><tr><th data-es="Cuerpo" data-en="Body">Cuerpo</th><th>Δaz máx</th><th>Δaz medio</th><th>Δel máx</th><th>Δel medio</th><th>Sep. máx</th></tr></thead>`;
const filaGlobal = (c) => `<tr><td>${cuerpo(c)}</td>${["azimut", "elevacion"].map((m) => `<td>${grados(global_[c][m].max)}</td><td>${grados(global_[c][m].medio)}</td>`).join("")}<td>${grados(global_[c].separacion.max)}</td></tr>`;

const cabeceraSitios = `<thead><tr><th data-es="Sitio" data-en="Site">Sitio</th><th>Lat</th><th>Lon E</th><th data-es="Cuerpo" data-en="Body">Cuerpo</th><th>Δaz máx</th><th>Δaz medio</th><th>Δel máx</th><th>Δel medio</th><th>Sep. máx</th></tr></thead>`;
const filasSitios = sitios.flatMap((s) => ["sol", "tierra"].map((c) => {
  const r = s.resumen[c];
  return `<tr><td>${sitio(s.id)}</td><td>${coord(s.lat)}</td><td>${coord(s.lon)}</td><td>${cuerpo(c)}</td><td>${grados(r.azimut.max)}</td><td>${grados(r.azimut.medio)}</td><td>${grados(r.elevacion.max)}</td><td>${grados(r.elevacion.medio)}</td><td>${grados(r.separacion.max)}</td></tr>`;
})).join("");

const detalle = sitios.map((s) => {
  const filas = ["sol", "tierra"].flatMap((c) => s.cuerpos[c].map((m) => `<tr><td>${cuerpo(c)}</td><td>${instante(m.tiempo)}</td><td>${m.horizons.azimut.toFixed(5)}</td><td>${m.horizons.elevacion.toFixed(5)}</td><td>${m.nuestro.azimut.toFixed(5)}</td><td>${m.nuestro.elevacion.toFixed(5)}</td><td>${grados(m.dif_azimut)}</td><td>${grados(m.dif_elevacion)}</td><td>${grados(m.separacion)}</td></tr>`)).join("");
  return `<details><summary>${sitio(s.id)} <small>${coord(s.lat)}°, ${coord(s.lon)}° E</small></summary><div class="tabla"><table><thead><tr><th data-es="Cuerpo" data-en="Body">Cuerpo</th><th data-es="Instante (UTC)" data-en="Instant (UTC)">Instante (UTC)</th><th>Horizons az</th><th>Horizons el</th><th data-es="Nuestro az" data-en="Ours az">Nuestro az</th><th data-es="Nuestro el" data-en="Ours el">Nuestro el</th><th>Δaz</th><th>Δel</th><th>Sep.</th></tr></thead><tbody>${filas}</tbody></table></div></details>`;
}).join("");

const sinCasos = !fuera || fuera.length === 0;
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MoonSet · Validación contra JPL Horizons</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap">
<style>
  :root { color-scheme: dark; --texto: #f5f2ec; --texto-2: #cfc9bf; --tenue: #a9a39a; --borde: rgba(255,255,255,.12); --relleno: rgba(255,255,255,.05); --acento: #ffb84a; --bien: #7bdca2; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #000 radial-gradient(55% 40% at 78% 0, rgba(255,176,64,.13), rgba(255,176,64,0) 70%) no-repeat; color: var(--texto); font: 400 15px/1.5 "Outfit", system-ui, sans-serif; font-variant-numeric: tabular-nums; }
  main > * { min-width: 0; }
  main { max-width: 1040px; margin: 0 auto; padding: 28px max(20px, env(safe-area-inset-right)) 64px max(20px, env(safe-area-inset-left)); display: grid; gap: 28px; }
  .barra { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  a { color: var(--texto-2); }
  .volver, .idioma button { border: 1px solid var(--borde); border-radius: 999px; padding: 7px 16px; font: inherit; font-size: 14px; color: var(--texto); background: transparent; text-decoration: none; cursor: pointer; }
  .volver:hover, .idioma button:hover { border-color: rgba(255,255,255,.5); }
  .idioma { display: flex; gap: 6px; }
  .idioma button[aria-pressed="true"] { background: var(--texto); color: #14110d; font-weight: 600; }
  h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 500; letter-spacing: -0.03em; line-height: 1.05; }
  h2 { margin: 0 0 10px; font-size: 1.15rem; font-weight: 500; letter-spacing: -0.01em; }
  .sello { display: flex; flex-wrap: wrap; gap: 10px 28px; padding: 16px 20px; border: 1px solid var(--borde); border-radius: 18px; background: var(--relleno); }
  .sello div { display: grid; }
  .sello b { font-size: 1.7rem; font-weight: 500; letter-spacing: -0.02em; }
  .sello small { color: var(--tenue); font-size: 13px; }
  .bien { color: var(--bien); }
  ul { margin: 0; padding-left: 1.1em; color: var(--texto-2); display: grid; gap: 4px; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .88em; color: var(--texto); }
  .tabla { overflow-x: auto; border: 1px solid var(--borde); border-radius: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { padding: 8px 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--borde); }
  th:first-child, td:first-child, .sitios th:nth-child(4), .sitios td:nth-child(4) { text-align: left; }
  th { color: var(--tenue); font-weight: 400; font-size: 12.5px; background: var(--relleno); }
  tbody tr:last-child td { border-bottom: 0; }
  details { border: 1px solid var(--borde); border-radius: 14px; padding: 4px 14px; }
  details + details { margin-top: 8px; }
  summary { cursor: pointer; padding: 10px 0; }
  summary small { color: var(--tenue); margin-left: 8px; }
  details[open] summary { border-bottom: 1px solid var(--borde); margin-bottom: 12px; }
  details .tabla { margin-bottom: 12px; }
  .pie { color: var(--tenue); font-size: 13px; }
</style>
</head>
<body>
<main>
  <div class="barra">
    <a class="volver" href="./" data-es="← Volver a MoonSet" data-en="← Back to MoonSet">← Volver a MoonSet</a>
    <div class="idioma" role="group" aria-label="Idioma / Language"><button type="button" data-lang="es" aria-pressed="true">ES</button><button type="button" data-lang="en" aria-pressed="false">EN</button></div>
  </div>

  <header>
    <h1 data-es="Validación contra JPL Horizons" data-en="Validation against JPL Horizons">Validación contra JPL Horizons</h1>
  </header>

  <section class="sello" aria-label="Resumen">
    <div><b class="bien">${grados(maximo)}°</b><small data-es="error máximo, de todos los casos" data-en="maximum error, across all cases">error máximo, de todos los casos</small></div>
    <div><b>${esc(meta.umbral_deg)}°</b><small data-es="umbral de aceptación" data-en="acceptance threshold">umbral de aceptación</small></div>
    <div><b class="${sinCasos ? "bien" : ""}">${sinCasos ? "0" : fuera.length}</b><small data-es="casos sobre el umbral" data-en="cases over the threshold">casos sobre el umbral</small></div>
    <div><b>${sitios.length * meta.fechas_utc.length * 2}</b><small data-es="comparaciones (sitios × instantes × Sol y Tierra)" data-en="comparisons (sites × instants × Sun and Earth)">comparaciones (sitios × instantes × Sol y Tierra)</small></div>
  </section>

  <section>
    <h2 data-es="Cómo se validó" data-en="How it was validated">Cómo se validó</h2>
    <ul>
      <li><span data-es="Horizons: efemérides" data-en="Horizons: ephemerides">Horizons: efemérides</span> ${esc(meta.horizons_efemerides)}, <span data-es="marco lunar" data-en="lunar frame">marco lunar</span> ${esc(meta.horizons_marco)}, <span data-es="consultado" data-en="queried">consultado</span> ${esc(meta.horizons_consultado)}.</li>
      <li><span data-es="MoonSet:" data-en="MoonSet:">MoonSet:</span> ${esc(meta.nuestro)} (<code>backend/app/efemerides.py</code>).</li>
      <li>${sitios.length} <span data-es="sitios" data-en="sites">sitios</span> × ${meta.fechas_utc.length} <span data-es="instantes UTC" data-en="UTC instants">instantes UTC</span> × <span data-es="Sol y Tierra" data-en="Sun and Earth">Sol y Tierra</span>: ${meta.fechas_utc.map((f) => esc(instante(f))).join("; ")}.</li>
      <li data-es="Errores en grados, nosotros − Horizons. Sep. es la distancia angular entre las dos direcciones (no depende de lo mal definido que está el azimut cerca del cenit)." data-en="Errors in degrees, ours − Horizons. Sep. is the angular distance between the two directions (it does not depend on how ill-defined the azimuth is near the zenith).">Errores en grados, nosotros − Horizons. Sep. es la distancia angular entre las dos direcciones (no depende de lo mal definido que está el azimut cerca del cenit).</li>
      <li><span data-es="Umbral:" data-en="Threshold:">Umbral:</span> ${esc(meta.umbral_deg)}°.</li>
    </ul>
  </section>

  <section>
    <h2 data-es="Global" data-en="Overall">Global</h2>
    <div class="tabla"><table>${cabecera}<tbody>${filaGlobal("sol")}${filaGlobal("tierra")}</tbody></table></div>
  </section>

  <section>
    <h2 data-es="Casos sobre el umbral" data-en="Cases over the threshold">Casos sobre el umbral</h2>
    ${sinCasos ? '<p class="bien" data-es="Ninguno." data-en="None.">Ninguno.</p>' : `<pre>${esc(JSON.stringify(fuera, null, 1))}</pre>`}
  </section>

  <section>
    <h2 data-es="Resumen por sitio" data-en="Summary by site">Resumen por sitio</h2>
    <div class="tabla sitios"><table>${cabeceraSitios}<tbody>${filasSitios}</tbody></table></div>
  </section>

  <section>
    <h2 data-es="Detalle por instante" data-en="Detail by instant">Detalle por instante</h2>
    ${detalle}
  </section>

  <p class="pie" data-es="Página generada a partir de data/validacion/horizons.json (salida de backend/scripts/validar_horizons.py); no se edita a mano." data-en="Page generated from data/validacion/horizons.json (output of backend/scripts/validar_horizons.py); not edited by hand.">Página generada a partir de data/validacion/horizons.json (salida de backend/scripts/validar_horizons.py); no se edita a mano.</p>
</main>
<script>
  // Mismo idioma que la app (moonset.idioma); el botón lo cambia para esta página.
  (function () {
    var idioma = "es";
    try { if (localStorage.getItem("moonset.idioma") === "en") idioma = "en"; } catch (_) {}
    function aplicar(l) {
      document.documentElement.lang = l;
      document.querySelectorAll("[data-" + l + "]").forEach(function (e) { e.textContent = e.getAttribute("data-" + l); });
      document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === l)); });
      document.title = l === "en" ? "MoonSet · Validation against JPL Horizons" : "MoonSet · Validación contra JPL Horizons";
    }
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.addEventListener("click", function () { idioma = b.getAttribute("data-lang"); try { localStorage.setItem("moonset.idioma", idioma); } catch (_) {} aplicar(idioma); });
    });
    aplicar(idioma);
  })();
</script>
</body>
</html>
`;

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, html);
console.log(`[generar-validacion] ${origen} -> ${destino}`);
