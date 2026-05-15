import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui';
import type { PresetSettingsEditorMode } from './PresetNavigationPanel';

export type PresetSettingsFooterProps = {
  mode: PresetSettingsEditorMode;
  busy: boolean;
  canSaveSession: boolean;
  canDuplicateSession: boolean;
  canSaveTimeStep: boolean;
  canDuplicateTimeStep: boolean;
  canDeleteTimeStep: boolean;
  onSaveSession: () => void;
  onDuplicateSession: () => void;
  onSaveTimeStep: () => void;
  onDuplicateTimeStep: () => void;
  onDeleteTimeStep: () => void;
};

export function PresetSettingsFooter({
  mode,
  busy,
  canSaveSession,
  canDuplicateSession,
  canSaveTimeStep,
  canDuplicateTimeStep,
  canDeleteTimeStep,
  onSaveSession,
  onDuplicateSession,
  onSaveTimeStep,
  onDuplicateTimeStep,
  onDeleteTimeStep,
}: PresetSettingsFooterProps) {
  const { t } = useTranslation('common');

  return (
    <footer className="session-preset-settings__footer">
      {mode === 'session' ? (
        <>
          <Button size="sm" disabled={!canSaveSession} onClick={onSaveSession}>
            {busy
              ? t('common.saving', { defaultValue: 'Saving...' })
              : t('presets.save_session', { defaultValue: 'Save Session' })}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canDuplicateSession}
            onClick={onDuplicateSession}
          >
            {t('presets.duplicate_session', { defaultValue: 'Duplicate Session' })}
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" disabled={!canSaveTimeStep} onClick={onSaveTimeStep}>
            {busy
              ? t('common.saving', { defaultValue: 'Saving...' })
              : t('presets.save_time_step', { defaultValue: 'Save Time Step' })}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canDuplicateTimeStep}
            onClick={onDuplicateTimeStep}
          >
            {t('presets.duplicate_time_step', { defaultValue: 'Duplicate Time Step' })}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!canDeleteTimeStep}
            onClick={onDeleteTimeStep}
          >
            {t('presets.delete_time_step', { defaultValue: 'Delete Time Step' })}
          </Button>
        </>
      )}
    </footer>
  );
}
