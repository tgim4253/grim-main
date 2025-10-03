import { useEffect } from 'react';

export const useDebouncedEffect = (fn: () => void, deps: React.DependencyList, delay: number) => {
  useEffect(() => {
    const handler = setTimeout(() => {
      fn();
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [fn, ...deps]);
};
