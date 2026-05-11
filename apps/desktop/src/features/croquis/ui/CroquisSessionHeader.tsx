import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui';
import type { CroquisSession } from '../../../shared/types';

type CroquisSessionHeaderProps = {
  currentIndex: number;
  currentStepName: string;
  hasNext: boolean;
  hasPrevious: boolean;
  isCaptureEnabled: boolean;
  isCurrentSaved: boolean;
  isPlaying: boolean;
  isRecordSaveEnabled: boolean;
  queueLength: number;
  session: CroquisSession;
  onCapture: () => Promise<void>;
  onSave: () => Promise<void>;
  onMoveNext: () => void;
  onMovePrevious: () => void;
  onTogglePlayback: () => void;
};

export function CroquisSessionHeader({
  currentIndex,
  currentStepName,
  hasNext,
  hasPrevious,
  isCaptureEnabled,
  isCurrentSaved,
  isPlaying,
  isRecordSaveEnabled,
  queueLength,
  session,
  onCapture,
  onSave,
  onMoveNext,
  onMovePrevious,
  onTogglePlayback,
}: CroquisSessionHeaderProps) {
  const { t } = useTranslation('common');

  return (
    <header className="croquis-page__header">
      <div>
        <div className="app-kicker">
          {t('croquis.session', { defaultValue: 'Croquis Session' })}
        </div>
        <strong className="croquis-page__title">{session.title}</strong>
        <span className="croquis-page__copy">
          {currentIndex + 1} / {queueLength} · {currentStepName}
        </span>
      </div>

      <div className="croquis-page__actions">
        <Button
          disabled={!hasPrevious}
          onClick={() => {
            onMovePrevious();
          }}
        >
          {t('common.prev', { defaultValue: 'Prev' })}
        </Button>
        <Button onClick={onTogglePlayback}>
          {isPlaying
            ? t('common.pause', { defaultValue: 'Pause' })
            : t('common.resume', { defaultValue: 'Resume' })}
        </Button>
        <Button
          disabled={!hasNext}
          onClick={() => {
            onMoveNext();
          }}
        >
          {t('common.next', { defaultValue: 'Next' })}
        </Button>
        <Button disabled={!isRecordSaveEnabled || isCurrentSaved} onClick={() => void onSave()}>
          {!isRecordSaveEnabled
            ? t('croquis.save_off', { defaultValue: 'Save Off' })
            : isCurrentSaved
              ? t('common.saved', { defaultValue: 'Saved' })
              : t('common.save', { defaultValue: 'Save' })}
        </Button>
        <Button disabled={!isCaptureEnabled} onClick={() => void onCapture()}>
          {t('common.capture', { defaultValue: 'Capture' })}
        </Button>
      </div>
    </header>
  );
}
