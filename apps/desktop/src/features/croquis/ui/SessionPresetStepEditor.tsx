import type { KeyboardEvent } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ChipButton, CheckboxConditionalRow, CheckboxRow, Input } from '../../../shared/ui';
import { cx } from '../../../shared/lib/cx';
import type { Tag, TagGroup } from '../../../shared/types';
import type { EditableSessionStep } from '../lib/sessionPresetEditor';
import {
  DURATION_OPTIONS,
  DURATION_SLIDER_MAX_SECONDS,
  DURATION_STEP_SECONDS,
  clampDurationSeconds,
  composeDurationSeconds,
  formatDurationCompact,
  getDurationParts,
  normalizeDurationUnit,
} from '../lib/sessionPresetEditor';
import { AutoTagPicker } from './AutoTagPicker';
import './session-preset-step-editor.css';

type SessionPresetStepEditorProps = {
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
  onGrayscaleChange: (checked: boolean) => void;
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
  onGrayscaleChange,
  onRequireResultChange,
  onResultSavePathChange,
  onAutoTagAdd,
  onAutoTagRemove,
}: SessionPresetStepEditorProps) {
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
        console.error('Failed to open result save path picker.', error);
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
            <span className="session-preset-step-editor__label">Duration</span>
            <span className="session-preset-step-editor__value">
              {formatDurationCompact(durationSeconds)}
            </span>
          </div>

          <div className="session-preset-step-editor__duration-row" aria-label="Step duration">
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
            aria-label="Step duration in seconds"
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
              aria-label="Step duration hours"
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
              aria-label="Step duration minutes"
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
              aria-label="Step duration seconds"
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
            label="Asset Tags"
            tags={step.autoTags}
            availableTags={availableAutoTags}
            tagGroups={autoTagGroups}
            disabled={disabled}
            emptyLabel="No auto tags"
            onTagAdd={onAutoTagAdd}
            onTagRemove={onAutoTagRemove}
          />
        ) : null}
      </div>

      <div className="session-preset-step-editor__column">
        <section className="session-preset-step-editor__group">
          <span className="session-preset-step-editor__label">Step Settings</span>
          <div className="session-preset-step-editor__settings">
            <CheckboxRow
              label="Auto-advance"
              checked={step.autoAdvance}
              onCheckedChange={onAutoAdvanceChange}
              width="full"
              disabled={disabled}
            />
            <CheckboxConditionalRow
              label="Records Save"
              checked={step.recordSaveEnabled}
              onCheckedChange={onRecordsSaveChange}
              width="full"
              disabled={disabled}
              childrenClassName="session-preset-step-editor__nested-settings"
            >
              <CheckboxRow
                label="Require result"
                checked={step.resultRequired}
                onCheckedChange={onRequireResultChange}
                width="full"
                disabled={disabled}
              />
              <CheckboxRow
                label="Capture enabled"
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
                <span className="session-preset-step-editor__label">Result save path</span>
                <span className="session-preset-step-editor__path-control">
                  <input
                    className="session-preset-step-editor__path-input"
                    value={resultSavePathValue}
                    placeholder="Click to choose folder"
                    disabled
                    readOnly
                    aria-label="Selected result save path"
                  />
                </span>
              </label>
            </CheckboxConditionalRow>
            <CheckboxRow
              label="Grayscale"
              checked={step.grayscaleEnabled}
              onCheckedChange={onGrayscaleChange}
              width="full"
              disabled={disabled}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
