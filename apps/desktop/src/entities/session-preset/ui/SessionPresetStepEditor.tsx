import type { KeyboardEvent } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import {
  ChipButton,
  CheckboxConditionalRow,
  CheckboxProgressConditionalRow,
  CheckboxRow,
  Input,
} from '@/shared/ui';
import { cx } from '@/shared/lib/cx';
import type { Tag, TagGroup } from '@/shared/types';
import type { EditableSessionStep } from '../model/editor';
import {
  DURATION_OPTIONS,
  DURATION_SLIDER_MAX_SECONDS,
  DURATION_STEP_SECONDS,
  FILTER_PERCENT_MAX,
  FILTER_PERCENT_MIN,
  FILTER_PERCENT_STEP,
  clampDurationSeconds,
  clampFilterPercent,
  composeDurationSeconds,
  formatDurationCompact,
  getDurationParts,
  normalizeDurationUnit,
} from '../model/editor';
import { AutoTagPicker } from './AutoTagPicker';
import './session-preset-step-editor.css';

export type SessionPresetStepEditorProps = {
  step: EditableSessionStep;
  durationSeconds: number;
  className?: string;
  disabled?: boolean;
  showTagSummary?: boolean;
  availableAutoTags?: readonly Tag[];
  autoTagGroups?: readonly TagGroup[];
  onTimerChange: (seconds: number) => void;
  onAutoAdvanceChange: (checked: boolean) => void;
  onCaptureChange: (checked: boolean) => void;
  onRecordsSaveChange: (checked: boolean) => void;
  onFilterChange: (checked: boolean) => void;
  onGrayscaleChange: (checked: boolean) => void;
  onBlurChange: (checked: boolean) => void;
  onBlurAmountChange: (value: number) => void;
  onRequireResultChange: (checked: boolean) => void;
  onResultSavePathChange: (path: string) => void;
  onAutoTagAdd?: (tag: Tag) => void;
  onAutoTagRemove?: (tagId: string) => void;
};

function getDialogStringSelection(selection: unknown) {
  if (typeof selection === 'string') {
    return selection;
  }

  if (Array.isArray(selection)) {
    const [firstSelection] = selection as unknown[];
    return typeof firstSelection === 'string' ? firstSelection : null;
  }

  return null;
}

export function SessionPresetStepEditor({
  step,
  durationSeconds,
  className,
  disabled = false,
  showTagSummary = true,
  availableAutoTags = [],
  autoTagGroups = [],
  onTimerChange,
  onAutoAdvanceChange,
  onCaptureChange,
  onRecordsSaveChange,
  onFilterChange,
  onGrayscaleChange,
  onBlurChange,
  onBlurAmountChange,
  onRequireResultChange,
  onResultSavePathChange,
  onAutoTagAdd,
  onAutoTagRemove,
}: SessionPresetStepEditorProps) {
  const { t } = useTranslation('common');
  const durationParts = getDurationParts(durationSeconds);
  const resultSavePathValue = step.resultSavePath ?? '';
  const handleResultSavePathPick = () => {
    if (disabled) {
      return;
    }

    void (async () => {
      try {
        const selection = (await open({
          multiple: false,
          directory: true,
        })) as unknown;
        const selectedPath = getDialogStringSelection(selection);

        if (typeof selectedPath === 'string' && selectedPath.trim()) {
          onResultSavePathChange(selectedPath);
        }
      } catch (error) {
        console.error(
          t('croquis.error.open_result_save_path_picker', {
            defaultValue: 'Failed to open result save path picker.',
          }),
          error,
        );
      }
    })();
  };

  const handleResultSavePathKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    handleResultSavePathPick();
  };

  return (
    <div className={cx('session-preset-step-editor', className)}>
      <div className="session-preset-step-editor__column">
        <section className="session-preset-step-editor__group">
          <div className="session-preset-step-editor__group-header">
            <span className="session-preset-step-editor__label">
              {t('croquis.duration', { defaultValue: 'Duration' })}
            </span>
            <span className="session-preset-step-editor__value">
              {formatDurationCompact(durationSeconds)}
            </span>
          </div>

          <div
            className="session-preset-step-editor__duration-row"
            aria-label={t('croquis.step_duration', { defaultValue: 'Step duration' })}
          >
            {DURATION_OPTIONS.map(duration => (
              <ChipButton
                key={duration.value}
                shape="pill"
                variant="outline"
                pressed={durationSeconds === duration.value}
                disabled={disabled}
                onClick={() => {
                  onTimerChange(duration.value);
                }}
              >
                {duration.label}
              </ChipButton>
            ))}
          </div>

          <input
            className="session-preset-step-editor__duration-slider"
            type="range"
            min={0}
            max={DURATION_SLIDER_MAX_SECONDS}
            step={DURATION_STEP_SECONDS}
            value={Math.min(durationSeconds, DURATION_SLIDER_MAX_SECONDS)}
            aria-label={t('croquis.step_duration_seconds', {
              defaultValue: 'Step duration in seconds',
            })}
            disabled={disabled}
            onChange={event => {
              onTimerChange(clampDurationSeconds(Number(event.target.value)));
            }}
          />

          <div className="session-preset-step-editor__duration-inputs">
            <Input
              className="session-preset-step-editor__duration-input"
              label="h"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={durationParts.hours}
              aria-label={t('croquis.step_duration_hours', {
                defaultValue: 'Step duration hours',
              })}
              disabled={disabled}
              onChange={event => {
                onTimerChange(
                  composeDurationSeconds({
                    ...durationParts,
                    hours: normalizeDurationUnit(event.target.value),
                  }),
                );
              }}
            />
            <Input
              className="session-preset-step-editor__duration-input"
              label="m"
              type="number"
              min={0}
              max={59}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={durationParts.minutes}
              aria-label={t('croquis.step_duration_minutes', {
                defaultValue: 'Step duration minutes',
              })}
              disabled={disabled}
              onChange={event => {
                onTimerChange(
                  composeDurationSeconds({
                    ...durationParts,
                    minutes: normalizeDurationUnit(event.target.value, 59),
                  }),
                );
              }}
            />
            <Input
              className="session-preset-step-editor__duration-input"
              label="s"
              type="number"
              min={0}
              max={59}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={durationParts.seconds}
              aria-label={t('croquis.step_duration_seconds_input', {
                defaultValue: 'Step duration seconds',
              })}
              disabled={disabled}
              onChange={event => {
                onTimerChange(
                  composeDurationSeconds({
                    ...durationParts,
                    seconds: normalizeDurationUnit(event.target.value, 59),
                  }),
                );
              }}
            />
          </div>
        </section>

        {showTagSummary ? (
          <AutoTagPicker
            label={t('croquis.asset_tags', { defaultValue: 'Asset Tags' })}
            tags={step.autoTags}
            availableTags={availableAutoTags}
            tagGroups={autoTagGroups}
            disabled={disabled}
            emptyLabel={t('croquis.auto_tags.empty', { defaultValue: 'No auto tags' })}
            onTagAdd={onAutoTagAdd}
            onTagRemove={onAutoTagRemove}
          />
        ) : null}
      </div>

      <div className="session-preset-step-editor__column">
        <section className="session-preset-step-editor__group">
          <span className="session-preset-step-editor__label">
            {t('croquis.step_settings', { defaultValue: 'Step Settings' })}
          </span>
          <div className="session-preset-step-editor__settings">
            <CheckboxRow
              label={t('croquis.auto_advance', { defaultValue: 'Auto-advance' })}
              checked={step.autoAdvance}
              onCheckedChange={onAutoAdvanceChange}
              width="full"
              disabled={disabled}
            />
            <CheckboxConditionalRow
              label={t('croquis.records_save', { defaultValue: 'Records Save' })}
              checked={step.recordSaveEnabled}
              onCheckedChange={onRecordsSaveChange}
              width="full"
              disabled={disabled}
              childrenClassName="session-preset-step-editor__nested-settings"
            >
              <CheckboxRow
                label={t('croquis.require_result', { defaultValue: 'Require result' })}
                checked={step.resultRequired}
                onCheckedChange={onRequireResultChange}
                width="full"
                disabled={disabled}
              />
              <CheckboxRow
                label={t('croquis.capture_enabled', { defaultValue: 'Capture enabled' })}
                checked={step.captureEnabled}
                onCheckedChange={onCaptureChange}
                width="full"
                disabled={disabled}
              />
              <label
                className="session-preset-step-editor__path-picker"
                data-disabled={disabled ? 'true' : undefined}
                role={disabled ? undefined : 'button'}
                tabIndex={disabled ? undefined : 0}
                onClick={handleResultSavePathPick}
                onKeyDown={handleResultSavePathKeyDown}
              >
                <span className="session-preset-step-editor__label">
                  {t('croquis.result_save_path', { defaultValue: 'Result save path' })}
                </span>
                <span className="session-preset-step-editor__path-control">
                  <input
                    className="session-preset-step-editor__path-input"
                    value={resultSavePathValue}
                    placeholder={t('croquis.choose_folder_placeholder', {
                      defaultValue: 'Click to choose folder',
                    })}
                    disabled
                    readOnly
                    aria-label={t('croquis.selected_result_save_path', {
                      defaultValue: 'Selected result save path',
                    })}
                  />
                </span>
              </label>
            </CheckboxConditionalRow>
            <CheckboxConditionalRow
              label={t('common.filter', { defaultValue: 'Filter' })}
              checked={step.filterEnabled}
              onCheckedChange={onFilterChange}
              width="full"
              disabled={disabled}
              childrenClassName="session-preset-step-editor__nested-settings"
            >
              <CheckboxRow
                label={t('croquis.grayscale', { defaultValue: 'Grayscale' })}
                checked={step.grayscaleEnabled}
                width="full"
                disabled={disabled}
                onCheckedChange={onGrayscaleChange}
              />
              <CheckboxProgressConditionalRow
                label={t('croquis.blur', { defaultValue: 'Blur' })}
                checked={step.blurEnabled}
                value={clampFilterPercent(step.blurAmount)}
                min={FILTER_PERCENT_MIN}
                max={FILTER_PERCENT_MAX}
                step={FILTER_PERCENT_STEP}
                width="full"
                disabled={disabled}
                rangeAriaLabel={t('croquis.blur_amount', {
                  defaultValue: 'Blur amount',
                })}
                onCheckedChange={onBlurChange}
                onValueChange={onBlurAmountChange}
              />
            </CheckboxConditionalRow>
          </div>
        </section>
      </div>
    </div>
  );
}
