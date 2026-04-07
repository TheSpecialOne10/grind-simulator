import { useEffect, useRef, useState, useCallback } from 'react';

const BASE_W = 960;
const BASE_H = 720;
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.5;

export function useTableScale(): {
  scale: number;
  containerRef: React.RefCallback<HTMLDivElement>;
} {
  const [scale, setScale] = useState(1);
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node) return;

    const computeScale = () => {
      const { clientWidth, clientHeight } = node;
      if (clientWidth === 0 || clientHeight === 0) return;
      const s = Math.min(clientWidth / BASE_W, clientHeight / BASE_H);
      setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)));
    };

    computeScale();

    observerRef.current = new ResizeObserver(computeScale);
    observerRef.current.observe(node);
  }, []);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return { scale, containerRef };
}
