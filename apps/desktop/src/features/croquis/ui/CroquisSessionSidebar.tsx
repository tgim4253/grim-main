import { useTranslation } from 'react-i18next';
import type { CroquisSession, CroquisSessionItem } from '../../../shared/types';
import { clampFilterPercent, getRuntimeSessionFilterSettings } from '@/entities/session-preset';

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
  const { t } = useTranslation('common');
  const filterSettings = getRuntimeSessionFilterSettings(session.presetId, currentItem.stepIndex, {
    filterEnabled: currentItem.grayscaleEnabled,
    grayscaleEnabled: currentItem.grayscaleEnabled,
  });
  const optionValue = (value: boolean) =>
    value ? t('common.on', { defaultValue: 'On' }) : t('common.off', { defaultValue: 'Off' });
  const grayscaleValue =
    filterSettings.filterEnabled && filterSettings.grayscaleEnabled ? '100%' : '0%';
  const blurValue = (enabled: boolean, value: number) =>
    filterSettings.filterEnabled && enabled ? `${String(clampFilterPercent(value))}%` : '0%';

  return (
    <aside className="croquis-page__sidebar">
      <div className="croquis-panel">
        <div className="app-kicker">
          {t('croquis.current_item', { defaultValue: 'Current Item' })}
        </div>
        <strong>{currentItem.fileName}</strong>
        <span>{currentItem.stepName}</span>
      </div>

      <div className="croquis-panel">
        <div className="app-kicker">{t('croquis.timer', { defaultValue: 'Timer' })}</div>
        <strong className="croquis-page__timer">
          {formatSeconds(
            currentTargetSeconds > 0
              ? Math.max(currentTargetSeconds - elapsedSeconds, 0)
              : elapsedSeconds,
          )}
        </strong>
        <span>
          {currentTargetSeconds > 0
            ? t('croquis.target_time', {
                time: formatSeconds(currentTargetSeconds),
                defaultValue: 'Target {{time}}',
              })
            : t('croquis.free_timer', { defaultValue: 'Free timer' })}
        </span>
      </div>

      <div className="croquis-panel">
        <div className="app-kicker">
          {t('croquis.session_options', { defaultValue: 'Session Options' })}
        </div>
        <span>
          {t('croquis.option.shuffle', {
            value: optionValue(session.isShuffle),
            defaultValue: 'Shuffle: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.filter', {
            value: optionValue(filterSettings.filterEnabled),
            defaultValue: 'Filter: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.grayscale', {
            value: grayscaleValue,
            defaultValue: 'Grayscale: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.blur', {
            value: blurValue(filterSettings.blurEnabled, filterSettings.blurAmount),
            defaultValue: 'Blur: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.records_save', {
            value: optionValue(currentItem.recordSaveEnabled),
            defaultValue: 'Records Save: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.require_result', {
            value: optionValue(currentItem.resultRequired),
            defaultValue: 'Require Result: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.capture', {
            value: optionValue(currentItem.captureEnabled),
            defaultValue: 'Capture: {{value}}',
          })}
        </span>
        <span>
          {t('croquis.option.auto_advance', {
            value: optionValue(currentItem.autoAdvance),
            defaultValue: 'Auto-advance: {{value}}',
          })}
        </span>
      </div>

      {status ? <div className="croquis-inline-status">{status}</div> : null}
    </aside>
  );
}
