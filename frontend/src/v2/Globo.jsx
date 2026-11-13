import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";

const TEXTURA = `${import.meta.env.BASE_URL}texturas/luna_lroc_4k.jpg`;

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

function Sol({ lat, lon }) {
  const luz = useRef();
  useEffect(() => {
    latLonAVector(lat, lon, luz.current.position).multiplyScalar(20);
  }, [lat, lon]);
  return <directionalLight ref={luz} intensity={2.6} />;
}

// Línea desde el sitio elegido hacia la Tierra. Solo se dibuja cuando hay contacto directo:
// si el relieve o la propia Luna la tapan, no hay nada que señalar.
function HaciaLaTierra({ sitio, lat, lon }) {
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
      <Html className="globo-rotulo tierra" position={punta}>a la Tierra</Html>
    </>
  );
}

function Marcador({ sitio, activo, viable, onElegir }) {
  const posicion = useMemo(() => latLonAVector(sitio.lat, sitio.lon).multiplyScalar(1.004).toArray(), [sitio.lat, sitio.lon]);
  const color = activo ? "#ffffff" : viable ? "#ffb84a" : "#8b93a3";
  return (
    <group position={posicion}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onElegir(sitio.id);
        }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <sphereGeometry args={[activo ? 0.022 : 0.016, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {activo && (
        <Html className="globo-rotulo activo" position={[0, 0, 0]}>{sitio.nombre.split(" — ")[0]}</Html>
      )}
    </group>
  );
}

// Lleva la cámara frente al sitio elegido. Solo anima mientras "vuela"; después manda el usuario.
function Camara({ lat, lon, controles }) {
  const { camera } = useThree();
  const destino = useRef(new THREE.Vector3());
  const volando = useRef(false);
  useEffect(() => {
    // Un poco hacia el ecuador respecto del sitio, para que los polos no queden de canto.
    latLonAVector(lat * 0.8, lon, destino.current).multiplyScalar(4.5);
    volando.current = true;
  }, [lat, lon]);
  useFrame((_, dt) => {
    if (!volando.current) return;
    camera.position.lerp(destino.current, 1 - Math.exp(-4 * dt));
    camera.lookAt(0, 0, 0);
    controles.current?.update();
    if (camera.position.distanceToSquared(destino.current) < 1e-5) volando.current = false;
  });
  return null;
}

export default function Globo({ sitios, sitioId, viables, sol, tierra, hayContacto, onElegir, onPunto }) {
  const controles = useRef();
  const activo = sitios.find((s) => s.sitio.id === sitioId).sitio;
  return (
    <Canvas camera={{ position: [0.9, -4.3, 0.7], fov: 35, near: 0.05, far: 100 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.45} />
      <Sol lat={sol.lat} lon={sol.lon} />
      <Luna onPunto={onPunto} />
      {hayContacto && <HaciaLaTierra sitio={activo} lat={tierra.lat} lon={tierra.lon} />}
      {sitios.map((s) => (
        <Marcador key={s.sitio.id} sitio={s.sitio} activo={s.sitio.id === sitioId} viable={viables.has(s.sitio.id)} onElegir={onElegir} />
      ))}
      <Camara lat={activo.lat} lon={activo.lon} controles={controles} />
      <OrbitControls ref={controles} enablePan={false} minDistance={1.25} maxDistance={6} rotateSpeed={0.6} zoomSpeed={0.6} />
    </Canvas>
  );
}
