import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LibraryPage } from '../pages/library';
import { CroquisPage } from '../pages/croquis';
import { CapturePage } from '../pages/capture';

export default function App() {
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
