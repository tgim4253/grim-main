import { Button, LanguageSwitcher } from '@tgim/ui';
import { ipc } from '../../../lib/ipc';
import { useEffect, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MoaIcon = () => (
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
    className="lucide lucide-gem"
  >
    <path d="M6 3h12l4 6-10 13L2 9z" />
    <path d="M12 22V9" />
    <path d="m3.29 9 8.71 13 8.71-13" />
  </svg>
);

const ManageMoaSideBar: React.FC = () => {
  const [moas, setMoas] = useState<{ name: string; path: string; moa_id: string }[]>([]);

  const { t, i18n } = useTranslation(['common', 'moa']);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const data = await ipc.moa.loadMoas();
        if (!mounted) return;
        setMoas(prev => data);
      } catch (err) {
        console.error(err);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);
  const handleMoaClick = (moa_id: string) => {
    ipc.moa.openMoa(moa_id);
  };
  return (
    <div
      className="h-full border-r border-outline bg-background-8 text-foreground pt-10 flex flex-col"
      style={{ WebkitAppRegion: 'drag', width: '300px' } as React.CSSProperties}
    >
      {/* Item list */}
      <div className="flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {moas.map(moa => {
          return (
            <Button
              variant="list-item"
              key={moa.name + moa.path}
              onClick={() => handleMoaClick(moa.moa_id)}
              className="flex items-start justify-between p-2 rounded-lg "
            >
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <div className="w-fit flex-shrink-0">
                  <MoaIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col items-start whitespace-pre-wrap break-words">
                    <span className="font-semibold break-words max-w-full truncate">
                      {moa.name}
                    </span>
                    <span className="text-sm text-foreground break-words max-w-full">
                      {moa.path}
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-fit flex-shrink-0 items-center pl-2">
                <Button
                  variant="icon"
                  onClick={event => {
                    event.stopPropagation();
                  }}
                  asChild
                  className="text-icon-sidebar hover:text-icon-hover-sidebar"
                >
                  <MoreVertical />
                </Button>
              </div>
            </Button>
          );
        })}
      </div>

      <div
        className="mt-auto flex justify-start p-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <LanguageSwitcher
          current={i18n.language as 'ko' | 'en' | 'jp'}
          onChanged={changeLanguage}
        />
      </div>
    </div>
  );
};

export default ManageMoaSideBar;
