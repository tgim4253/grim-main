import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { IconButton } from '../../../shared/ui';
import type { CroquisSession, CroquisSessionItem } from '../../../shared/types';
import { clampFilterPercent, getRuntimeSessionFilterSettings } from '../lib/sessionPresetEditor';
import { useCroquisSessionController } from '../lib/useCroquisSessionController';
import './croquis.css';

const getCroquisImageStyle = (session: CroquisSession, item: CroquisSessionItem): CSSProperties => {
  const filterSettings = getRuntimeSessionFilterSettings(session.presetId, item.stepIndex, {
    filterEnabled: item.grayscaleEnabled,
    grayscaleEnabled: item.grayscaleEnabled,
  });

  if (!filterSettings.filterEnabled) {
    return {};
  }

  const filterParts: string[] = [];

  if (filterSettings.grayscaleEnabled) {
    filterParts.push('grayscale(100%)');
  }

  if (filterSettings.blurEnabled) {
    const whiteoutAmount = clampFilterPercent(filterSettings.blurAmount);
    filterParts.push(`contrast(${String(100 - whiteoutAmount)}%)`);
    filterParts.push(`brightness(${String(100 + whiteoutAmount)}%)`);
  }

  return {
    filter: filterParts.length > 0 ? filterParts.join(' ') : undefined,
  };
};

export function CroquisWindow() {
  const { t } = useTranslation('common');
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
          {controller.status ??
            t('croquis.loading_session', { defaultValue: 'Loading croquis session...' })}
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
            style={getCroquisImageStyle(session, currentItem)}
          />
        ) : (
          <div className="croquis-page__empty">
            {t('croquis.image_preview_unavailable', {
              defaultValue: 'Image preview unavailable.',
            })}
          </div>
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

        <div
          className="croquis-page__transport"
          role="toolbar"
          aria-label={t('croquis.controls', { defaultValue: 'Croquis controls' })}
        >
          <IconButton
            icon="skip-back"
            size="lg"
            aria-label={t('croquis.previous_image', { defaultValue: 'Previous image' })}
            title={t('common.previous', { defaultValue: 'Previous' })}
            disabled={!controller.hasPrevious}
            onClick={() => {
              controller.moveToIndex(controller.currentIndex - 1);
            }}
          />
          <IconButton
            icon={controller.isPlaying ? 'pause' : 'play'}
            size="lg"
            active={controller.isPlaying}
            aria-label={
              controller.isPlaying
                ? t('croquis.pause_session', { defaultValue: 'Pause session' })
                : t('croquis.resume_session', { defaultValue: 'Resume session' })
            }
            title={
              controller.isPlaying
                ? t('common.pause', { defaultValue: 'Pause' })
                : t('common.resume', { defaultValue: 'Resume' })
            }
            onClick={() => {
              controller.setIsPlaying(value => !value);
            }}
          />
          <IconButton
            icon="skip-forward"
            size="lg"
            aria-label={t('croquis.next_image', { defaultValue: 'Next image' })}
            title={t('common.next', { defaultValue: 'Next' })}
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
              aria-label={
                controller.isCurrentSaved
                  ? t('croquis.record_saved', { defaultValue: 'Record saved' })
                  : t('croquis.save_record', { defaultValue: 'Save record' })
              }
              title={
                controller.isCurrentSaved
                  ? t('common.saved', { defaultValue: 'Saved' })
                  : t('common.save', { defaultValue: 'Save' })
              }
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
              aria-label={t('croquis.capture_result', { defaultValue: 'Capture result' })}
              title={t('common.capture', { defaultValue: 'Capture' })}
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
