import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { cx } from '../../../shared/lib/cx';
import { ipc } from '../../../shared/lib/ipc';
import { IconButton } from '../../../shared/ui';
import type { CroquisSession, CroquisSessionItem } from '../../../shared/types';
import { clampFilterPercent, getRuntimeSessionFilterSettings } from '@/entities/session-preset';
import { useCroquisSessionController } from '../lib/useCroquisSessionController';
import { CroquisQuickActionMenu, type CroquisQuickAction } from './CroquisQuickActionMenu';
import './croquis.css';

const MAC_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/i;
const QUICK_ACTION_MENU_MARGIN = 8;
const QUICK_ACTION_MENU_WIDTH = 160;
const QUICK_ACTION_MENU_ROW_HEIGHT = 36;
const QUICK_ACTION_MENU_VERTICAL_PADDING = 8;
const QUICK_ACTION_STATUS_DISMISS_MS = 2200;

type CroquisQuickActionTarget = 'image';

type CroquisQuickActionMenuState = {
  grayscale: boolean;
  imageSrc: string;
  sourcePath: string;
  target: CroquisQuickActionTarget;
  x: number;
  y: number;
};

type QuickActionMenuPosition = {
  x: number;
  y: number;
};

const isMacPlatform = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return MAC_PLATFORM_PATTERN.test(navigator.userAgent);
};

const shouldShowCustomWindowControls = () => {
  return !isMacPlatform();
};

const getCroquisImageStyle = (session: CroquisSession, item: CroquisSessionItem): CSSProperties => {
  const filterSettings = getCroquisImageFilterSettings(session, item);

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

const getCroquisImageFilterSettings = (session: CroquisSession, item: CroquisSessionItem) =>
  getRuntimeSessionFilterSettings(session.presetId, item.stepIndex, {
    filterEnabled: item.grayscaleEnabled,
    grayscaleEnabled: item.grayscaleEnabled,
  });

function getQuickActionMenuPosition(
  clientX: number,
  clientY: number,
  actionCount: number,
): QuickActionMenuPosition {
  const menuHeight =
    actionCount * QUICK_ACTION_MENU_ROW_HEIGHT + QUICK_ACTION_MENU_VERTICAL_PADDING;
  const maxX = Math.max(QUICK_ACTION_MENU_MARGIN, window.innerWidth - QUICK_ACTION_MENU_WIDTH);
  const maxY = Math.max(QUICK_ACTION_MENU_MARGIN, window.innerHeight - menuHeight);

  return {
    x: Math.min(Math.max(clientX, QUICK_ACTION_MENU_MARGIN), maxX),
    y: Math.min(Math.max(clientY, QUICK_ACTION_MENU_MARGIN), maxY),
  };
}

type CopyImageToClipboardOptions = {
  grayscale: boolean;
  imageSrc: string;
  sourcePath: string;
};

async function createGrayscaleImageBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to prepare image for clipboard.');
    }

    context.drawImage(bitmap, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let index = 0; index < data.length; index += 4) {
      const grayscale = Math.round(
        data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
      );
      data[index] = grayscale;
      data[index + 1] = grayscale;
      data[index + 2] = grayscale;
    }
    context.putImageData(imageData, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(nextBlob => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }

        reject(new Error('Failed to prepare image for clipboard.'));
      }, 'image/png');
    });
  } finally {
    bitmap.close();
  }
}

async function copyImageToClipboard({
  grayscale,
  imageSrc,
  sourcePath,
}: CopyImageToClipboardOptions) {
  if (isTauri()) {
    await ipc.clipboard.copyImage(sourcePath, { grayscale });
    return;
  }

  const clipboard = navigator.clipboard as Clipboard | undefined;

  if (typeof ClipboardItem === 'undefined' || typeof clipboard?.write !== 'function') {
    throw new Error('Image clipboard writes are unavailable.');
  }

  const response = await fetch(imageSrc);
  if (!response.ok) {
    throw new Error('Failed to load image for clipboard.');
  }

  const blob = await response.blob();
  const clipboardBlob = grayscale ? await createGrayscaleImageBlob(blob) : blob;
  const mimeType = clipboardBlob.type.startsWith('image/') ? clipboardBlob.type : 'image/png';

  await clipboard.write([new ClipboardItem({ [mimeType]: clipboardBlob })]);
}

function CroquisWindowControls() {
  const { t } = useTranslation('common');

  return (
    <div
      className="croquis-page__frame-controls"
      role="toolbar"
      aria-label={t('croquis.window_controls', { defaultValue: 'Window controls' })}
    >
      <IconButton
        icon="minus"
        size="sm"
        className="croquis-page__frame-button"
        aria-label={t('common.minimize', { defaultValue: 'Minimize' })}
        title={t('common.minimize', { defaultValue: 'Minimize' })}
        onClick={() => {
          void ipc.window.minimize();
        }}
      />
      <IconButton
        icon="close"
        size="sm"
        className="croquis-page__frame-button croquis-page__frame-button--close"
        aria-label={t('common.close', { defaultValue: 'Close' })}
        title={t('common.close', { defaultValue: 'Close' })}
        onClick={() => {
          void ipc.window.close();
        }}
      />
    </div>
  );
}

export function CroquisWindow() {
  const { t } = useTranslation('common');
  const [params] = useSearchParams();
  const [isHovering, setIsHovering] = useState(false);
  const [quickActionMenu, setQuickActionMenu] = useState<CroquisQuickActionMenuState | null>(null);
  const [quickActionStatus, setQuickActionStatus] = useState<string | null>(null);
  const hasMacWindowControls = isMacPlatform();
  const hasCustomWindowControls = shouldShowCustomWindowControls();
  const controller = useCroquisSessionController({
    sessionId: params.get('session_id'),
  });
  const { currentItem, session } = controller;
  const visibleStatus = quickActionStatus ?? controller.status;

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

  useEffect(() => {
    if (quickActionStatus === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setQuickActionStatus(null);
    }, QUICK_ACTION_STATUS_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [quickActionStatus]);

  const handleCopyImage = useCallback(() => {
    const target = quickActionMenu?.target === 'image' ? quickActionMenu : null;
    if (!target) {
      return;
    }

    setQuickActionMenu(null);
    void copyImageToClipboard({
      grayscale: target.grayscale,
      imageSrc: target.imageSrc,
      sourcePath: target.sourcePath,
    })
      .then(() => {
        setQuickActionStatus(
          t('croquis.quick_actions.copy_image_success', { defaultValue: 'Image copied.' }),
        );
      })
      .catch((error: unknown) => {
        console.error('Failed to copy croquis image.', error);
        setQuickActionStatus(
          t('croquis.quick_actions.copy_image_unavailable', {
            defaultValue: 'Copy image is unavailable.',
          }),
        );
      });
  }, [quickActionMenu, t]);

  const quickActions = useMemo<CroquisQuickAction[]>(() => {
    if (quickActionMenu?.target !== 'image') {
      return [];
    }

    return [
      {
        id: 'copy-image',
        label: t('croquis.quick_actions.copy_image', { defaultValue: 'Copy Image' }),
        onSelect: handleCopyImage,
      },
    ];
  }, [handleCopyImage, quickActionMenu?.target, t]);

  const handleImageContextMenu = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      if (session === null || currentItem === null) {
        return;
      }

      const imageSrc = event.currentTarget.currentSrc || controller.currentImageSrc;
      const { sourcePath } = currentItem;
      if (!imageSrc) {
        return;
      }

      const filterSettings = getCroquisImageFilterSettings(session, currentItem);

      event.preventDefault();
      event.stopPropagation();
      setIsHovering(true);

      const position = getQuickActionMenuPosition(event.clientX, event.clientY, 1);
      setQuickActionMenu({
        grayscale: filterSettings.filterEnabled && filterSettings.grayscaleEnabled,
        imageSrc,
        sourcePath,
        target: 'image',
        ...position,
      });
    },
    [controller.currentImageSrc, currentItem, session],
  );

  if (!session || !currentItem) {
    return (
      <div
        className={cx(
          'croquis-page',
          'croquis-page--empty',
          hasMacWindowControls && 'croquis-page--mac-frame',
          hasCustomWindowControls && 'croquis-page--custom-frame',
        )}
      >
        {hasCustomWindowControls ? <CroquisWindowControls /> : null}
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
      className={cx(
        'croquis-page',
        hasMacWindowControls && 'croquis-page--mac-frame',
        hasCustomWindowControls && 'croquis-page--custom-frame',
      )}
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
      {hasCustomWindowControls ? <CroquisWindowControls /> : null}
      <div className="croquis-page__drag-region" data-tauri-drag-region aria-hidden />

      <main className="croquis-page__stage" data-tauri-drag-region>
        {controller.currentImageSrc ? (
          <img
            src={controller.currentImageSrc}
            alt={currentItem.fileName}
            className="croquis-page__image"
            data-tauri-drag-region
            style={getCroquisImageStyle(session, currentItem)}
            onContextMenu={handleImageContextMenu}
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

      {visibleStatus ? (
        <div className="croquis-page__status" role="status">
          {visibleStatus}
        </div>
      ) : null}

      {quickActionMenu && quickActions.length > 0 ? (
        <CroquisQuickActionMenu
          actions={quickActions}
          ariaLabel={t('croquis.quick_actions.menu_label', {
            defaultValue: 'Croquis quick actions',
          })}
          x={quickActionMenu.x}
          y={quickActionMenu.y}
          onClose={() => {
            setQuickActionMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}
