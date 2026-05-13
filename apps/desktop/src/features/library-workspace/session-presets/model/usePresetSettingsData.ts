import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { findFallbackPreset } from '@/entities/session-preset';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { SessionPreset, Tag, TagGroup, TimeStepPreset } from '@/shared/types';
import type { EditorMode } from './types';

type UsePresetSettingsDataOptions = {
  setSessionPresets: Dispatch<SetStateAction<SessionPreset[]>>;
  setTimeStepPresets: Dispatch<SetStateAction<TimeStepPreset[]>>;
  setTagGroups: Dispatch<SetStateAction<TagGroup[]>>;
  setTags: Dispatch<SetStateAction<Tag[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  applySessionPresetToEditor: (preset: SessionPreset | null) => void;
  applyTimeStepPresetToEditor: (preset: TimeStepPreset | null) => void;
  setEditorMode: Dispatch<SetStateAction<EditorMode>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<string | null>>;
};

export function usePresetSettingsData({
  setSessionPresets,
  setTimeStepPresets,
  setTagGroups,
  setTags,
  setLoading,
  applySessionPresetToEditor,
  applyTimeStepPresetToEditor,
  setEditorMode,
  setError,
  setStatus,
}: UsePresetSettingsDataOptions) {
  const { t } = useTranslation('common');

  const loadPresetSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const [nextSessionPresets, nextTimeStepPresets, nextTagIndex] = await Promise.all([
        ipc.session.listPresets(),
        ipc.session.listTimeStepPresets(),
        ipc.tag.loadIndex(),
      ]);
      const fallbackSessionPreset = findFallbackPreset(nextSessionPresets);

      setSessionPresets(nextSessionPresets);
      setTimeStepPresets(nextTimeStepPresets);
      setTagGroups(nextTagIndex.groups);
      setTags(nextTagIndex.tags);
      applySessionPresetToEditor(fallbackSessionPreset);
      applyTimeStepPresetToEditor(nextTimeStepPresets[0] ?? null);
      setEditorMode('session');
    } catch (nextError) {
      setError(
        getErrorMessage(
          nextError,
          t('presets.error.load_settings', {
            defaultValue: 'Failed to load preset settings.',
          }),
        ),
      );
      setSessionPresets([]);
      setTimeStepPresets([]);
      setTagGroups([]);
      setTags([]);
      applySessionPresetToEditor(null);
      applyTimeStepPresetToEditor(null);
    } finally {
      setLoading(false);
    }
  }, [
    applySessionPresetToEditor,
    applyTimeStepPresetToEditor,
    setEditorMode,
    setError,
    setLoading,
    setSessionPresets,
    setStatus,
    setTagGroups,
    setTags,
    setTimeStepPresets,
    t,
  ]);

  useEffect(() => {
    void loadPresetSettings();
  }, [loadPresetSettings]);

  return { loadPresetSettings };
}
