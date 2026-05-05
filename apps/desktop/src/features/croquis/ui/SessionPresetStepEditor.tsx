import { Chip, ChipButton, CheckboxConditionalRow, CheckboxRow, Input } from '../../../shared/ui';
import { cx } from '../../../shared/lib/cx';
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
import './session-preset-step-editor.css';

type SessionPresetStepEditorProps = {
  step: EditableSessionStep;
  durationSeconds: number;
  className?: string;
  disabled?: boolean;
  showTagSummary?: boolean;
  onTimerChange: (seconds: number) => void;
  onAutoAdvanceChange: (checked: boolean) => void;
  onCaptureChange: (checked: boolean) => void;
  onRecordsSaveChange: (checked: boolean) => void;
  onGrayscaleChange: (checked: boolean) => void;
  onRequireResultChange: (checked: boolean) => void;
  onResultSavePathChange: (path: string) => void;
};

export function SessionPresetStepEditor({
  step,
  durationSeconds,
  className,
  disabled = false,
  showTagSummary = true,
  onTimerChange,
  onAutoAdvanceChange,
  onCaptureChange,
  onRecordsSaveChange,
  onGrayscaleChange,
  onRequireResultChange,
  onResultSavePathChange,
}: SessionPresetStepEditorProps) {
  const durationParts = getDurationParts(durationSeconds);

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
          <section className="session-preset-step-editor__group">
            <span className="session-preset-step-editor__label">Asset Tags</span>
            <div className="session-preset-step-editor__tag-row">
              {step.autoTags.map(tag => (
                <Chip key={tag.id} shape="rounded" variant="neutral-dismiss">
                  {tag.name}
                </Chip>
              ))}
              {step.autoTags.length === 0 ? (
                <Chip shape="rounded" variant="accent-outline">
                  No auto tags
                </Chip>
              ) : null}
            </div>
          </section>
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
              <Input
                label="Result save path"
                value={step.resultSavePath ?? ''}
                placeholder="Optional path"
                disabled={disabled}
                onChange={event => {
                  onResultSavePathChange(event.target.value);
                }}
              />
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
