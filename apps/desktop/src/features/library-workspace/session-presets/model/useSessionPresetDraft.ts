import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionPreset, Tag, TimeStepPreset } from '@/shared/types';
import {
  applyTimeStepPresetToStep,
  createEditableSteps,
  normalizeStepOrders,
  normalizeWindowDimension,
  type EditableSessionStep,
} from '@/entities/session-preset';
import { createStepFromFirstTimeStepPreset } from './sessionStepList';

const NEW_SESSION_PRESET_NAME = 'Untitled Preset';

type SessionStepAccordionValue = string | string[] | null;
type SessionStepReorderPosition = 'before' | 'after';
type SessionStepReorderPayload = {
  value: string;
  targetValue: string;
  position: SessionStepReorderPosition;
};

export type SessionPresetDraft = {
  presetId: string;
  name: string;
  description: string;
  windowWidth: string;
  windowHeight: string;
  isShuffle: boolean;
  autoTags: Tag[];
  steps: EditableSessionStep[];
  collapsedStepIds: Set<string>;
};

export type UseSessionPresetDraftOptions = {
  timeStepPresets: readonly TimeStepPreset[];
  onDirty?: () => void;
  onError?: (message: string) => void;
};

export function useSessionPresetDraft({
  timeStepPresets,
  onDirty,
  onError,
}: UseSessionPresetDraftOptions) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState<SessionPresetDraft>({
    presetId: '',
    name: '',
    description: '',
    windowWidth: '',
    windowHeight: '',
    isShuffle: false,
    autoTags: [],
    steps: [],
    collapsedStepIds: new Set(),
  });

  const expandedStepIds = useMemo(
    () => draft.steps.filter(step => !draft.collapsedStepIds.has(step.id)).map(step => step.id),
    [draft.collapsedStepIds, draft.steps],
  );

  const markDirty = useCallback(() => {
    onDirty?.();
  }, [onDirty]);

  const applyPreset = useCallback((preset: SessionPreset | null) => {
    const nextSteps = preset ? createEditableSteps(preset) : [];

    setDraft({
      presetId: preset?.id ?? '',
      name: preset?.name ?? '',
      description: preset?.description ?? '',
      windowWidth: preset?.windowWidth ?? '',
      windowHeight: preset?.windowHeight ?? '',
      isShuffle: preset?.isShuffle ?? false,
      autoTags: preset?.autoTags ?? [],
      steps: nextSteps,
      collapsedStepIds: new Set(nextSteps.map(step => step.id)),
    });
  }, []);

  const createPreset = useCallback(() => {
    const nextStep = createStepFromFirstTimeStepPreset(timeStepPresets, 1);

    setDraft({
      presetId: '',
      name: t('presets.untitled_session', { defaultValue: NEW_SESSION_PRESET_NAME }),
      description: '',
      windowWidth: '240',
      windowHeight: '',
      isShuffle: false,
      autoTags: [],
      steps: nextStep ? [nextStep] : [],
      collapsedStepIds: new Set(),
    });
  }, [t, timeStepPresets]);

  useEffect(() => {
    const sessionStepIds = new Set(draft.steps.map(step => step.id));

    setDraft(current => {
      const nextCollapsedStepIds = new Set(
        [...current.collapsedStepIds].filter(stepId => sessionStepIds.has(stepId)),
      );

      return nextCollapsedStepIds.size === current.collapsedStepIds.size
        ? current
        : { ...current, collapsedStepIds: nextCollapsedStepIds };
    });
  }, [draft.steps]);

  const setName = useCallback(
    (name: string) => {
      setDraft(current => ({ ...current, name }));
      markDirty();
    },
    [markDirty],
  );

  const setDescription = useCallback(
    (description: string) => {
      setDraft(current => ({ ...current, description }));
      markDirty();
    },
    [markDirty],
  );

  const setWindowWidth = useCallback(
    (value: string) => {
      setDraft(current => ({ ...current, windowWidth: normalizeWindowDimension(value) }));
      markDirty();
    },
    [markDirty],
  );

  const setWindowHeight = useCallback(
    (value: string) => {
      setDraft(current => ({ ...current, windowHeight: normalizeWindowDimension(value) }));
      markDirty();
    },
    [markDirty],
  );

  const setShuffle = useCallback(
    (isShuffle: boolean) => {
      setDraft(current => ({ ...current, isShuffle }));
      markDirty();
    },
    [markDirty],
  );

  const addStep = useCallback(() => {
    setDraft(current => {
      const nextStep = createStepFromFirstTimeStepPreset(timeStepPresets, current.steps.length + 1);
      if (!nextStep) {
        onError?.(
          t('presets.error.create_time_step_before_append', {
            defaultValue: 'Create a time step preset before appending session steps.',
          }),
        );
        return current;
      }

      markDirty();
      return {
        ...current,
        steps: normalizeStepOrders([...current.steps, nextStep]),
        collapsedStepIds: current.collapsedStepIds.has(nextStep.id)
          ? new Set([...current.collapsedStepIds].filter(stepId => stepId !== nextStep.id))
          : current.collapsedStepIds,
      };
    });
  }, [markDirty, onError, t, timeStepPresets]);

  const deleteStep = useCallback(
    (stepId: string) => {
      setDraft(current => ({
        ...current,
        steps: normalizeStepOrders(current.steps.filter(step => step.id !== stepId)),
        collapsedStepIds: current.collapsedStepIds.has(stepId)
          ? new Set(
              [...current.collapsedStepIds].filter(collapsedStepId => collapsedStepId !== stepId),
            )
          : current.collapsedStepIds,
      }));
      markDirty();
    },
    [markDirty],
  );

  const reorderStep = useCallback(
    (sourceStepId: string, targetStepId: string, position: SessionStepReorderPosition) => {
      setDraft(current => {
        if (sourceStepId === targetStepId) {
          return current;
        }

        const sourceIndex = current.steps.findIndex(step => step.id === sourceStepId);
        const targetIndex = current.steps.findIndex(step => step.id === targetStepId);
        if (sourceIndex < 0 || targetIndex < 0) {
          return current;
        }

        const nextSteps = [...current.steps];
        const [sourceStep] = nextSteps.splice(sourceIndex, 1);
        const nextTargetIndex = nextSteps.findIndex(step => step.id === targetStepId);
        if (nextTargetIndex < 0) {
          return current;
        }

        nextSteps.splice(
          position === 'after' ? nextTargetIndex + 1 : nextTargetIndex,
          0,
          sourceStep,
        );
        markDirty();
        return { ...current, steps: normalizeStepOrders(nextSteps) };
      });
    },
    [markDirty],
  );

  const moveStep = useCallback(
    (stepId: string, direction: -1 | 1) => {
      setDraft(current => {
        const index = current.steps.findIndex(step => step.id === stepId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= current.steps.length) {
          return current;
        }

        const nextSteps = [...current.steps];
        const [step] = nextSteps.splice(index, 1);
        nextSteps.splice(nextIndex, 0, step);
        markDirty();
        return { ...current, steps: normalizeStepOrders(nextSteps) };
      });
    },
    [markDirty],
  );

  const setAccordionValue = useCallback((value: SessionStepAccordionValue) => {
    setDraft(current => {
      const expandedStepIds = new Set(
        Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
      );

      return {
        ...current,
        collapsedStepIds: new Set(
          current.steps.map(step => step.id).filter(stepId => !expandedStepIds.has(stepId)),
        ),
      };
    });
  }, []);

  const reorderFromAccordion = useCallback(
    ({ value, targetValue, position }: SessionStepReorderPayload) => {
      reorderStep(value, targetValue, position);
    },
    [reorderStep],
  );

  const updateStepPreset = useCallback(
    (stepId: string, nextValue: string) => {
      setDraft(current => ({
        ...current,
        steps: normalizeStepOrders(
          current.steps.map(step => {
            if (step.id !== stepId) {
              return step;
            }

            const nextPreset = timeStepPresets.find(preset => preset.id === nextValue);
            return nextPreset ? applyTimeStepPresetToStep(step, nextPreset) : step;
          }),
        ),
      }));
      markDirty();
    },
    [markDirty, timeStepPresets],
  );

  const addAutoTag = useCallback(
    (tag: Tag) => {
      setDraft(current => {
        if (current.autoTags.some(autoTag => autoTag.id === tag.id)) {
          return current;
        }

        return { ...current, autoTags: [...current.autoTags, tag] };
      });
      markDirty();
    },
    [markDirty],
  );

  const removeAutoTag = useCallback(
    (tagId: string) => {
      setDraft(current => ({
        ...current,
        autoTags: current.autoTags.filter(tag => tag.id !== tagId),
      }));
      markDirty();
    },
    [markDirty],
  );

  const refreshStepsFromTimeStepPresets = useCallback(
    (nextTimeStepPresets: readonly TimeStepPreset[]) => {
      setDraft(current => {
        const timeStepPresetsById = new Map(nextTimeStepPresets.map(preset => [preset.id, preset]));

        return {
          ...current,
          steps: normalizeStepOrders(
            current.steps.map(step => {
              const timeStepPreset = step.timeStepPresetId
                ? timeStepPresetsById.get(step.timeStepPresetId)
                : null;

              return timeStepPreset ? applyTimeStepPresetToStep(step, timeStepPreset) : step;
            }),
          ),
        };
      });
    },
    [],
  );

  return {
    draft,
    expandedStepIds,
    applyPreset,
    createPreset,
    setName,
    setDescription,
    setWindowWidth,
    setWindowHeight,
    setShuffle,
    addStep,
    deleteStep,
    reorderStep,
    moveStep,
    setAccordionValue,
    reorderFromAccordion,
    updateStepPreset,
    addAutoTag,
    removeAutoTag,
    refreshStepsFromTimeStepPresets,
  };
}
