import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '../pages/library';
import { CroquisPage } from '../pages/croquis';
import { CapturePage } from '../pages/capture';
import { TemplateStartModal, type TemplateStartOptions } from '../features/onboarding';
import { useTheme } from '../shared/hooks';
import { getErrorMessage } from '../shared/lib/error';
import { ipc } from '../shared/lib/ipc';

export default function App() {
  const { t } = useTranslation('common');
  const [showTemplateStartModal, setShowTemplateStartModal] = useState(false);
  const [templateStartBusy, setTemplateStartBusy] = useState(false);
  const [templateStartError, setTemplateStartError] = useState<string | null>(null);

  useTheme();

  useEffect(() => {
    document.title = t('app_name', { defaultValue: 'GRIM' });
  }, [t]);

  useEffect(() => {
    if (!isTauri()) {
      return undefined;
    }

    let cancelled = false;

    void ipc.app
      .loadStartupState()
      .then(state => {
        if (!cancelled && state.isInitialLaunch) {
          setShowTemplateStartModal(true);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load app startup state.', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const completeInitialLaunch = useCallback(
    async (options: TemplateStartOptions) => {
      setTemplateStartBusy(true);
      setTemplateStartError(null);

      try {
        await ipc.app.completeInitialLaunch(options);
        setShowTemplateStartModal(false);

        if (options.templateStartEnabled) {
          window.location.reload();
        }
      } catch (error) {
        setTemplateStartError(
          getErrorMessage(
            error,
            t('template_start.error.complete_initial_launch', {
              defaultValue: 'Failed to finish initial setup.',
            }),
          ),
        );
      } finally {
        setTemplateStartBusy(false);
      }
    },
    [t],
  );

  const handleTemplateStart = useCallback(
    (options: TemplateStartOptions) => {
      void completeInitialLaunch(options);
    },
    [completeInitialLaunch],
  );

  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/croquis" element={<CroquisPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <TemplateStartModal
        open={showTemplateStartModal}
        busy={templateStartBusy}
        error={templateStartError}
        onStart={handleTemplateStart}
      />
    </>
  );
}
