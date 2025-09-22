import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ipc } from '../../lib/ipc';
import { CroquisSession } from '@tgim/types/croquis';

const CroquisWindow: React.FC = () => {
  const [params] = useSearchParams();
  const [session, setSession] = useState<CroquisSession | null>(null);

  useEffect(() => {
    console.log('[Croquis] window mounted');
    document.body.style.backgroundColor = 'transparent';
  }, []);

  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!sessionId) {
      console.warn('[Croquis] Missing session_id query parameter');
      return;
    }

    void (async () => {
      try {
        const data = await ipc.croquis.loadSession(sessionId);
        if (!data) {
          console.warn('[Croquis] No session found for id', sessionId);
          return;
        }
        setSession(data);
        console.log('[Croquis] session hydrated', data);
      } catch (error) {
        console.error('[Croquis] Failed to load Croquis session', error);
      }
    })();
  }, [params]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full text-text">
      <p className="text-base font-semibold">Croquis window bootstrap</p>
      {session ? (
        <pre className="mt-4 max-w-xl whitespace-pre-wrap break-all text-left text-xs text-text-muted">
          {JSON.stringify(
            {
              sessionId: session.sessionId,
              images: session.images.length,
            },
            null,
            2,
          )}
        </pre>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Waiting for Croquis data...</p>
      )}
    </div>
  );
};

export default CroquisWindow;
