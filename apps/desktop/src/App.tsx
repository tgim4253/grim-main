import React from 'react';
import TitleBar from './features/main/layout/TitleBar';
import { HashRouter, Routes, Route } from 'react-router-dom';
import ManageMoaTitleBar from './features/moa/layout/ManageMoaTitleBar';
import Moa from './features/moa/Moa';
import './i18n';
import Main from './features/main/Main';

function App() {
  return (
    <div className="flex flex-col h-screen">
      <HashRouter>
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/moa" element={<Moa />} />
          <Route path="/create-moa/*" element={<Moa></Moa>} />
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
