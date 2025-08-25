import ManageMoaTitleBar from './layout/ManageMoaTitleBar';
import ManageMoaSidebar from './layout/ManageMoaSidebar';
import { Routes, Route } from 'react-router-dom';
import TypeSelect from './TypeSelect';
import NewMoa from './NewMoa';
import MoaDetail from './MoaDetail';
import { ToastContainer } from 'react-toastify';
import { platform } from '@tauri-apps/plugin-os';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

const Moa: React.FC = () => {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      const os = platform();
      console.log(os);
      setIsMac(os === 'macos');
    };

    checkPlatform(); // call the async function
  }, []); // dependency array to run only once on mount

  return (
    <div className="flex w-full h-full bg-background-6 overflow-hidden" data-theme="dark">
      <ManageMoaSidebar />
      {!isMac && (
        <div className="fixed w-full top-0 z-50">
          <ManageMoaTitleBar />
        </div>
      )}
      <div className="w-full">
        <Routes>
          <Route path="/" element={<TypeSelect />} />
          <Route path="/new" element={<MoaDetail type="new" />} />
          <Route path="/import" element={<MoaDetail type="import" />} />
        </Routes>
      </div>
      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={true}
        newestOnTop={false}
        closeOnClick
        pauseOnHover
      />
    </div>
  );
};

export default Moa;
