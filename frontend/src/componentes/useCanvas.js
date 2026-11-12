import { useEffect, useRef, useState } from "react";

// Devuelve un ref para un <canvas> y su tamaño en píxeles CSS; redibuja al cambiar el tamaño.
export function useCanvas(dibujar, deps) {
  const ref = useRef(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const obs = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(c);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c || !tam.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(tam.w * dpr);
    c.height = Math.round(tam.h * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dibujar(ctx, tam.w, tam.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tam, ...deps]);

  return ref;
}
