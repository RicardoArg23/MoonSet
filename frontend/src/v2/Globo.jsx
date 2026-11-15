import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import Teselas from "./globo/Teselas.jsx"; // con extensión: en Windows "Teselas" y "teselas" son el mismo nombre
import { CAPAS } from "./globo/teselas";

// Mismo mosaico LROC WAC que las teselas en línea (backend/scripts/generar_textura_luna.py).
const TEXTURA = `${import.meta.env.BASE_URL}texturas/luna_wac_4k.jpg`;

// Alturas de la cámara sobre la superficie, en radios lunares (1 radio = 1737,4 km).
const ALTURA_LEJOS = 3.5; // la Luna entera en cuadro
// Altura de "acercar al sitio": la que deja el píxel de pantalla cerca del píxel de la mejor imagen disponible.
const ALTURA_CERCA_POLO = 0.012; // ~21 km, mosaico NAC del polo sur
const ALTURA_CERCA_GLOBAL = 0.05; // ~87 km, mosaico WAC global (~83 m/px)
const ALTURA_MIN = 0.004; // ~7 km: debajo de esto las teselas ya no dan más detalle
const ALTURA_MAX = 5;

/**
 * Coordenadas selenográficas → vector unitario de la escena.
 * Y es el polo norte; lon 0° (centro de la cara visible) queda sobre +X y el este hacia −Z,
 * que es como SphereGeometry envuelve una textura equirectangular centrada en lon 0°.
 */
export function latLonAVector(lat, lon, destino = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(lat);
  const o = THREE.MathUtils.degToRad(lon);
  return destino.set(Math.cos(a) * Math.cos(o), Math.sin(a), -Math.cos(a) * Math.sin(o));
}

/** Inversa de latLonAVector: punto sobre la esfera → { lat, lon } en grados (lon 0..360 este). */
export function vectorALatLon(v) {
  const r = v.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(v.y / r));
  const lon = (THREE.MathUtils.radToDeg(Math.atan2(-v.z, v.x)) + 360) % 360;
  return { lat, lon };
}

function Luna({ onPunto }) {
  const textura = useTexture(TEXTURA);
  useMemo(() => {
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 8;
  }, [textura]);
  return (
    <mesh
      onClick={(e) => {
        // e.delta: píxeles que se movió el puntero entre apretar y soltar. Si arrastró, estaba girando.
        if (!onPunto || e.delta > 4) return;
        onPunto(vectorALatLon(e.point));
      }}
    >
      <sphereGeometry args={[1, 128, 96]} />
      <meshStandardMaterial map={textura} roughness={1} metalness={0} />
    </mesh>
  );
}

// Una sola iluminación a cualquier distancia: luz pareja para que el mosaico se lea en toda la Luna,
// más un refuerzo desde el Sol real que marca de qué lado es de día sin oscurecer la noche.
const LUZ_PAREJA = 2.3;
const LUZ_SOL = 1.1;
function Luces({ lat, lon }) {
  const sol = useRef();
  useEffect(() => {
    latLonAVector(lat, lon, sol.current.position).multiplyScalar(20);
  }, [lat, lon]);
  return (
    <>
      <ambientLight intensity={LUZ_PAREJA} />
      <directionalLight ref={sol} intensity={LUZ_SOL} />
    </>
  );
}

// Línea desde el sitio elegido hacia la Tierra. Solo se dibuja cuando hay contacto directo:
// si el relieve o la propia Luna la tapan, no hay nada que señalar.
function HaciaLaTierra({ sitio, lat, lon, rotulo }) {
  const { puntos, punta } = useMemo(() => {
    const origen = latLonAVector(sitio.lat, sitio.lon).multiplyScalar(1.004);
    const fin = latLonAVector(lat, lon).multiplyScalar(0.42).add(origen);
    return { puntos: [origen.toArray(), fin.toArray()], punta: fin.toArray() };
  }, [sitio.lat, sitio.lon, lat, lon]);
  return (
    <>
      <Line points={puntos} color="#6faef0" lineWidth={2} />
      <mesh position={punta}>
        <sphereGeometry args={[0.02, 16, 12]} />
        <meshBasicMaterial color="#6faef0" />
      </mesh>
      <Html className="globo-rotulo tierra" position={punta}>{rotulo}</Html>
    </>
  );
}

const RADIO_SENSIBLE = 0.04; // el punto dibujado mide 0,016 a 0,022

// Colores del ranking del modo planificación: los mismos verde y rojo del veredicto (--bien y --mal).
const COLOR_SOBREVIVE = "#7bdca2";
const COLOR_NO_SOBREVIVE = "#ff9c8a";
const COLOR_FUERA_DEL_PLAN = "#5d6470";
// Hacia dónde mira la cámara con la región "Polo sur": casi sobre el polo, con la cara visible arriba.
// No exactamente −90°: con la cámara sobre el eje, los controles de órbita no tienen un "arriba" definido.
const VISTA_POLO_SUR = { lat: -86, lon: 0 };

// `enPlan`: undefined fuera del modo planificación; true/false si el sitio sobrevive en el ranking; null si no entró.
function Marcador({ sitio, nombre, activo, viable, enPlan, onElegir, onQuitar }) {
  const grupo = useRef();
  const direccion = useMemo(() => latLonAVector(sitio.lat, sitio.lon), [sitio.lat, sitio.lon]);
  let color = activo ? "#ffffff" : viable ? "#ffb84a" : "#8b93a3";
  if (enPlan !== undefined) color = enPlan === null ? COLOR_FUERA_DEL_PLAN : enPlan ? COLOR_SOBREVIVE : COLOR_NO_SOBREVIVE;
  // El marcador mantiene su tamaño en pantalla: se achica y baja a la superficie al acercarse.
  useFrame(({ camera }) => {
    const escala = THREE.MathUtils.clamp((camera.position.length() - 1) / 2.5, 0.0015, 1);
    grupo.current.scale.setScalar(escala);
    grupo.current.position.copy(direccion).multiplyScalar(1.0006 + 0.0034 * escala);
  });
  return (
    <group
      ref={grupo}
      onClick={(e) => {
        e.stopPropagation();
        onElegir(sitio.id);
      }}
      // Clic derecho sobre un punto propio: se quita. El menú del navegador ya lo cancela el <Canvas>.
      onContextMenu={onQuitar ? (e) => {
        e.stopPropagation();
        document.body.style.cursor = "";
        onQuitar(sitio.id);
      } : undefined}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      <mesh>
        <sphereGeometry args={[activo ? 0.022 : 0.016, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Área sensible más grande que el punto dibujado: acertarle con el mouse no exige puntería. */}
      <mesh>
        <sphereGeometry args={[RADIO_SENSIBLE, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Sitio resaltado del ranking: un halo blanco alrededor, para que el verde o el rojo se sigan leyendo. */}
      {activo && enPlan !== undefined && (
        <mesh>
          <sphereGeometry args={[0.034, 20, 14]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      )}
      {activo && (
        <Html className="globo-rotulo activo" position={[0, 0, 0]}>{nombre}</Html>
      )}
    </group>
  );
}

// Punto tocado que todavía se está calculando: aparece al instante donde se tocó, con un halo que
// late suave. Con prefers-reduced-motion el halo queda quieto.
function MarcadorPendiente({ lat, lon }) {
  const grupo = useRef();
  const halo = useRef();
  const direccion = useMemo(() => latLonAVector(lat, lon), [lat, lon]);
  const quieto = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  useFrame(({ camera, clock }) => {
    const escala = THREE.MathUtils.clamp((camera.position.length() - 1) / 2.5, 0.0015, 1);
    grupo.current.scale.setScalar(escala);
    grupo.current.position.copy(direccion).multiplyScalar(1.0006 + 0.0034 * escala);
    const fase = quieto ? 0.5 : (Math.sin(clock.elapsedTime * 3) + 1) / 2;
    halo.current.scale.setScalar(1 + 0.6 * fase);
    halo.current.material.opacity = 0.45 - 0.3 * fase;
  });
  return (
    <group ref={grupo}>
      <mesh>
        <sphereGeometry args={[0.02, 16, 12]} />
        <meshBasicMaterial color="#ffb84a" />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.034, 20, 14]} />
        <meshBasicMaterial color="#ffb84a" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

// Los textos llegan por props (nombreActivo, rotuloTierra): el contexto de idioma no cruza el <Canvas>.

// Lleva la cámara frente al sitio elegido, lejos o cerca según `enfoque`. Solo anima mientras "vuela";
// si el usuario toca los controles, manda el usuario. También ajusta los planos de recorte y la
// sensibilidad de los controles a la altura, para que girar y acercar se sientan igual a toda escala.
function Camara({ lat, lon, enfoque, deFrente = false, controles, volando }) {
  const { camera } = useThree();
  const destino = useRef({ direccion: new THREE.Vector3(1, 0, 0), altura: ALTURA_LEJOS });
  const actual = useRef(new THREE.Vector3());

  useEffect(() => {
    const cerca = enfoque.modo === "cerca" && !deFrente;
    // De lejos, un poco hacia el ecuador respecto del sitio para que los polos no queden de canto.
    // `deFrente` (vista del polo sur del modo planificación) mira justo a esa latitud, siempre de lejos.
    latLonAVector(cerca || deFrente ? lat : lat * 0.8, lon, destino.current.direccion);
    const alturaCerca = lat < CAPAS.nac.latBorde - 0.5 ? ALTURA_CERCA_POLO : ALTURA_CERCA_GLOBAL;
    destino.current.altura = cerca ? alturaCerca : ALTURA_LEJOS;
    volando.current = true;
  }, [lat, lon, enfoque, deFrente, volando]);

  useFrame((_, dt) => {
    const distancia = camera.position.length();
    const altura = distancia - 1;

    if (volando.current) {
      const k = 1 - Math.exp(-3.2 * dt);
      const d = destino.current;
      // La dirección y la altura se interpolan por separado (la altura en escala logarítmica):
      // así la cámara rodea la Luna en lugar de atravesarla y el acercamiento se ve parejo.
      const nuevaAltura = altura * (d.altura / altura) ** k;
      actual.current.copy(camera.position).divideScalar(distancia).lerp(d.direccion, k).normalize();
      camera.position.copy(actual.current).multiplyScalar(1 + nuevaAltura);
      camera.lookAt(0, 0, 0);
      if (actual.current.angleTo(d.direccion) < 1e-4 && Math.abs(Math.log(nuevaAltura / d.altura)) < 0.01) volando.current = false;
    }

    const cerca = Math.max(1e-4, altura * 0.1);
    if (Math.abs(camera.near - cerca) > cerca * 0.05) {
      camera.near = cerca;
      camera.far = distancia + 2;
      camera.updateProjectionMatrix();
    }
    const c = controles.current;
    if (c) {
      c.rotateSpeed = Math.min(0.6, 0.15 * altura);
      c.zoomSpeed = THREE.MathUtils.clamp((2 * altura) / distancia, 0.02, 0.6);
      if (volando.current) c.update();
    }
  });
  return null;
}

/**
 * @param {object} props
 * @param {{ modo: "lejos"|"cerca", n: number }} props.enfoque a qué altura llevar la cámara; `n` cambia para repetir el vuelo
 * @param {(d: { capa: string|null, metrosPorPixel: number }) => void} [props.onDetalle] qué imagen se ve bajo la cámara
 * @param {{ estados: Map<string, boolean>, enPestana: boolean, resaltado: string|null, nombreResaltado: string, polo: boolean }|null} [props.plan]
 *   modo planificación: `estados` dice qué sitios del ranking sobreviven (verde) y cuáles no (rojo). Con la pestaña
 *   Planificar a la vista (`enPestana`) la cámara sigue al sitio `resaltado` o, si no hay y `polo`, mira al polo sur.
 */
export default function Globo({ sitios, sitioId, viables, sol, tierra, hayContacto, nombreActivo, rotuloTierra, enfoque, onDetalle, onElegir, onPunto, propios, onQuitar, pendiente, plan = null }) {
  const controles = useRef();
  const volando = useRef(false);
  const activo = sitios.find((s) => s.sitio.id === sitioId).sitio;
  const soloPlan = plan?.enPestana ?? false; // en la pestaña Planificar no se marca el sitio de la app
  const resaltado = soloPlan && plan.resaltado ? sitios.find((s) => s.sitio.id === plan.resaltado)?.sitio ?? null : null;
  const alPolo = soloPlan && !resaltado && plan.polo;
  const mira = soloPlan ? resaltado ?? (alPolo ? VISTA_POLO_SUR : activo) : activo;
  const marcado = soloPlan ? resaltado?.id ?? null : sitioId;
  const estadoPlan = (id) => (plan && plan.estados.size > 0 ? plan.estados.get(id) ?? null : undefined);
  return (
    <Canvas onContextMenu={(e) => e.preventDefault()} camera={{ position: [0.9, -4.3, 0.7], fov: 35, near: 0.05, far: 100 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#000000"]} />
      <Luces lat={sol.lat} lon={sol.lon} />
      <Luna onPunto={onPunto} />
      <Teselas onDetalle={onDetalle} volando={volando} />
      {hayContacto && !soloPlan && <HaciaLaTierra sitio={activo} lat={tierra.lat} lon={tierra.lon} rotulo={rotuloTierra} />}
      {sitios.map((s) => (
        <Marcador key={s.sitio.id} sitio={s.sitio} nombre={soloPlan ? plan.nombreResaltado : nombreActivo} activo={s.sitio.id === marcado} viable={viables.has(s.sitio.id)} enPlan={estadoPlan(s.sitio.id)} onElegir={onElegir} onQuitar={propios?.has(s.sitio.id) ? onQuitar : null} />
      ))}
      {pendiente && <MarcadorPendiente lat={pendiente.lat} lon={pendiente.lon} />}
      <Camara lat={mira.lat} lon={mira.lon} enfoque={enfoque} deFrente={alPolo} controles={controles} volando={volando} />
      <OrbitControls
        ref={controles}
        enablePan={false}
        minDistance={1 + ALTURA_MIN}
        maxDistance={1 + ALTURA_MAX}
        rotateSpeed={0.6}
        zoomSpeed={0.6}
        onStart={() => { volando.current = false; }}
      />
    </Canvas>
  );
}
