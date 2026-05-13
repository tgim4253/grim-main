import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tag, TimeStepPreset } from '@/shared/types';
import {
  createCustomStep,
  createStepFromTimeStepPreset,
  type EditableSessionStep,
} from '@/entities/session-preset';

const NEW_TIME_STEP_PRESET_NAME = 'Untitled Time Step';

export type TimeStepPresetDraft = {
  presetId: string;
  name: string;
  step: EditableSessionStep | null;
};

export type UseTimeStepPresetDraftOptions = {
  onDirty?: () => void;
};

export function useTimeStepPresetDraft({ onDirty }: UseTimeStepPresetDraftOptions = {}) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState<TimeStepPresetDraft>({
    presetId: '',
    name: '',
    step: null,
  });

  const markDirty = useCallback(() => {
    onDirty?.();
  }, [onDirty]);

  const applyPreset = useCallback((preset: TimeStepPreset | null) => {
    setDraft({
      presetId: preset?.id ?? '',
      name: preset?.name ?? '',
      step: preset ? createStepFromTimeStepPreset(preset, 1) : null,
    });
  }, []);

  const createPreset = useCallback(() => {
    const nextStep = createCustomStep(
      1,
      t('croquis.user_custom_step', { defaultValue: 'User Custom Step' }),
    );

    setDraft({
      presetId: '',
      name: t('presets.untitled_time_step', { defaultValue: NEW_TIME_STEP_PRESET_NAME }),
      step: nextStep,
    });
  }, [t]);

  const setName = useCallback(
    (name: string) => {
      setDraft(current => ({
        ...current,
        name,
        step: current.step ? { ...current.step, name } : current.step,
      }));
      markDirty();
    },
    [markDirty],
  );

  const updateStep = useCallback(
    (updater: (step: EditableSessionStep) => EditableSessionStep) => {
      setDraft(current => ({
        ...current,
        step: current.step === null ? current.step : updater(current.step),
      }));
      markDirty();
    },
    [markDirty],
  );

  const addAutoTag = useCallback(
    (tag: Tag) => {
      updateStep(currentStep => {
        if (currentStep.autoTags.some(autoTag => autoTag.id === tag.id)) {
          return currentStep;
        }

        return {
          ...currentStep,
          autoTags: [...currentStep.autoTags, tag],
        };
      });
    },
    [updateStep],
  );

  const removeAutoTag = useCallback(
    (tagId: string) => {
      updateStep(currentStep => ({
        ...currentStep,
        autoTags: currentStep.autoTags.filter(tag => tag.id !== tagId),
      }));
    },
    [updateStep],
  );

  return {
    draft,
    applyPreset,
    createPreset,
    setName,
    updateStep,
    addAutoTag,
    removeAutoTag,
  };
}
