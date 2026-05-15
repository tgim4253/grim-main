import type { Tag } from '@/shared/types';
import type { EditableSessionStep } from '@/entities/session-preset';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export function formatStepCount(stepCount: number, t: Translate) {
  return t('presets.step_count', {
    count: stepCount,
    formattedCount: stepCount.toLocaleString(),
    defaultValue: '{{formattedCount}} steps',
  });
}

export function formatAutoTagSummary(autoTags: readonly Tag[], t: Translate) {
  if (autoTags.length === 0) {
    return t('croquis.auto_tags.empty', { defaultValue: 'No auto tags' });
  }

  const visibleTagNames = autoTags.slice(0, 3).map(tag => tag.name);
  const hiddenTagCount = autoTags.length - visibleTagNames.length;

  return hiddenTagCount > 0
    ? `${visibleTagNames.join(', ')} +${String(hiddenTagCount)}`
    : visibleTagNames.join(', ');
}

export function formatStepOptionSummary(step: EditableSessionStep, t: Translate) {
  const enabledOptions = [
    step.autoAdvance
      ? t('presets.step_summary.auto_advance', { defaultValue: 'Auto-advance' })
      : t('presets.step_summary.manual_advance', { defaultValue: 'Manual advance' }),
    step.recordSaveEnabled
      ? t('presets.step_summary.records_save', { defaultValue: 'Records save' })
      : t('presets.step_summary.records_off', { defaultValue: 'Records off' }),
    step.captureEnabled ? t('common.capture', { defaultValue: 'Capture' }) : null,
    step.filterEnabled && step.grayscaleEnabled
      ? t('croquis.grayscale', { defaultValue: 'Grayscale' })
      : null,
    step.filterEnabled && step.blurEnabled
      ? t('presets.step_summary.blur_percent', {
          value: `${String(step.blurAmount)}%`,
          defaultValue: 'Blur {{value}}',
        })
      : null,
    step.resultRequired
      ? t('presets.step_summary.result_required', { defaultValue: 'Result required' })
      : null,
  ].filter((option): option is string => Boolean(option));

  return enabledOptions.join(' · ');
}
