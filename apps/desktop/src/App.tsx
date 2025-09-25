import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Moa from './features/moa/Moa';
import './i18n';
import Main from './features/main/Main';
import CroquisWindow from './features/croquis/CroquisWindow';
import CroquisCaptureOverlay from './features/croquis/CroquisCaptureOverlay';

// Desktop entry point that keeps routing hash-based for Tauri compatibility.
const App: React.FC = () => {
  return (
    <div className="flex flex-col h-screen">
      <HashRouter>
        <Routes>
          <Route path="/moa/*" element={<Main />} />
          <Route path="/create-moa/*" element={<Moa />} />
          <Route path="/croquis/*" element={<CroquisWindow />} />
          <Route path="/croquis-capture/*" element={<CroquisCaptureOverlay />} />
        </Routes>
      </HashRouter>
    </div>
  );
};

export default App;
