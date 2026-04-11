import type { CroquisSession, CroquisSessionItem } from '../../../shared/types';

type CroquisSessionSidebarProps = {
  currentItem: CroquisSessionItem;
  currentTargetSeconds: number;
  elapsedSeconds: number;
  formatSeconds: (value: number) => string;
  session: CroquisSession;
  status: string | null;
};

export function CroquisSessionSidebar({
  currentItem,
  currentTargetSeconds,
  elapsedSeconds,
  formatSeconds,
  session,
  status,
}: CroquisSessionSidebarProps) {
  return (
    <aside className="croquis-page__sidebar">
      <div className="croquis-panel">
        <div className="app-kicker">Current Item</div>
        <strong>{currentItem.fileName}</strong>
        <span>{currentItem.stepName}</span>
      </div>

      <div className="croquis-panel">
        <div className="app-kicker">Timer</div>
        <strong className="croquis-page__timer">
          {formatSeconds(
            currentTargetSeconds > 0
              ? Math.max(currentTargetSeconds - elapsedSeconds, 0)
              : elapsedSeconds,
          )}
        </strong>
        <span>
          {currentTargetSeconds > 0
            ? `Target ${formatSeconds(currentTargetSeconds)}`
            : 'Free timer'}
        </span>
      </div>

      <div className="croquis-panel">
        <div className="app-kicker">Session Options</div>
        <span>Shuffle: {session.option.isShuffle ? 'On' : 'Off'}</span>
        <span>Grayscale: {session.option.isGray ? 'On' : 'Off'}</span>
        <span>Capture: {session.option.isCapture ? 'On' : 'Off'}</span>
        <span>Auto Skip: {session.option.auto.isSkip ? 'On' : 'Off'}</span>
      </div>

      {status ? <div className="croquis-inline-status">{status}</div> : null}
    </aside>
  );
}
