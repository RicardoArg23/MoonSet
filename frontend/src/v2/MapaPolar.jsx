import { useEffect, useMemo, useRef, useState } from "react";
import { cargarMapa } from "./datos";
import { evaluarVecindad, num } from "./calculo";

// Mapa 2D del polo sur visto desde arriba.
// Proyección estereográfica polar sur, la misma de backend/app/horizonte.py (_polar_sur_xy):
// lon 0° hacia arriba, lon 90° E a la derecha. En el SVG la y crece hacia abajo, por eso va con signo cambiado.

const R = 1_737_400;
const RAD = Math.PI / 180;
const PARALELOS = [-89, -88, -87, -86, -85, -84, -83, -82, -81];
const MERIDIANOS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const ESCALAS_KM = [0.5, 1, 2, 5, 10, 20, 50, 100];
const ANCHO_MIN_M = 3_000;
const corto = (nombre) => nombre.split(" — ")[0];

export function proyectar(lat, lon) {
  const r = 2 * R * Math.tan(Math.PI / 4 + (lat * RAD) / 2);
  return [r * Math.sin(lon * RAD), -r * Math.cos(lon * RAD)];
}

export function invertir(sx, sy) {
  const r = Math.hypot(sx, sy);
  const lat = (2 * Math.atan(r / (2 * R)) - Math.PI / 2) / RAD;
  const lon = ((Math.atan2(sx, -sy) / RAD) % 360 + 360) % 360;
  return { lat, lon };
}

// Punto desplazado (este, norte) metros desde (lat, lon), sobre la esfera. Igual que precalcular_vecindad.py.
function destino(lat, lon, este, norte) {
  const dist = Math.hypot(este, norte);
  if (dist === 0) return { lat, lon };
  const rumbo = Math.atan2(este, norte);
  const f1 = lat * RAD;
  const l1 = lon * RAD;
  const d = dist / R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(rumbo));
  const l2 = l1 + Math.atan2(Math.sin(rumbo) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return { lat: f2 / RAD, lon: l2 / RAD };
}

function radioDeLatitud(lat) {
  return 2 * R * Math.tan(Math.PI / 4 + (lat * RAD) / 2);
}

function latLonTexto({ lat, lon }) {
  return `${num(Math.abs(lat), 2)}° ${lat < 0 ? "S" : "N"} · ${num(lon, 2)}° E`;
}

export default function MapaPolar({ sitios, sitio, viables, sol, tierra, onElegir, onPunto, vecindad, i0, duracionH, autonomiaH, hayBackend }) {
  const [meta, setMeta] = useState(undefined); // undefined = cargando, null = no hay imagen
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [vista, setVista] = useState(null); // { cx, cy, w } en metros
  const [cursor, setCursor] = useState(null);
  const caja = useRef(null);
  const arrastre = useRef(null);

  const latLimite = meta?.lat_limite ?? -80;
  const extension = meta?.extension_m ?? radioDeLatitud(latLimite);
  const anchoMax = extension * 2.3;
  const esPolar = sitio.sitio.lat <= latLimite;

  useEffect(() => {
    let vigente = true;
    cargarMapa().catch(() => null).then((m) => vigente && setMeta(m));
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const obs = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Encuadre de todo el polo: entra a lo alto y a lo ancho, un poco corrido para que el pie no tape el borde
  const encuadreTotal = (t) => ({ cx: 0, cy: extension * 0.14, w: Math.max(extension * 2.25, (extension * 2.7 * t.w) / t.h) });

  // Vista inicial: todo el polo
  useEffect(() => {
    if (vista === null && tam.w > 0) setVista(encuadreTotal(tam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, tam, extension]);

  // Si se elige desde afuera un sitio polar que quedó fuera de la vista, se centra en él
  useEffect(() => {
    if (!vista || !esPolar || !tam.w) return;
    const [x, y] = proyectar(sitio.sitio.lat, sitio.sitio.lon);
    const h = (vista.w * tam.h) / tam.w;
    if (Math.abs(x - vista.cx) > vista.w * 0.45 || Math.abs(y - vista.cy) > h * 0.45) setVista((v) => ({ ...v, cx: x, cy: y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitio.sitio.id]);

  const polares = useMemo(() => sitios.filter((s) => s.sitio.lat <= latLimite), [sitios, latLimite]);

  const celdas = useMemo(() => {
    if (!vecindad || !esPolar) return null;
    const evaluadas = evaluarVecindad(sitio, vecindad, i0, duracionH, autonomiaH);
    const { n, paso_m: paso } = vecindad;
    const medio = Math.floor(n / 2);
    return evaluadas.map((c, k) => {
      const p = destino(sitio.sitio.lat, sitio.sitio.lon, ((k % n) - medio) * paso, (medio - Math.floor(k / n)) * paso);
      return { ...c, xy: proyectar(p.lat, p.lon), paso };
    });
  }, [vecindad, esPolar, sitio, i0, duracionH, autonomiaH]);

  // Zoom con la rueda, alrededor del cursor. El listener no puede ser pasivo para frenar el scroll.
  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const rueda = (e) => {
      e.preventDefault();
      if (!vista) return;
      const r = el.getBoundingClientRect();
      zoom(Math.exp(e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  });

  if (!vista || !tam.w) return <div className="mapa" ref={caja} />;

  const altoVista = (vista.w * tam.h) / tam.w;
  const x0 = vista.cx - vista.w / 2;
  const y0 = vista.cy - altoVista / 2;
  const mpp = vista.w / tam.w; // metros por píxel de pantalla
  const px = (n) => n * mpp;

  function limitar(v) {
    const w = Math.max(ANCHO_MIN_M, Math.min(Math.max(anchoMax, (anchoMax * tam.w) / tam.h), v.w));
    const tope = extension;
    return { w, cx: Math.max(-tope, Math.min(tope, v.cx)), cy: Math.max(-tope, Math.min(tope, v.cy)) };
  }
  function zoom(factor, fx = 0.5, fy = 0.5) {
    setVista((v) => {
      const h = (v.w * tam.h) / tam.w;
      const px0 = v.cx + (fx - 0.5) * v.w;
      const py0 = v.cy + (fy - 0.5) * h;
      const w = v.w * factor;
      const nueva = limitar({ ...v, w });
      return limitar({ w: nueva.w, cx: px0 - (fx - 0.5) * nueva.w, cy: py0 - (fy - 0.5) * (nueva.w * tam.h) / tam.w });
    });
  }
  function aMundo(e) {
    const r = caja.current.getBoundingClientRect();
    return [x0 + ((e.clientX - r.left) / r.width) * vista.w, y0 + ((e.clientY - r.top) / r.height) * altoVista];
  }

  function bajar(e) {
    if (e.button !== 0) return;
    arrastre.current = { x: e.clientX, y: e.clientY, cx: vista.cx, cy: vista.cy, movio: false, marcador: e.target.closest("[data-sitio]") };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function mover(e) {
    const [mx, my] = aMundo(e);
    const p = invertir(mx, my);
    setCursor(p.lat <= latLimite ? p : null);
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (Math.hypot(dx, dy) > 4) a.movio = true;
    if (a.movio) setVista((v) => limitar({ ...v, cx: a.cx - dx * mpp, cy: a.cy - dy * mpp }));
  }
  function soltar(e) {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movio) return;
    if (a.marcador) {
      onElegir(a.marcador.dataset.sitio);
      return;
    }
    const [mx, my] = aMundo(e);
    const p = invertir(mx, my);
    if (p.lat <= latLimite) onPunto(p);
  }

  function verTodo() {
    setVista(encuadreTotal(tam));
  }
  function irAlSitio() {
    const [x, y] = proyectar(sitio.sitio.lat, sitio.sitio.lon);
    setVista(limitar({ cx: x, cy: y, w: vecindad ? 9_000 : 30_000 }));
  }

  // Etiquetas sin superponerse: primero el sitio elegido, después el resto
  const ordenados = [...polares].sort((a, b) => (a.sitio.id === sitio.sitio.id ? -1 : b.sitio.id === sitio.sitio.id ? 1 : 0));
  const conEtiqueta = new Set();
  const ocupados = [];
  for (const s of ordenados) {
    const [x, y] = proyectar(s.sitio.lat, s.sitio.lon);
    const sx = (x - x0) / mpp;
    const sy = (y - y0) / mpp;
    if (sx < -50 || sx > tam.w + 50 || sy < -20 || sy > tam.h + 20) continue;
    if (ocupados.every(([ox, oy]) => Math.abs(ox - sx) > 150 || Math.abs(oy - sy) > 22)) {
      conEtiqueta.add(s.sitio.id);
      ocupados.push([sx, sy]);
    }
  }

  const escalaKm = ESCALAS_KM.find((k) => (k * 1000) / mpp >= 70) ?? ESCALAS_KM.at(-1);
  const verCeldas = celdas && vista.w < 40_000;
  const lejos = vista.w > extension; // con todo el polo a la vista se muestran Sol y Tierra en el borde
  const [solX, solY] = [extension * 1.06 * Math.sin(sol.lon * RAD), -extension * 1.06 * Math.cos(sol.lon * RAD)];
  const [tieX, tieY] = [extension * 1.06 * Math.sin(tierra.lon * RAD), -extension * 1.06 * Math.cos(tierra.lon * RAD)];
  const fondoDem = meta?.fuente?.startsWith("dem");

  return (
    <div className="mapa" ref={caja}>
      <svg
        className="mapa-svg"
        viewBox={`${x0} ${y0} ${vista.w} ${altoVista}`}
        role="application"
        aria-label="Mapa del polo sur lunar. Arrastrá para mover, rueda para acercar, tocá un punto para evaluarlo."
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerLeave={() => setCursor(null)}
      >
        <circle cx="0" cy="0" r={extension} fill="#16130f" />
        {meta && <image href={meta.url} x={-meta.extension_m} y={-meta.extension_m} width={meta.extension_m * 2} height={meta.extension_m * 2} preserveAspectRatio="none" />}

        <g className="mapa-grilla" strokeWidth={px(1)}>
          {PARALELOS.map((lat) => (
            <circle key={lat} cx="0" cy="0" r={radioDeLatitud(lat)} />
          ))}
          {MERIDIANOS.map((lon) => {
            const [x, y] = proyectar(latLimite, lon);
            return <line key={lon} x1="0" y1="0" x2={x} y2={y} />;
          })}
          <circle cx="0" cy="0" r={extension} className="borde" strokeWidth={px(1.5)} />
        </g>
        <g className="mapa-rotulos" fontSize={px(11)}>
          {(() => {
            // Rótulos de los paralelos solo donde entran sin pisarse (al menos 26 px entre uno y otro)
            let ultimo = -Infinity;
            return PARALELOS.map((lat) => {
              const rPx = radioDeLatitud(lat) / mpp;
              if (rPx < 40 || rPx - ultimo < 26) return null;
              ultimo = rPx;
              const [x, y] = proyectar(lat, 45);
              return <text key={lat} x={x + px(4)} y={y - px(4)}>{Math.abs(lat)}° S</text>;
            });
          })()}
          {lejos && MERIDIANOS.map((lon) => {
            const [x, y] = proyectar(latLimite + 0.25, lon);
            return <text key={lon} x={x} y={y} textAnchor="middle" dominantBaseline="middle">{lon}°</text>;
          })}
        </g>

        {verCeldas && (
          <g className="mapa-celdas">
            {celdas.map((c, k) => (
              <circle
                key={k}
                cx={c.xy[0]}
                cy={c.xy[1]}
                r={c.paso * 0.38}
                fill={c.viable ? `rgba(255,184,74,${(0.25 + (0.6 * c.luzPct) / 100).toFixed(2)})` : "rgba(255,156,138,0.22)"}
                stroke={c.viable ? "rgba(255,184,74,0.9)" : "rgba(255,156,138,0.55)"}
                strokeWidth={px(1)}
              >
                <title>{`luz ${num(c.luzPct)} % · noche más larga ${c.nocheH} h · terreno ${num(c.alturaM)} m${c.viable ? "" : " · no sirve"}`}</title>
              </circle>
            ))}
          </g>
        )}

        {lejos && (
          <g className="mapa-astros">
            <circle cx={solX} cy={solY} r={px(11)} fill="var(--acento)" />
            <circle cx={solX} cy={solY} r={px(20)} fill="var(--acento)" opacity="0.2" />
            <text x={solX} y={solY + px(30)} textAnchor="middle" fontSize={px(12)}>Sol</text>
            <circle cx={tieX} cy={tieY} r={px(9)} fill="var(--tierra)" />
            <text x={tieX} y={tieY + px(26)} textAnchor="middle" fontSize={px(12)}>Tierra</text>
          </g>
        )}

        <g className="mapa-sitios">
          {polares.map((s) => {
            const [x, y] = proyectar(s.sitio.lat, s.sitio.lon);
            const elegido = s.sitio.id === sitio.sitio.id;
            const sirve = viables.has(s.sitio.id);
            return (
              <g
                key={s.sitio.id}
                data-sitio={s.sitio.id}
                className={`mapa-sitio${elegido ? " elegido" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${corto(s.sitio.nombre)}: ${sirve ? "sirve" : "no sirve"} en la fecha elegida`}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onElegir(s.sitio.id)}
              >
                {elegido && <circle cx={x} cy={y} r={px(13)} fill="none" stroke="#fff" strokeWidth={px(2)} />}
                <circle cx={x} cy={y} r={px(elegido ? 8 : 6.5)} fill={sirve ? "var(--acento)" : "#8f8a82"} stroke="#000" strokeWidth={px(1.5)} />
                {conEtiqueta.has(s.sitio.id) && (
                  <text x={x + px(16)} y={y + px(4)} fontSize={px(elegido ? 13 : 12)} fontWeight={elegido ? 600 : 400}>
                    {corto(s.sitio.nombre)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        <rect x={x0 + px(20)} y={y0 + altoVista - px(30)} width={(escalaKm * 1000)} height={px(3)} fill="var(--texto)" />
        <text x={x0 + px(20)} y={y0 + altoVista - px(38)} fontSize={px(11)} className="mapa-escala">{escalaKm} km</text>
      </svg>

      <div className="mapa-controles">
        <button type="button" className="vidrio" onClick={verTodo}>Todo el polo</button>
        <button type="button" className="vidrio" onClick={irAlSitio} disabled={!esPolar}>Ir al sitio</button>
        <button type="button" className="vidrio redondo" onClick={() => zoom(0.6)} aria-label="Acercar">+</button>
        <button type="button" className="vidrio redondo" onClick={() => zoom(1 / 0.6)} aria-label="Alejar">−</button>
      </div>

      <Brujula sol={sol} tierra={tierra} />

      <div className="mapa-pie vidrio">
        {!esPolar ? (
          <p><b>{corto(sitio.sitio.nombre)}</b> está fuera del mapa: este mapa cubre el polo sur, al sur de {Math.abs(latLimite)}° S. Miralo en el Globo.</p>
        ) : (
          <p>
            {hayBackend ? "Tocá el mapa para probar un punto. " : "Tocá un sitio para elegirlo. "}
            {celdas ? (verCeldas ? "Cuadros: la misma misión a pocos cientos de metros (ámbar sirve, rojo no)." : "Acercate al sitio para ver sus alrededores.") : ""}
          </p>
        )}
        <p className="tenue mapa-datos">
          <span className="mapa-leyenda"><i style={{ background: "var(--acento)" }} />Sirve en la fecha elegida</span>
          <span className="mapa-leyenda"><i style={{ background: "#8f8a82" }} />No sirve</span>
          <span>{cursor ? latLonTexto(cursor) : " "}</span>
        </p>
        <p className="tenue mapa-fuente">
          {meta === null
            ? "Sin imagen de fondo: corré backend/scripts/generar_mapa_polo.py"
            : fondoDem
              ? "Fondo: relieve sombreado de LOLA a 80 m (luz cartográfica, no la iluminación real)"
              : "Fondo: textura LROC de baja resolución. Con el DEM, generar_mapa_polo.py da el relieve real"}
        </p>
      </div>
    </div>
  );
}

// Hacia dónde están el Sol y la Tierra vistos desde el polo, con la misma orientación que el mapa
function Brujula({ sol, tierra }) {
  const flecha = (lon, largo) => [Math.sin(lon * RAD) * largo, -Math.cos(lon * RAD) * largo];
  const [sx, sy] = flecha(sol.lon, 30);
  const [tx, ty] = flecha(tierra.lon, 30);
  return (
    <div className="mapa-brujula vidrio" role="img" aria-label={`El Sol está hacia la longitud ${num(sol.lon)}° y la Tierra hacia ${num(tierra.lon)}°`}>
      <svg viewBox="-44 -44 88 88" width="88" height="88">
        <circle r="36" fill="none" stroke="var(--borde-fuerte)" />
        <text y="-38" textAnchor="middle" fontSize="8" fill="var(--tenue)">0°</text>
        <line x1="0" y1="0" x2={tx} y2={ty} stroke="var(--tierra)" strokeWidth="2" />
        <circle cx={tx} cy={ty} r="4.5" fill="var(--tierra)" />
        <line x1="0" y1="0" x2={sx} y2={sy} stroke="var(--acento)" strokeWidth="2" />
        <circle cx={sx} cy={sy} r="5.5" fill="var(--acento)" />
        <circle r="2" fill="var(--texto)" />
      </svg>
      <p><span style={{ color: "var(--acento)" }}>Sol</span> y <span style={{ color: "var(--tierra)" }}>Tierra</span> vistos desde el polo</p>
    </div>
  );
}
