import { Button } from '../../../shared/ui';
import type { CroquisSession } from '../../../shared/types';

type CroquisSessionHeaderProps = {
  currentIndex: number;
  currentStepName: string;
  hasNext: boolean;
  hasPrevious: boolean;
  isCaptureEnabled: boolean;
  isPlaying: boolean;
  queueLength: number;
  session: CroquisSession;
  onCapture: () => Promise<void>;
  onMoveNext: () => Promise<void>;
  onMovePrevious: () => Promise<void>;
  onTogglePlayback: () => void;
};

export function CroquisSessionHeader({
  currentIndex,
  currentStepName,
  hasNext,
  hasPrevious,
  isCaptureEnabled,
  isPlaying,
  queueLength,
  session,
  onCapture,
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
        <Button variant="secondary" disabled={!hasPrevious} onClick={() => void onMovePrevious()}>
          Prev
        </Button>
        <Button variant="secondary" onClick={onTogglePlayback}>
          {isPlaying ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="secondary" disabled={!hasNext} onClick={() => void onMoveNext()}>
          Next
        </Button>
        <Button variant="primary" disabled={!isCaptureEnabled} onClick={() => void onCapture()}>
          Capture
        </Button>
      </div>
    </header>
  );
}
