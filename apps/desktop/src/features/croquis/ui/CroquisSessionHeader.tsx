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
  queueLength,
  session,
  onCapture,
  onSave,
  onMoveNext,
  onMovePrevious,
  onTogglePlayback,
}: CroquisSessionHeaderProps) {
  return (
    <header className="croquis-page__header">
      <div>
        <div className="app-kicker">Croquis Session</div>
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
          Prev
        </Button>
        <Button onClick={onTogglePlayback}>{isPlaying ? 'Pause' : 'Resume'}</Button>
        <Button
          disabled={!hasNext}
          onClick={() => {
            onMoveNext();
          }}
        >
          Next
        </Button>
        <Button disabled={isCurrentSaved} onClick={() => void onSave()}>
          {isCurrentSaved ? 'Saved' : 'Save'}
        </Button>
        <Button disabled={!isCaptureEnabled} onClick={() => void onCapture()}>
          Capture
        </Button>
      </div>
    </header>
  );
}
