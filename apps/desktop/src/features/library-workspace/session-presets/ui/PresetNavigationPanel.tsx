import { useTranslation } from 'react-i18next';
import { Button, Icon, IconButton } from '@/shared/ui';
import type { SessionPreset, TimeStepPreset } from '@/shared/types';
import { formatDurationCompact, getStepDuration } from '@/entities/session-preset';
import { formatStepCount } from '../model/presetSettingsFormat';

export type PresetSettingsEditorMode = 'session' | 'time-step';

export type PresetNavigationPanelProps = {
  loading: boolean;
  editorMode: PresetSettingsEditorMode;
  editorDisabled: boolean;
  sessionPresets: readonly SessionPreset[];
  timeStepPresets: readonly TimeStepPreset[];
  selectedSessionPresetId: string;
  selectedTimeStepPresetId: string;
  onCreateSessionPreset: () => void;
  onSessionPresetSelect: (presetId: string) => void;
  onCreateTimeStepPreset: () => void;
  onTimeStepPresetSelect: (presetId: string) => void;
};

export function PresetNavigationPanel({
  loading,
  editorMode,
  editorDisabled,
  sessionPresets,
  timeStepPresets,
  selectedSessionPresetId,
  selectedTimeStepPresetId,
  onCreateSessionPreset,
  onSessionPresetSelect,
  onCreateTimeStepPreset,
  onTimeStepPresetSelect,
}: PresetNavigationPanelProps) {
  const { t } = useTranslation('common');

  return (
    <aside className="session-preset-settings__list-panel">
      <div className="session-preset-settings__nav-section session-preset-settings__nav-section--presets">
        <div className="session-preset-settings__list-header">
          <span className="session-preset-settings__eyebrow">
            {t('presets.session_presets', { defaultValue: 'Session Presets' })}
          </span>
          <IconButton
            icon="plus"
            size="md"
            aria-label={t('presets.create_session_preset', {
              defaultValue: 'Create session preset',
            })}
            title={t('presets.create_session_preset', {
              defaultValue: 'Create session preset',
            })}
            disabled={editorDisabled}
            onClick={onCreateSessionPreset}
          />
        </div>

        <div className="session-preset-settings__preset-list">
          {loading ? (
            <div className="session-preset-settings__state">
              {t('presets.loading', { defaultValue: 'Loading presets...' })}
            </div>
          ) : sessionPresets.length === 0 ? (
            <div className="session-preset-settings__state">
              <p>
                {t('presets.no_session_presets', {
                  defaultValue: 'No session presets available.',
                })}
              </p>
              <Button size="sm" onClick={onCreateSessionPreset}>
                {t('presets.create_preset', { defaultValue: 'Create Preset' })}
              </Button>
            </div>
          ) : (
            sessionPresets.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="session-preset-settings__preset-row"
                data-active={
                  editorMode === 'session' && preset.id === selectedSessionPresetId
                    ? 'true'
                    : undefined
                }
                disabled={editorDisabled}
                onClick={() => {
                  onSessionPresetSelect(preset.id);
                }}
              >
                <span className="session-preset-settings__preset-main">
                  <strong>{preset.name}</strong>
                  <span>{preset.description || formatStepCount(preset.steps.length, t)}</span>
                </span>
                {preset.isDefault ? (
                  <span className="session-preset-settings__preset-badge">
                    {t('common.default', { defaultValue: 'Default' })}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="session-preset-settings__nav-section session-preset-settings__nav-section--steps">
        <div className="session-preset-settings__time-step-header">
          <span className="session-preset-settings__eyebrow">
            {t('presets.time_step_presets', { defaultValue: 'Time Step Presets' })}
          </span>
          <IconButton
            icon="plus"
            size="md"
            aria-label={t('presets.create_time_step_preset', {
              defaultValue: 'Create time step preset',
            })}
            title={t('presets.create_time_step_preset', {
              defaultValue: 'Create time step preset',
            })}
            disabled={editorDisabled}
            onClick={onCreateTimeStepPreset}
          />
        </div>

        <div className="session-preset-settings__time-step-list">
          {timeStepPresets.length === 0 ? (
            <div className="session-preset-settings__state">
              {t('presets.no_time_step_presets', {
                defaultValue: 'No time step presets yet.',
              })}
            </div>
          ) : (
            timeStepPresets.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="session-preset-settings__time-step-row"
                data-active={
                  editorMode === 'time-step' && preset.id === selectedTimeStepPresetId
                    ? 'true'
                    : undefined
                }
                disabled={editorDisabled}
                onClick={() => {
                  onTimeStepPresetSelect(preset.id);
                }}
              >
                <span className="session-preset-settings__time-step-index">
                  {formatDurationCompact(getStepDuration(preset))}
                </span>
                <span className="session-preset-settings__time-step-main">
                  <strong>{preset.name}</strong>
                  <span>
                    {t('tags.count_lower', {
                      count: preset.autoTags.length,
                      formattedCount: preset.autoTags.length.toLocaleString(),
                      defaultValue: '{{formattedCount}} tags',
                    })}
                  </span>
                </span>
                <Icon name="chevron-right" size="sm" hierarchy="tertiary" aria-hidden />
              </button>
            ))
          )}

          <button
            type="button"
            className="session-preset-settings__time-step-add"
            disabled={editorDisabled}
            onClick={onCreateTimeStepPreset}
          >
            <span>
              {t('presets.create_time_step_preset_title', {
                defaultValue: 'Create Time Step Preset',
              })}
            </span>
            <Icon name="plus" size="sm" hierarchy="tertiary" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
