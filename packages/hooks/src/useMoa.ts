import { useEffect, useState } from 'react';

export function useMoa(location: Location) {
  const [moaId, setMoaId] = useState<string | null>(null);

  useEffect(() => {
    const hash = location.hash;
    const queryString = hash.split('?')[1];
    const queryParams = new URLSearchParams(queryString);
    const moa_id = queryParams.get('moa_id') as string;

    setMoaId(moa_id);
  }, [location.search]); // location.search 변할 때 재로딩

  return { moaId };
}
