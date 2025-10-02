import { useEffect, useState } from 'react';

export function useElementSize<T extends HTMLElement>(ref: React.RefObject<T>) {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
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
