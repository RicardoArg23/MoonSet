// Escena de la pantalla de inicio: la Luna abajo a la izquierda y, fijos en el cielo, las estrellas, el Sol y la Tierra.
// Arrastrar o girar la rueda hace orbitar la vista alrededor de la Luna. Three.js a mano (sin React): es un fondo
// que vive por cuadro y no comparte estado con la interfaz salvo las cuatro funciones que devuelve crearEspacio().
import * as THREE from "three";
import { latLonAVector } from "../Globo";

const BASE = import.meta.env.BASE_URL;
const LEJOS = 600; // distancia de los astros, en radios lunares
const CAMPO = 14; // campo visual vertical en grados: angosto, para que la Luna se vea casi sin perspectiva
const ANCHO_ANGOSTO = 860; // px: por debajo la pantalla se apila (mismo corte que inicio.css)
// La Tierra queda siempre sobre el centro de la cara visible. La posición del Sol es ILUSTRATIVA (sobre el ecuador
// lunar, como el Sol real) y la luz sobre la Luna es fija respecto de la pantalla: decoración, no un cálculo.
const DIR_TIERRA = latLonAVector(0, 0);
const DIR_SOL = latLonAVector(-1.5, 150);
const POLO_SUR = latLonAVector(-89.67, 129); // borde del cráter Shackleton
const RADIO_TIERRA = LEJOS * Math.tan(THREE.MathUtils.degToRad(0.8)); // tamaño aparente ilustrativo (el real es 0,95°)
const LUZ_PANTALLA = new THREE.Vector3(-0.55, 0.8, 0.6); // de dónde viene la luz, en ejes de cámara
const FRENO = 0.955; // inercia del giro: fracción de velocidad que queda en cada cuadro
const DERIVA = 0.00005; // giro propio muy lento, en radianes por cuadro
const ESTRELLAS = [[44000, 1.5, 0.5], [16000, 2.3, 0.8], [3600, 3.6, 1]]; // cantidad, tamaño en px, opacidad
const EJE_X = new THREE.Vector3(1, 0, 0);
const EJE_Y = new THREE.Vector3(0, 1, 0);
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

function disco(paradas, lado) {
  const c = document.createElement("canvas");
  c.width = c.height = lado;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(lado / 2, lado / 2, 0, lado / 2, lado / 2, lado / 2);
  for (const [pos, color] of paradas) grad.addColorStop(pos, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, lado, lado);
  const textura = new THREE.CanvasTexture(c);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

// Círculo máximo perpendicular a `normal`: los puntos de la Luna que ven a ese astro justo en el horizonte.
function circuloMaximo(normal, color) {
  const a = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const b = normal.clone().cross(a);
  const puntos = [];
  for (let i = 0; i <= 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    puntos.push(a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)).multiplyScalar(1.004));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 }));
}

function grillaCoordenadas() {
  const puntos = [];
  for (let lon = 0; lon < 360; lon += 30) for (let lat = -90; lat < 90; lat += 3) puntos.push(latLonAVector(lat, lon), latLonAVector(lat + 3, lon));
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon < 360; lon += 3) puntos.push(latLonAVector(lat, lon), latLonAVector(lat, lon + 3));
  const grilla = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(puntos), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  grilla.scale.setScalar(1.003);
  return grilla;
}

function cieloEstrellado(dpr) {
  let semilla = 20261114;
  const azar = () => (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296;
  const brillo = disco([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.8)"], [1, "rgba(255,255,255,0)"]], 32);
  return ESTRELLAS.map(([cantidad, tam, opacidad]) => {
    const pos = new Float32Array(cantidad * 3);
    const col = new Float32Array(cantidad * 3);
    for (let i = 0; i < cantidad; i++) {
      const z = azar() * 2 - 1, a = azar() * Math.PI * 2, r = Math.sqrt(1 - z * z), tinte = azar(), luz = 0.55 + azar() * 0.45;
      pos.set([r * Math.cos(a) * 1500, z * 1500, r * Math.sin(a) * 1500], i * 3);
      col.set(tinte > 0.9 ? [luz, luz * 0.84, luz * 0.66] : tinte < 0.12 ? [luz * 0.75, luz * 0.84, luz] : [luz, luz, luz], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ map: brillo, size: tam * dpr, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: opacidad, depthWrite: false }));
  });
}

/**
 * @param {HTMLCanvasElement} lienzo
 * @param {{ polo: HTMLElement, sol: HTMLElement, tierra: HTMLElement }} rotulos  etiquetas HTML que siguen a cada cuerpo
 * @param {{ sol: HTMLElement, tierra: HTMLElement, sitios: HTMLElement }} leyenda  ítems cuya opacidad acompaña a las trazas
 * @returns {{ irA(astro: "sol" | "tierra"): void, sobre(clave: "titulo" | "explorar" | "planificar", activo: boolean): void, ponerSitios(lista: {lat: number, lon: number}[]): void, destruir(): void } | null}
 *          null si el navegador no puede crear el contexto WebGL
 */
export function crearEspacio(lienzo, rotulos, leyenda) {
  let render;
  try {
    render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true });
  } catch {
    return null;
  }
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  render.setPixelRatio(dpr);
  render.setClearColor(0x000000, 1);
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(CAMPO, 1, 0.3, 3000);
  const cargador = new THREE.TextureLoader();

  // La misma imagen de la Luna que usa el globo de la app.
  const texLuna = cargador.load(`${BASE}texturas/luna_wac_4k.jpg`);
  texLuna.colorSpace = THREE.SRGBColorSpace;
  texLuna.anisotropy = render.capabilities.getMaxAnisotropy();
  escena.add(new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), new THREE.MeshLambertMaterial({ map: texLuna })));

  // Trazas: grilla cada 30°, líneas donde el Sol y la Tierra quedan en el horizonte, sitios de alunizaje.
  const grilla = grillaCoordenadas();
  const lineas = [circuloMaximo(DIR_SOL, 0xffb84a), circuloMaximo(DIR_TIERRA, 0x6faef0)];
  const sitios = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: disco([[0, "rgba(255,255,255,1)"], [0.55, "rgba(255,255,255,1)"], [0.7, "rgba(255,255,255,0)"], [1, "rgba(255,255,255,0)"]], 64),
      color: 0xf6f1e9, size: 13 * dpr, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
    })
  );
  escena.add(grilla, ...lineas, sitios);

  // Intensidades por π: desde three r155 las luces son físicas y Lambert divide por π.
  const luz = new THREE.DirectionalLight(0xfff4e6, 1.55 * Math.PI);
  escena.add(luz, new THREE.AmbientLight(0xffffff, 0.07 * Math.PI));

  const sol = new THREE.Sprite(new THREE.SpriteMaterial({
    map: disco([[0, "rgba(255,255,255,1)"], [0.05, "rgba(255,250,235,1)"], [0.09, "rgba(255,220,160,.55)"], [0.25, "rgba(255,190,100,.16)"], [0.6, "rgba(255,170,80,.04)"], [1, "rgba(255,170,80,0)"]], 512),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  sol.position.copy(DIR_SOL).multiplyScalar(LEJOS);
  sol.scale.setScalar(LEJOS * 0.15);

  const texTierra = cargador.load(`${BASE}texturas/tierra_bmng_1k.jpg`);
  texTierra.colorSpace = THREE.SRGBColorSpace;
  const tierra = new THREE.Mesh(new THREE.SphereGeometry(RADIO_TIERRA, 64, 32), new THREE.MeshLambertMaterial({ map: texTierra }));
  tierra.position.copy(DIR_TIERRA).multiplyScalar(LEJOS);
  tierra.rotation.set(0.35, 2.2, 0.2);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: disco([[0, "rgba(111,174,240,.5)"], [0.36, "rgba(111,174,240,.42)"], [0.48, "rgba(111,174,240,.12)"], [0.7, "rgba(111,174,240,0)"], [1, "rgba(111,174,240,0)"]], 256),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.position.copy(DIR_TIERRA).multiplyScalar(LEJOS * 1.02);
  halo.scale.setScalar(RADIO_TIERRA * 4.4);
  escena.add(sol, halo, tierra, ...cieloEstrellado(dpr));

  // ---- Encuadre: el centro de la Luna queda cerca de la esquina inferior izquierda ----
  const vista = new THREE.Quaternion(); // orientación de la cámara, que orbita la Luna
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const P_SOL = DIR_SOL.clone().multiplyScalar(LEJOS);
  const P_TIERRA = DIR_TIERRA.clone().multiplyScalar(LEJOS);
  let ancho = 0, alto = 0, angosto = false, radioPx = 400, foco = 1000, distancia = 3, centro = { x: 0, y: 0 };

  function medir() {
    ancho = lienzo.clientWidth;
    alto = lienzo.clientHeight;
    if (ancho === 0 || alto === 0) return;
    angosto = ancho <= ANCHO_ANGOSTO;
    radioPx = angosto ? ancho * 0.62 : Math.min(alto * 0.62, ancho * 0.34);
    centro = angosto ? { x: ancho / 2, y: alto + radioPx * 0.02 } : { x: ancho * 0.16, y: alto * 1.02 };
    foco = alto / 2 / Math.tan(THREE.MathUtils.degToRad(CAMPO / 2));
    const k = radioPx / foco;
    distancia = Math.sqrt(1 + k * k) / k;
    render.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.setViewOffset(ancho, alto, ancho / 2 - centro.x, alto / 2 - centro.y, ancho, alto);
    camara.updateProjectionMatrix();
  }
  // Punto del cielo (arriba de la Luna, a la izquierda del texto) donde se deja al astro al ir hacia él.
  const blanco = () => (angosto ? { x: ancho * 0.5, y: alto - ancho * 0.8 } : { x: ancho * 0.37, y: alto * 0.3 });
  // Orientación de cámara que deja la dirección `dir` sobre el blanco, con el polo sur lo más a la vista posible.
  function vistaHacia(dir) {
    const b = blanco();
    const u = new THREE.Vector3((b.x - centro.x) / foco, -(b.y - centro.y) / foco, -1).normalize();
    const base = new THREE.Quaternion().setFromUnitVectors(u, dir);
    let mejor = base, nota = -Infinity;
    for (let i = 0; i < 180; i++) {
      const candidata = new THREE.Quaternion().setFromAxisAngle(dir, (i / 180) * Math.PI * 2).multiply(base);
      const sur = new THREE.Vector3(0, -1, 0).applyQuaternion(candidata.clone().invert()); // polo sur en ejes de cámara
      const puntaje = sur.z * 1.2 + sur.x * 0.8 + sur.y * 0.9;
      if (puntaje > nota) { nota = puntaje; mejor = candidata; }
    }
    return mejor;
  }

  // ---- Estado de la interacción ----
  const giro = { x: 0, y: 0 }; // velocidad angular en radianes por cuadro
  const puntero = { x: 0, y: 0 }; // posición normalizada, -0,5..0,5
  const mira = { x: 0, y: 0 }; // puntero suavizado
  const capas = { grilla: 0, lineas: 0, sitios: 0 };
  const encima = { titulo: false, explorar: false, planificar: false };
  let viaje = null, arrastre = null, cuadroId = 0;

  const girar = (dx, dy) => vista.multiply(q.setFromAxisAngle(EJE_Y, -dx)).multiply(q.setFromAxisAngle(EJE_X, -dy)).normalize();

  function aPantalla(p) {
    v.copy(p).project(camara);
    return v.z > 1 ? null : { x: ((v.x + 1) / 2) * ancho, y: ((1 - v.y) / 2) * alto };
  }
  function tapadoPorLuna(p) { // ¿el segmento cámara → p cruza la Luna?
    v.copy(p).sub(camara.position).normalize();
    const t = -camara.position.dot(v);
    return t > 0 && w.copy(camara.position).addScaledVector(v, t).length() < 1;
  }
  function ubicarRotulo(el, p, visible, dx = 0, dy = 0) {
    const s = visible ? aPantalla(p) : null;
    if (!s || s.x < -40 || s.x > ancho + 40 || s.y < -40 || s.y > alto + 40) {
      el.style.opacity = "0";
      return;
    }
    el.style.transform = `translate(${(s.x + dx).toFixed(1)}px, ${(s.y + dy).toFixed(1)}px)`;
    el.style.opacity = "1";
  }

  function cuadro() {
    cuadroId = requestAnimationFrame(cuadro);
    if (ancho === 0 || alto === 0) return;
    if (viaje) {
      viaje.t = Math.min(1, viaje.t + 1 / 110);
      vista.copy(viaje.desde).slerp(viaje.hasta, 1 - Math.pow(1 - viaje.t, 4));
      if (viaje.t >= 1) viaje = null;
    } else if (!arrastre) {
      girar(giro.x, giro.y);
      giro.x *= FRENO;
      giro.y *= FRENO;
      if (!sinMovimiento) vista.premultiply(q.setFromAxisAngle(EJE_Y, DERIVA));
    }
    mira.x += (puntero.x - mira.x) * 0.05;
    mira.y += (puntero.y - mira.y) * 0.05;
    camara.quaternion.copy(vista);
    if (!sinMovimiento) camara.quaternion.multiply(q.setFromAxisAngle(EJE_Y, -mira.x * 0.008)).multiply(q.setFromAxisAngle(EJE_X, -mira.y * 0.008));
    camara.position.set(0, 0, distancia).applyQuaternion(camara.quaternion);
    camara.updateMatrixWorld();
    luz.position.copy(LUZ_PANTALLA).applyQuaternion(camara.quaternion);
    if (!sinMovimiento) tierra.rotateY(0.0004);

    const metaGrilla = encima.planificar ? 0.34 : encima.titulo ? 0.3 : arrastre ? 0.15 : 0;
    const metaLineas = encima.planificar || encima.titulo ? 0.95 : 0;
    const metaSitios = encima.planificar || encima.explorar ? 1 : 0;
    capas.grilla += (metaGrilla - capas.grilla) * 0.12;
    capas.lineas += (metaLineas - capas.lineas) * 0.12;
    capas.sitios += (metaSitios - capas.sitios) * 0.12;
    grilla.material.opacity = capas.grilla;
    for (const l of lineas) l.material.opacity = capas.lineas;
    sitios.material.opacity = capas.sitios;
    leyenda.sol.style.opacity = leyenda.tierra.style.opacity = capas.lineas.toFixed(2);
    leyenda.sitios.style.opacity = capas.sitios.toFixed(2);

    render.render(escena, camara);

    const poloVisible = v.copy(camara.position).sub(POLO_SUR).dot(POLO_SUR) > 0.12;
    ubicarRotulo(rotulos.polo, POLO_SUR, poloVisible);
    ubicarRotulo(rotulos.sol, P_SOL, !tapadoPorLuna(P_SOL), 40, -40);
    ubicarRotulo(rotulos.tierra, P_TIERRA, !tapadoPorLuna(P_TIERRA), (RADIO_TIERRA / LEJOS) * foco + 22, -8);
  }

  // ---- Entradas ----
  function alBajar(e) {
    arrastre = { x: e.clientX, y: e.clientY };
    viaje = null;
    giro.x = giro.y = 0;
    lienzo.setPointerCapture(e.pointerId);
    lienzo.classList.add("arrastrando");
  }
  function alMoverArrastre(e) {
    if (!arrastre) return;
    const dx = (e.clientX - arrastre.x) / radioPx, dy = (e.clientY - arrastre.y) / radioPx; // el relieve acompaña al puntero
    girar(dx, dy);
    giro.x = giro.x * 0.5 + dx * 0.5;
    giro.y = giro.y * 0.5 + dy * 0.5;
    arrastre = { x: e.clientX, y: e.clientY };
  }
  function alSoltar() {
    arrastre = null;
    lienzo.classList.remove("arrastrando");
  }
  function alPuntero(e) {
    puntero.x = e.clientX / innerWidth - 0.5;
    puntero.y = e.clientY / innerHeight - 0.5;
  }
  function alRueda(e) {
    if (document.documentElement.scrollHeight > innerHeight + 1) return; // en pantallas angostas la rueda desplaza la página
    e.preventDefault();
    viaje = null;
    giro.x = limitar(giro.x + limitar(e.deltaY, -140, 140) * 0.00016, -0.06, 0.06);
  }
  function alTeclado(e) {
    const paso = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key];
    if (!paso) return;
    e.preventDefault();
    viaje = null;
    giro.x += paso[0];
    giro.y += paso[1];
  }
  lienzo.addEventListener("pointerdown", alBajar);
  lienzo.addEventListener("pointermove", alMoverArrastre);
  lienzo.addEventListener("pointerup", alSoltar);
  lienzo.addEventListener("pointercancel", alSoltar);
  lienzo.addEventListener("keydown", alTeclado);
  window.addEventListener("pointermove", alPuntero);
  window.addEventListener("wheel", alRueda, { passive: false });
  window.addEventListener("resize", medir);

  medir();
  vista.copy(vistaHacia(DIR_TIERRA));
  cuadroId = requestAnimationFrame(cuadro);

  return {
    irA(astro) {
      viaje = { desde: vista.clone(), hasta: vistaHacia(astro === "sol" ? DIR_SOL : DIR_TIERRA), t: 0 };
      giro.x = giro.y = 0;
    },
    sobre(clave, activo) {
      encima[clave] = activo;
    },
    ponerSitios(lista) {
      sitios.geometry.setFromPoints(lista.map((s) => latLonAVector(s.lat, s.lon).multiplyScalar(1.006)));
    },
    destruir() {
      cancelAnimationFrame(cuadroId);
      lienzo.removeEventListener("pointerdown", alBajar);
      lienzo.removeEventListener("pointermove", alMoverArrastre);
      lienzo.removeEventListener("pointerup", alSoltar);
      lienzo.removeEventListener("pointercancel", alSoltar);
      lienzo.removeEventListener("keydown", alTeclado);
      window.removeEventListener("pointermove", alPuntero);
      window.removeEventListener("wheel", alRueda);
      window.removeEventListener("resize", medir);
      escena.traverse((objeto) => {
        objeto.geometry?.dispose();
        objeto.material?.map?.dispose();
        objeto.material?.dispose();
      });
      render.dispose();
    },
  };
}
