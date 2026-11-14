import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAPAS, grillaTesela, opacidadPolar, teselasVisibles, unitario } from "./teselas";

// Detalle progresivo del globo: sobre la esfera con la textura local se apoyan parches con las
// teselas de Moon Trek que corresponden a lo que mira la cámara, a cualquier distancia. La textura local
// sale del mismo mosaico (backend/scripts/generar_textura_luna.py): es lo que se ve mientras cargan o sin red.

const SEGMENTOS = 12; // subdivisiones por lado de cada parche
const MAX_EN_CACHE = 320;
const REVISAR_CADA_S = 0.12;
const REVISAR_EN_VUELO_S = 0.6; // mientras la cámara vuela sola se piden menos niveles intermedios al servidor
// Cada nivel va apenas por encima del anterior para que el más fino tape al más grueso sin parpadeo.
const RADIO = { wac: (z) => 1 + 0.00002 * (z + 1), nac: (z) => 1.0002 + 0.00002 * (z - 2) };

const cargador = new THREE.TextureLoader().setCrossOrigin("anonymous");
const cache = new Map(); // clave → Promise<THREE.Texture | null>; el orden de inserción es el de uso
let enUso = new Set();

function pedirTextura(t) {
  const guardada = cache.get(t.clave);
  if (guardada) {
    cache.delete(t.clave); // se reinserta al final: es la más reciente
    cache.set(t.clave, guardada);
    return guardada;
  }
  const promesa = cargador
    .loadAsync(CAPAS[t.capa].url(t.z, t.fila, t.col))
    .then((textura) => {
      textura.colorSpace = THREE.SRGBColorSpace;
      textura.anisotropy = 4;
      return textura;
    })
    .catch(() => null); // sin cobertura (404) o sin red: esa tesela no se dibuja y queda lo de abajo
  cache.set(t.clave, promesa);
  if (cache.size > MAX_EN_CACHE) liberarViejas();
  return promesa;
}

function liberarViejas() {
  for (const [clave, promesa] of cache) {
    if (cache.size <= MAX_EN_CACHE) break;
    if (enUso.has(clave)) continue;
    cache.delete(clave);
    promesa.then((textura) => textura?.dispose());
  }
}

function crearGeometria(t) {
  const polar = t.capa === "nac";
  const segmentos = polar && t.z <= 4 ? SEGMENTOS * 2 : SEGMENTOS; // las teselas polares gruesas necesitan más puntos para fundir el borde
  const puntos = grillaTesela(t, segmentos);
  const radio = RADIO[t.capa](t.z);
  const posiciones = new Float32Array(puntos.length * 3);
  const normales = new Float32Array(puntos.length * 3);
  const uvs = new Float32Array(puntos.length * 2);
  const colores = polar ? new Float32Array(puntos.length * 4).fill(1) : null;
  puntos.forEach((p, k) => {
    const n = unitario(p.lat, p.lon);
    normales.set(n, k * 3);
    posiciones.set([n[0] * radio, n[1] * radio, n[2] * radio], k * 3);
    uvs.set([p.u, p.v], k * 2);
    if (colores) colores[k * 4 + 3] = opacidadPolar(t.z, p.lat);
  });
  const indices = [];
  const lado = segmentos + 1;
  for (let j = 0; j < segmentos; j++) {
    for (let i = 0; i < segmentos; i++) {
      const a = j * lado + i; // a b   (norte arriba, este a la derecha)
      const b = a + 1; //        c d
      const c = a + lado;
      const d = c + 1;
      indices.push(a, c, b, b, c, d); // caras hacia afuera de la esfera
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute("normal", new THREE.BufferAttribute(normales, 3));
  geometria.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  if (colores) geometria.setAttribute("color", new THREE.BufferAttribute(colores, 4)); // el cuarto valor es la opacidad
  geometria.setIndex(indices);
  return geometria;
}

function Tesela({ t }) {
  const [textura, setTextura] = useState(null);
  // La clave identifica a la tesela; el objeto t se recrea en cada selección y no debe disparar recargas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometria = useMemo(() => crearGeometria(t), [t.clave]);
  useEffect(() => () => geometria.dispose(), [geometria]);
  useEffect(() => {
    let vigente = true;
    pedirTextura(t).then((x) => vigente && setTextura(x));
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.clave]);
  if (!textura) return null;
  return (
    <mesh geometry={geometria} renderOrder={t.z}>
      {/* Mosaico polar: se funde con el global en el borde (opacidad por vértice). Sus zonas sin foto vienen
          transparentes en la imagen y también dejan ver la capa de abajo. */}
      {t.capa === "nac" ? (
        <meshStandardMaterial map={textura} roughness={1} metalness={0} vertexColors transparent alphaTest={0.02} />
      ) : (
        <meshStandardMaterial map={textura} roughness={1} metalness={0} />
      )}
    </mesh>
  );
}

/**
 * @param {object} props
 * @param {(d: { capa: string|null, metrosPorPixel: number }) => void} [props.onDetalle]
 *   avisa qué imagen se está viendo bajo la cámara, cada vez que cambia
 * @param {{ current: boolean }} [props.volando] true mientras la cámara se mueve sola hacia un destino
 */
export default function Teselas({ onDetalle, volando }) {
  const [activas, setActivas] = useState([]);
  const estado = useRef({ firma: "", detalle: "", espera: 0, posicion: new THREE.Vector3(Infinity, 0, 0), alto: 0 });

  useFrame(({ camera, size, viewport }, dt) => {
    const e = estado.current;
    e.espera -= dt;
    if (e.espera > 0) return;
    const distancia = camera.position.length();
    const altura = distancia - 1;
    // Solo se recalcula si la cámara se movió de forma apreciable para su altura.
    if (e.alto === size.height && camera.position.distanceToSquared(e.posicion) < (altura * 0.02) ** 2) return;
    e.espera = volando?.current ? REVISAR_EN_VUELO_S : REVISAR_CADA_S;
    e.alto = size.height;
    e.posicion.copy(camera.position);

    const medioFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const semiDiagonal = Math.atan(Math.tan(medioFov) * Math.hypot(1, camera.aspect));
    // Píxeles físicos de la pantalla (en pantallas de alta densidad hace falta un nivel más para verse nítido).
    const metrosPorPixel = ((altura * 2 * Math.tan(medioFov)) / (size.height * viewport.dpr)) * 1_737_400;
    const sub = {
      lat: THREE.MathUtils.radToDeg(Math.asin(camera.position.y / distancia)),
      lon: THREE.MathUtils.radToDeg(Math.atan2(-camera.position.z, camera.position.x)),
    };
    const visibles = teselasVisibles(sub, distancia, semiDiagonal, metrosPorPixel);

    const firma = visibles.teselas.map((t) => t.clave).join(" ");
    if (firma !== e.firma) {
      e.firma = firma;
      enUso = new Set(visibles.teselas.map((t) => t.clave));
      setActivas(visibles.teselas); // cambio discreto: solo cuando cambia el conjunto de teselas
    }
    const detalle = `${visibles.capa}/${visibles.z}`;
    if (detalle !== e.detalle) {
      e.detalle = detalle;
      onDetalle?.({ capa: visibles.capa, metrosPorPixel: visibles.metrosPorPixel });
    }
  });

  return activas.map((t) => <Tesela key={t.clave} t={t} />);
}
