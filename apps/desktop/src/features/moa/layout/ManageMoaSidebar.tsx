import { Button, LanguageSwitcher } from '@tgim/ui';
import { ipc } from '../../../lib/ipc';
import { useCallback, useEffect, useState } from 'react';
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

// Sidebar for switching between existing MOAs and language preferences.
const ManageMoaSideBar: React.FC = () => {
  const [moas, setMoas] = useState<{ name: string; path: string; moa_id: string }[]>([]);

  const { t, i18n } = useTranslation(['common', 'moa']);

  const changeLanguage = useCallback(
    (lng: string) => {
      void i18n.changeLanguage(lng);
    },
    [i18n],
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const data = await ipc.moa.loadMoas();
        if (!mounted) return;
        setMoas(data);
      } catch (error) {
        console.error('Failed to load recent MOAs', error);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);
  const handleMoaClick = useCallback(async (moaId: string) => {
    await ipc.moa.openMoa(moaId);
  }, []);
  return (
    <div
      className="flex flex-col h-full pt-10 border-r border-border-sidebar bg-sidebar text-text"
      style={{ WebkitAppRegion: 'drag', width: '300px' } as React.CSSProperties}
    >
      {/* Item list */}
      <div className="flex flex-col gap-1 px-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {moas.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border-sidebar bg-surface-muted px-4 py-6 text-sm text-text-soft">
            {t('moa:empty_recent', { defaultValue: '최근에 연 보관함이 없습니다.' })}
          </div>
        ) : (
          moas.map(moa => {
            return (
              <Button
                variant="list-item"
                key={moa.name + moa.path}
                onClick={() => {
                  void handleMoaClick(moa.moa_id);
                }}
                className="flex items-start justify-between rounded-lg px-3 py-2 transition-colors"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-muted text-icon-sidebar">
                    <MoaIcon />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="font-semibold text-text truncate">{moa.name}</span>
                    <span className="text-xs text-text-soft truncate">{moa.path}</span>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center pl-2">
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
          })
        )}
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
