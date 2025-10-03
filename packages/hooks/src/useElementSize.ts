import { useEffect, useState, RefObject } from 'react';

export function useElementSize<T extends HTMLElement>(ref: RefObject<T> | RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      setSize({ width: cr.width, height: cr.height });
    });

    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [ref]);

  return size;
}
