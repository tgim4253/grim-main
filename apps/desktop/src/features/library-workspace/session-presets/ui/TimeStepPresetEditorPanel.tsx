import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/shared/ui';
import type { Tag, TagGroup } from '@/shared/types';
import {
  SessionPresetStepEditor,
  clampDurationSeconds,
  clampFilterPercent,
  formatDurationCompact,
  getStepDuration,
  normalizeOptionalString,
  type EditableSessionStep,
} from '@/entities/session-preset';
import { PresetSettingsMessage } from './PresetSettingsMessage';

type TimeStepPresetEditorPanelProps = {
  editorDisabled: boolean;
  error: string | null;
  status: string | null;
  timeStepName: string;
  editableTimeStep: EditableSessionStep | null;
  tags: readonly Tag[];
  tagGroups: readonly TagGroup[];
  onTimeStepNameChange: (name: string) => void;
  onTimeStepUpdate: (updater: (step: EditableSessionStep) => EditableSessionStep) => void;
  onAutoTagAdd: (tag: Tag) => void;
  onAutoTagRemove: (tagId: string) => void;
  onCreateTimeStepPreset: () => void;
};

export function TimeStepPresetEditorPanel({
  editorDisabled,
  error,
  status,
  timeStepName,
  editableTimeStep,
  tags,
  tagGroups,
  onTimeStepNameChange,
  onTimeStepUpdate,
  onAutoTagAdd,
  onAutoTagRemove,
  onCreateTimeStepPreset,
}: TimeStepPresetEditorPanelProps) {
  const { t } = useTranslation('common');

  return (
    <>
      <div className="session-preset-settings__header">
        <div className="session-preset-settings__session-panel session-preset-settings__session-panel--time-step">
          <Input
            label={t('presets.time_step_name', { defaultValue: 'Time Step Name' })}
            value={timeStepName}
            disabled={editorDisabled}
            onChange={event => {
              onTimeStepNameChange(event.target.value);
            }}
          />
        </div>
      </div>

      <main className="session-preset-settings__content">
        <div className="session-preset-settings__timeline-header">
          <span className="session-preset-settings__eyebrow">
            {t('presets.time_step_preset', { defaultValue: 'Time Step Preset' })}
          </span>
          <span>
            {editableTimeStep
              ? formatDurationCompact(getStepDuration(editableTimeStep))
              : t('common.none', { defaultValue: 'None' })}
          </span>
        </div>

        <div className="session-preset-settings__step-detail">
          {editableTimeStep ? (
            <article className="session-preset-settings__step-card session-preset-settings__step-card--detail">
              <div className="session-preset-settings__step-body">
                <SessionPresetStepEditor
                  step={{ ...editableTimeStep, name: timeStepName }}
                  durationSeconds={getStepDuration(editableTimeStep)}
                  disabled={editorDisabled}
                  availableAutoTags={tags}
                  autoTagGroups={tagGroups}
                  onTimerChange={seconds => {
                    const nextSeconds = clampDurationSeconds(seconds);
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      defaultDurationSeconds: nextSeconds,
                    }));
                  }}
                  onAutoAdvanceChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      autoAdvance: checked,
                    }));
                  }}
                  onRecordsSaveChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      recordSaveEnabled: checked,
                      captureEnabled: checked ? currentStep.captureEnabled : false,
                    }));
                  }}
                  onRequireResultChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      resultRequired: checked,
                    }));
                  }}
                  onCaptureChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      captureEnabled: checked,
                    }));
                  }}
                  onFilterChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      filterEnabled: checked,
                    }));
                  }}
                  onGrayscaleChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      grayscaleEnabled: checked,
                    }));
                  }}
                  onBlurChange={checked => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      blurEnabled: checked,
                    }));
                  }}
                  onBlurAmountChange={value => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      blurAmount: clampFilterPercent(value),
                    }));
                  }}
                  onResultSavePathChange={path => {
                    onTimeStepUpdate(currentStep => ({
                      ...currentStep,
                      resultSavePath: normalizeOptionalString(path),
                    }));
                  }}
                  onAutoTagAdd={onAutoTagAdd}
                  onAutoTagRemove={onAutoTagRemove}
                />
              </div>
            </article>
          ) : (
            <div className="session-preset-settings__empty-detail">
              <span>
                {t('presets.create_time_step_to_edit_hint', {
                  defaultValue: 'Create a time step preset to edit duration and step rules.',
                })}
              </span>
              <Button size="sm" disabled={editorDisabled} onClick={onCreateTimeStepPreset}>
                {t('presets.create_time_step_preset_title', {
                  defaultValue: 'Create Time Step Preset',
                })}
              </Button>
            </div>
          )}
        </div>

        <PresetSettingsMessage error={error} status={status} />
      </main>
    </>
  );
}
