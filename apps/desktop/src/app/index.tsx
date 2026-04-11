import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '../pages/library';
import { CroquisPage } from '../pages/croquis';
import { CapturePage } from '../pages/capture';
import { useTheme } from '../shared/hooks';

export default function App() {
  useTheme();

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
