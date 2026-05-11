import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '../pages/library';
import { CroquisPage } from '../pages/croquis';
import { CapturePage } from '../pages/capture';
import { useTheme } from '../shared/hooks';

export default function App() {
  const { t } = useTranslation('common');

  useTheme();

  useEffect(() => {
    document.title = t('app_name', { defaultValue: 'GRIM' });
  }, [t]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/croquis" element={<CroquisPage />} />
        <Route path="/capture" element={<CapturePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
