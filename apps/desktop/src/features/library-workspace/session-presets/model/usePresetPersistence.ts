import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  findFallbackPreset,
  normalizeOptionalString,
  saveStoredTimeStepFilterSettings,
  setStoredActiveSessionPresetId,
  toSaveSessionPresetPayload,
  toSaveTimeStepPresetPayload,
} from '@/entities/session-preset';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { SessionPreset, TimeStepPreset } from '@/shared/types';
import { findCreatedPreset, getDuplicateName } from './presetSettingsSelection';
import type { EditorMode } from './types';
import type { useSessionPresetDraft } from './useSessionPresetDraft';
import type { useTimeStepPresetDraft } from './useTimeStepPresetDraft';

const NEW_SESSION_PRESET_NAME = 'Untitled Preset';
const NEW_TIME_STEP_PRESET_NAME = 'Untitled Time Step';

type UsePresetPersistenceOptions = {
  sessionPresets: readonly SessionPreset[];
  setSessionPresets: Dispatch<SetStateAction<SessionPreset[]>>;
  timeStepPresets: readonly TimeStepPreset[];
  setTimeStepPresets: Dispatch<SetStateAction<TimeStepPreset[]>>;
  selectedSessionPreset: SessionPreset | null;
  selectedTimeStepPreset: TimeStepPreset | null;
  sessionDraft: ReturnType<typeof useSessionPresetDraft>;
  timeStepDraft: ReturnType<typeof useTimeStepPresetDraft>;
  setEditorMode: Dispatch<SetStateAction<EditorMode>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<string | null>>;
};

export function usePresetPersistence({
  sessionPresets,
  setSessionPresets,
  timeStepPresets,
  setTimeStepPresets,
  selectedSessionPreset,
  selectedTimeStepPreset,
  sessionDraft,
  timeStepDraft,
  setEditorMode,
  setError,
  setStatus,
}: UsePresetPersistenceOptions) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);

  const persistSessionPreset = async (duplicate = false) => {
    const trimmedName = sessionDraft.draft.name.trim();
    if (!trimmedName) {
      setError(
        t('presets.error.session_name_required', { defaultValue: 'Session name is required.' }),
      );
      return;
    }

    if (sessionDraft.draft.steps.length === 0) {
      setError(
        t('presets.error.add_time_step_before_saving', {
          defaultValue: 'Add at least one time step before saving.',
        }),
      );
      return;
    }

    if (sessionDraft.draft.steps.some(step => !step.timeStepPresetId)) {
      setError(
        t('presets.error.saved_time_steps_only', {
          defaultValue: 'Session presets can only reference saved time step presets.',
        }),
      );
      return;
    }

    const nextName = duplicate
      ? getDuplicateName(
          trimmedName,
          t('presets.untitled_session', { defaultValue: NEW_SESSION_PRESET_NAME }),
          t,
        )
      : trimmedName;
    const payload = toSaveSessionPresetPayload({
      preset: selectedSessionPreset,
      name: nextName,
      description: sessionDraft.draft.description,
      windowWidth: normalizeOptionalString(sessionDraft.draft.windowWidth),
      windowHeight: normalizeOptionalString(sessionDraft.draft.windowHeight),
      isShuffle: sessionDraft.draft.isShuffle,
      autoTags: sessionDraft.draft.autoTags,
      steps: sessionDraft.draft.steps,
      duplicate,
    });

    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const nextSessionPresets = await ipc.session.savePreset(payload);
      const nextSelectedPreset = duplicate
        ? findCreatedPreset(sessionPresets, nextSessionPresets, nextName)
        : (nextSessionPresets.find(preset => preset.id === selectedSessionPreset?.id) ??
          findCreatedPreset(sessionPresets, nextSessionPresets, nextName) ??
          findFallbackPreset(nextSessionPresets));

      setSessionPresets(nextSessionPresets);
      sessionDraft.applyPreset(nextSelectedPreset);
      setStoredActiveSessionPresetId(nextSelectedPreset?.id ?? null);
      setEditorMode('session');
      setStatus(
        duplicate
          ? t('presets.status.session_duplicated', {
              defaultValue: 'Session preset duplicated.',
            })
          : t('presets.status.session_saved', { defaultValue: 'Session preset saved.' }),
      );
    } catch (nextError) {
      setError(
        getErrorMessage(
          nextError,
          t('presets.error.save_session', { defaultValue: 'Failed to save session preset.' }),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const persistTimeStepPreset = async (duplicate = false) => {
    const trimmedName = timeStepDraft.draft.name.trim();
    if (!trimmedName) {
      setError(
        t('presets.error.time_step_name_required', { defaultValue: 'Time step name is required.' }),
      );
      return;
    }

    if (timeStepDraft.draft.step === null) {
      setError(
        t('presets.error.select_time_step_before_saving', {
          defaultValue: 'Select or create a time step preset before saving.',
        }),
      );
      return;
    }

    const nextName = duplicate
      ? getDuplicateName(
          trimmedName,
          t('presets.untitled_time_step', { defaultValue: NEW_TIME_STEP_PRESET_NAME }),
          t,
        )
      : trimmedName;
    const payload = toSaveTimeStepPresetPayload({
      preset: selectedTimeStepPreset,
      name: nextName,
      step: {
        ...timeStepDraft.draft.step,
        name: nextName,
      },
      duplicate,
    });

    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const nextTimeStepPresets = await ipc.session.saveTimeStepPreset(payload);
      const nextSessionPresets = await ipc.session.listPresets();
      const nextSelectedPreset = duplicate
        ? findCreatedPreset(timeStepPresets, nextTimeStepPresets, nextName)
        : (nextTimeStepPresets.find(preset => preset.id === selectedTimeStepPreset?.id) ??
          findCreatedPreset(timeStepPresets, nextTimeStepPresets, nextName) ??
          (nextTimeStepPresets.length > 0 ? nextTimeStepPresets[0] : null));

      saveStoredTimeStepFilterSettings(nextSelectedPreset?.id, timeStepDraft.draft.step);
      setTimeStepPresets(nextTimeStepPresets);
      setSessionPresets(nextSessionPresets);
      sessionDraft.refreshStepsFromTimeStepPresets(nextTimeStepPresets);
      timeStepDraft.applyPreset(nextSelectedPreset);
      setEditorMode('time-step');
      setStatus(
        duplicate
          ? t('presets.status.time_step_duplicated', {
              defaultValue: 'Time step preset duplicated.',
            })
          : t('presets.status.time_step_saved', { defaultValue: 'Time step preset saved.' }),
      );
    } catch (nextError) {
      setError(
        getErrorMessage(
          nextError,
          t('presets.error.save_time_step', {
            defaultValue: 'Failed to save time step preset.',
          }),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteTimeStepPreset = async () => {
    if (selectedTimeStepPreset === null) {
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const nextTimeStepPresets = await ipc.session.deleteTimeStepPreset({
        presetId: selectedTimeStepPreset.id,
      });
      const nextSelectedPreset = nextTimeStepPresets.length > 0 ? nextTimeStepPresets[0] : null;

      setTimeStepPresets(nextTimeStepPresets);
      timeStepDraft.applyPreset(nextSelectedPreset);
      if (nextSelectedPreset === null) {
        setEditorMode('session');
      }
      setStatus(
        t('presets.status.time_step_deleted', { defaultValue: 'Time step preset deleted.' }),
      );
    } catch (nextError) {
      setError(
        getErrorMessage(
          nextError,
          t('presets.error.delete_time_step', {
            defaultValue: 'Failed to delete time step preset.',
          }),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    persistSessionPreset,
    persistTimeStepPreset,
    deleteTimeStepPreset,
  };
}
