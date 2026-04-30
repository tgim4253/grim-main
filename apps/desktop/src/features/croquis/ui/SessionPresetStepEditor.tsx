import { Chip, ChipButton, CheckboxConditionalRow, CheckboxRow, Input } from '../../../shared/ui';
import { cx } from '../../../shared/lib/cx';
import type { CroquisOption, SessionStepPreset } from '../../../shared/types';
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
  step: SessionStepPreset;
  option: CroquisOption;
  durationSeconds: number;
  className?: string;
  disabled?: boolean;
  showGlobalControls?: boolean;
  onTimerChange: (seconds: number) => void;
  onAutoSkipChange: (checked: boolean) => void;
  onCaptureChange: (checked: boolean) => void;
  onRecordsSaveChange: (checked: boolean) => void;
  onRequireResultChange: (checked: boolean) => void;
};

export function SessionPresetStepEditor({
  step,
  option,
  durationSeconds,
  className,
  disabled = false,
  showGlobalControls = true,
  onTimerChange,
  onAutoSkipChange,
  onCaptureChange,
  onRecordsSaveChange,
  onRequireResultChange,
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

        <section className="session-preset-step-editor__group">
          <span className="session-preset-step-editor__label">Asset Tags</span>
          <div className="session-preset-step-editor__tag-row">
            {step.autoTags.map(tag => (
              <Chip key={tag.id} shape="rounded" variant="neutral-dismiss">
                {tag.name}
              </Chip>
            ))}
            <Chip shape="rounded" variant="add">
              ADD TAG
            </Chip>
          </div>
        </section>
      </div>

      <div className="session-preset-step-editor__column">
        <section className="session-preset-step-editor__group">
          <span className="session-preset-step-editor__label">Step Settings</span>
          <div className="session-preset-step-editor__settings">
            {showGlobalControls ? (
              <>
                <CheckboxRow
                  label="Auto-advance"
                  checked={option.auto.isSkip}
                  onCheckedChange={onAutoSkipChange}
                  width="full"
                  disabled={disabled}
                />
                <CheckboxConditionalRow
                  label="Records Save"
                  checked={option.isRecordSave}
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
                    checked={option.isCapture}
                    onCheckedChange={onCaptureChange}
                    width="full"
                    disabled={disabled}
                  />
                </CheckboxConditionalRow>
              </>
            ) : (
              <CheckboxRow
                label="Require result"
                checked={step.resultRequired}
                onCheckedChange={onRequireResultChange}
                width="full"
                disabled={disabled}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
