import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { Button } from '@tgim/ui';
import { useNavigate } from 'react-router-dom';

const CreateIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-plus-square"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M8 12h8" />
    <path d="M12 8v8" />
  </svg>
);

const OpenIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-folder-open"
  >
    <path d="M20 12.58A2 2 0 0 0 22 11V8a2 2 0 0 0-2-2h-5.41a2 2 0 0 1-1.79-1.14l-.59-.94A2 2 0 0 0 10.81 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12.58a2 2 0 0 0 1.42-.59z" />
    <path d="M2 17h20" />
  </svg>
);

const TypeSelect: React.FC = () => {
  const { t } = useTranslation(['common', 'moa']);
  const navigate = useNavigate();
  const [_paths, setPaths] = useState<string | string[] | null>(null);

  const _pickFolder = async () => {
    const result = await open({ directory: true });
    setPaths(result);
  };
  const handleNewMoa = () => {
    void navigate('/create-moa/new');
  };
  const handleImportMoa = () => {
    void navigate('/create-moa/import');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-surface text-text">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold">{t('common:app_name')}</h1>
        <p className="text-text-soft">{t('moa:start_prompt')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full px-8">
        <Button variant="card" className="shadow-lg aspect-square" onClick={handleNewMoa}>
          <div className="flex flex-col items-center justify-center p-4">
            <CreateIcon />
            <h2 className="text-xl font-semibold mt-4">
              {t('moa:new_repository', { vault_name: t('common:vault_name') })}
            </h2>
            <p className="mt-1 text-sm text-text-soft text-center">
              {t('moa:new_repository_prompt', { vault_name: t('common:vault_name') })}
            </p>
          </div>
        </Button>
        <Button variant="card" className="shadow-lg aspect-square" onClick={handleImportMoa}>
          <div className="flex flex-col items-center justify-center p-4">
            <OpenIcon />
            <h2 className="text-xl font-semibold mt-4">
              {t('moa:import_repository', { vault_name: t('common:vault_name') })}
            </h2>
            <p className="mt-1 text-sm text-text-soft text-center">
              {t('moa:import_repository_prompt', { vault_name: t('common:vault_name') })}
            </p>
          </div>
        </Button>
      </div>
    </div>
  );
};

export default TypeSelect;
