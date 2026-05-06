import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconButton } from '../../../shared/ui';
import { useCroquisSessionController } from '../lib/useCroquisSessionController';
import './croquis.css';

export function CroquisWindow() {
  const [params] = useSearchParams();
  const [isHovering, setIsHovering] = useState(false);
  const controller = useCroquisSessionController({
    sessionId: params.get('session_id'),
  });
  const { currentItem, session } = controller;

  useEffect(() => {
    const previousBodyBackground = document.body.style.background;
    const previousHtmlBackground = document.documentElement.style.background;

    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';

    return () => {
      document.body.style.background = previousBodyBackground;
      document.documentElement.style.background = previousHtmlBackground;
    };
  }, []);

  if (!session || !currentItem) {
    return (
      <div className="croquis-page croquis-page--empty">
        <div className="croquis-page__empty">
          {controller.status ?? 'Loading croquis session...'}
        </div>
      </div>
    );
  }

  const hasTimedStep = controller.currentTargetSeconds > 0;
  const remainingSeconds = hasTimedStep
    ? Math.max(controller.currentTargetSeconds - controller.elapsedSeconds, 0)
    : controller.elapsedSeconds;
  const progress = hasTimedStep
    ? Math.min(Math.max(controller.elapsedSeconds / controller.currentTargetSeconds, 0), 1)
    : 0;
  const isCritical = hasTimedStep && progress >= 0.9;
  const captureVisible = controller.isCaptureEnabled;
  const captureDisabled = !controller.isRecordSaveEnabled;

  return (
    <div
      className="croquis-page"
      onMouseEnter={() => {
        setIsHovering(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
      }}
      onFocusCapture={() => {
        setIsHovering(true);
      }}
      onBlurCapture={() => {
        setIsHovering(false);
      }}
    >
      <div className="croquis-page__drag-region" data-tauri-drag-region aria-hidden />

      <main className="croquis-page__stage" data-tauri-drag-region>
        {controller.currentImageSrc ? (
          <img
            src={controller.currentImageSrc}
            alt={currentItem.fileName}
            className="croquis-page__image"
            data-tauri-drag-region
            style={{
              filter: currentItem.grayscaleEnabled ? 'grayscale(1)' : undefined,
            }}
          />
        ) : (
          <div className="croquis-page__empty">Image preview unavailable.</div>
        )}
      </main>

      <div className={`croquis-page__overlay${isHovering ? ' is-visible' : ''}`}>
        <div className="croquis-page__topbar">
          <div className="croquis-page__meta">
            <span className="croquis-page__count">
              {controller.currentIndex + 1} / {controller.queue.length}
            </span>
            <strong>{currentItem.stepName}</strong>
            <span>{controller.formatSeconds(remainingSeconds)}</span>
          </div>
        </div>

        <div className="croquis-page__transport" role="toolbar" aria-label="Croquis controls">
          <IconButton
            icon="skip-back"
            size="lg"
            aria-label="Previous image"
            title="Previous"
            disabled={!controller.hasPrevious}
            onClick={() => {
              controller.moveToIndex(controller.currentIndex - 1);
            }}
          />
          <IconButton
            icon={controller.isPlaying ? 'pause' : 'play'}
            size="lg"
            active={controller.isPlaying}
            aria-label={controller.isPlaying ? 'Pause session' : 'Resume session'}
            title={controller.isPlaying ? 'Pause' : 'Resume'}
            onClick={() => {
              controller.setIsPlaying(value => !value);
            }}
          />
          <IconButton
            icon="skip-forward"
            size="lg"
            aria-label="Next image"
            title="Next"
            disabled={!controller.hasNext}
            onClick={() => {
              controller.moveToIndex(controller.currentIndex + 1);
            }}
          />
          {controller.isRecordSaveEnabled ? (
            <IconButton
              icon="check"
              size="lg"
              active={controller.isCurrentSaved}
              aria-label={controller.isCurrentSaved ? 'Record saved' : 'Save record'}
              title={controller.isCurrentSaved ? 'Saved' : 'Save'}
              disabled={controller.isCurrentSaved}
              onClick={() => {
                void controller.handleSave();
              }}
            />
          ) : null}
          {captureVisible ? (
            <IconButton
              icon="camera"
              size="lg"
              aria-label="Capture result"
              title="Capture"
              disabled={captureDisabled}
              onClick={() => {
                void controller.handleCapture();
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="croquis-page__progress" aria-hidden>
        <div
          className={`croquis-page__progress-bar${isCritical ? ' is-critical' : ''}`}
          style={{ width: `${String(Math.min(100, Math.max(0, progress * 100)))}%` }}
        />
      </div>

      {controller.status ? (
        <div className="croquis-page__status" role="status">
          {controller.status}
        </div>
      ) : null}
    </div>
  );
}
