import { useEffect, useState } from 'react';

export function useMoa(location: Location) {
  const [moaId, setMoaId] = useState<string | null>(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const moa_id = queryParams.get('moa_id') as string;

    setMoaId(moa_id);
  }, [location.search]); // location.search 변할 때 재로딩

  return { moaId };
}
