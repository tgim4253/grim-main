import ManageMoaTitleBar from './layout/ManageMoaTitleBar';
import ManageMoaSidebar from './layout/ManageMoaSidebar';
import { Routes, Route } from 'react-router-dom';
import TypeSelect from './TypeSelect';
import MoaDetail from './MoaDetail';
import { ToastContainer } from 'react-toastify';
import { platform } from '@tauri-apps/plugin-os';
import { useEffect, useState } from 'react';
import { useTheme } from '../../theme/ThemeProvider';

const Moa: React.FC = () => {
  const [isMac, setIsMac] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    let mounted = true;

    const detectPlatform = () => {
      try {
        const os = platform();
        if (mounted) {
          setIsMac(os === 'macos');
        }
      } catch {
        if (mounted) {
          setIsMac(false);
        }
      }
    };

    detectPlatform();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex w-full h-full bg-shell-base text-text overflow-hidden" data-theme={theme}>
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
