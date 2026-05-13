import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccordionItem,
  AccordionItemBody,
  AccordionItemDragHeader,
  AccordionRoot,
  type AccordionReorderPayload,
  type AccordionReorderPosition,
  type AccordionRootValue,
  Button,
  CheckboxRow,
  Icon,
  IconButton,
  Input,
  Select,
  type SelectOption,
} from '../../../shared/ui';
import { getErrorMessage } from '../../../shared/lib/error';
import { ipc } from '../../../shared/lib/ipc';
import type { SessionPreset, Tag, TagGroup, TimeStepPreset } from '../../../shared/types';
import { findFallbackPreset, setStoredActiveSessionPresetId } from '../../croquis/lib/startModal';
import {
  applyTimeStepPresetToStep,
  clampDurationSeconds,
  clampFilterPercent,
  createCustomStep,
  createEditableSteps,
  createStepFromTimeStepPreset,
  formatDurationCompact,
  getStepDuration,
  normalizeOptionalString,
  normalizeStepOrders,
  normalizeWindowDimension,
  saveStoredTimeStepFilterSettings,
  toSaveSessionPresetPayload,
  toSaveTimeStepPresetPayload,
  type EditableSessionStep,
} from '../../croquis/lib/sessionPresetEditor';
import { SessionPresetStepEditor } from '../../croquis/ui/SessionPresetStepEditor';
import { AutoTagPicker } from '../../croquis/ui/AutoTagPicker';
import './session-preset-settings.css';

const NEW_SESSION_PRESET_NAME = 'Untitled Preset';
const NEW_TIME_STEP_PRESET_NAME = 'Untitled Time Step';

type EditorMode = 'session' | 'time-step';
type NamedPreset = { id: string; name: string };
type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatStepCount(stepCount: number, t: Translate) {
  return t('presets.step_count', {
    count: stepCount,
    formattedCount: stepCount.toLocaleString(),
    defaultValue: '{{formattedCount}} steps',
  });
}

function formatAutoTagSummary(autoTags: readonly Tag[], t: Translate) {
  if (autoTags.length === 0) {
    return t('croquis.auto_tags.empty', { defaultValue: 'No auto tags' });
  }

  const visibleTagNames = autoTags.slice(0, 3).map(tag => tag.name);
  const hiddenTagCount = autoTags.length - visibleTagNames.length;

  return hiddenTagCount > 0
    ? `${visibleTagNames.join(', ')} +${String(hiddenTagCount)}`
    : visibleTagNames.join(', ');
}

function formatStepOptionSummary(step: EditableSessionStep, t: Translate) {
  const enabledOptions = [
    step.autoAdvance
      ? t('presets.step_summary.auto_advance', { defaultValue: 'Auto-advance' })
      : t('presets.step_summary.manual_advance', { defaultValue: 'Manual advance' }),
    step.recordSaveEnabled
      ? t('presets.step_summary.records_save', { defaultValue: 'Records save' })
      : t('presets.step_summary.records_off', { defaultValue: 'Records off' }),
    step.captureEnabled ? t('common.capture', { defaultValue: 'Capture' }) : null,
    step.filterEnabled && step.grayscaleEnabled
      ? t('croquis.grayscale', { defaultValue: 'Grayscale' })
      : null,
    step.filterEnabled && step.blurEnabled
      ? t('presets.step_summary.blur_percent', {
          value: `${String(step.blurAmount)}%`,
          defaultValue: 'Blur {{value}}',
        })
      : null,
    step.resultRequired
      ? t('presets.step_summary.result_required', { defaultValue: 'Result required' })
      : null,
  ].filter((option): option is string => Boolean(option));

  return enabledOptions.join(' · ');
}

function getDuplicateName(name: string, fallbackName: string, t: Translate) {
  const trimmedName = name.trim() || fallbackName;
  return t('presets.duplicate_name', {
    name: trimmedName,
    defaultValue: '{{name}} Copy',
  });
}

function findCreatedPreset<TPreset extends NamedPreset>(
  previousPresets: readonly TPreset[],
  nextPresets: readonly TPreset[],
  name: string,
) {
  const previousIds = new Set(previousPresets.map(preset => preset.id));
  return (
    nextPresets.find(preset => !previousIds.has(preset.id) && preset.name === name) ??
    nextPresets.find(preset => !previousIds.has(preset.id)) ??
    null
  );
}

function createStepFromFirstTimeStepPreset(
  timeStepPresets: readonly TimeStepPreset[],
  stepOrder: number,
) {
  if (timeStepPresets.length === 0) {
    return null;
  }

  return createStepFromTimeStepPreset(timeStepPresets[0], stepOrder);
}

function refreshSessionStepsFromTimeStepPresets(
  steps: readonly EditableSessionStep[],
  timeStepPresets: readonly TimeStepPreset[],
) {
  const timeStepPresetsById = new Map(timeStepPresets.map(preset => [preset.id, preset]));

  return normalizeStepOrders(
    steps.map(step => {
      const timeStepPreset = step.timeStepPresetId
        ? timeStepPresetsById.get(step.timeStepPresetId)
        : null;

      return timeStepPreset ? applyTimeStepPresetToStep(step, timeStepPreset) : step;
    }),
  );
}

const ignoreStepEditorChange = () => {};

export function SessionPresetSettingsView() {
  const { t } = useTranslation('common');
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('session');
  const [selectedSessionPresetId, setSelectedSessionPresetId] = useState('');
  const [selectedTimeStepPresetId, setSelectedTimeStepPresetId] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionWindowWidth, setSessionWindowWidth] = useState('');
  const [sessionWindowHeight, setSessionWindowHeight] = useState('');
  const [sessionIsShuffle, setSessionIsShuffle] = useState(false);
  const [sessionAutoTags, setSessionAutoTags] = useState<Tag[]>([]);
  const [sessionSteps, setSessionSteps] = useState<EditableSessionStep[]>([]);
  const [collapsedSessionStepIds, setCollapsedSessionStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [timeStepName, setTimeStepName] = useState('');
  const [editableTimeStep, setEditableTimeStep] = useState<EditableSessionStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedSessionPreset = useMemo(
    () => sessionPresets.find(preset => preset.id === selectedSessionPresetId) ?? null,
    [sessionPresets, selectedSessionPresetId],
  );
  const selectedTimeStepPreset = useMemo(
    () => timeStepPresets.find(preset => preset.id === selectedTimeStepPresetId) ?? null,
    [timeStepPresets, selectedTimeStepPresetId],
  );
  const editorDisabled = loading || busy;
  const expandedSessionStepIds = useMemo(
    () => sessionSteps.filter(step => !collapsedSessionStepIds.has(step.id)).map(step => step.id),
    [collapsedSessionStepIds, sessionSteps],
  );

  const timeStepPresetOptions: SelectOption[] = useMemo(
    () =>
      timeStepPresets.map(preset => ({
        value: preset.id,
        label: preset.name,
        supportingText: formatDurationCompact(getStepDuration(preset)),
      })),
    [timeStepPresets],
  );

  const applySessionPresetToEditor = useCallback((preset: SessionPreset | null) => {
    const nextSteps = preset ? createEditableSteps(preset) : [];

    setSelectedSessionPresetId(preset?.id ?? '');
    setSessionName(preset?.name ?? '');
    setSessionDescription(preset?.description ?? '');
    setSessionWindowWidth(preset?.windowWidth ?? '');
    setSessionWindowHeight(preset?.windowHeight ?? '');
    setSessionIsShuffle(preset?.isShuffle ?? false);
    setSessionAutoTags(preset?.autoTags ?? []);
    setSessionSteps(nextSteps);
    setCollapsedSessionStepIds(new Set(nextSteps.map(step => step.id)));
  }, []);

  const applyTimeStepPresetToEditor = useCallback((preset: TimeStepPreset | null) => {
    setSelectedTimeStepPresetId(preset?.id ?? '');
    setTimeStepName(preset?.name ?? '');
    setEditableTimeStep(preset ? createStepFromTimeStepPreset(preset, 1) : null);
  }, []);

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
  }, [applySessionPresetToEditor, applyTimeStepPresetToEditor, t]);

  useEffect(() => {
    void loadPresetSettings();
  }, [loadPresetSettings]);

  useEffect(() => {
    const sessionStepIds = new Set(sessionSteps.map(step => step.id));

    setCollapsedSessionStepIds(current => {
      const nextCollapsedStepIds = new Set(
        [...current].filter(stepId => sessionStepIds.has(stepId)),
      );

      return nextCollapsedStepIds.size === current.size ? current : nextCollapsedStepIds;
    });
  }, [sessionSteps]);

  const handleSessionPresetSelect = (presetId: string) => {
    const nextPreset = sessionPresets.find(preset => preset.id === presetId) ?? null;
    setError(null);
    setStatus(null);
    setEditorMode('session');
    applySessionPresetToEditor(nextPreset);
    setStoredActiveSessionPresetId(nextPreset?.id ?? null);
  };

  const handleTimeStepPresetSelect = (presetId: string) => {
    const nextPreset = timeStepPresets.find(preset => preset.id === presetId) ?? null;
    setError(null);
    setStatus(null);
    setEditorMode('time-step');
    applyTimeStepPresetToEditor(nextPreset);
  };

  const handleCreateSessionPreset = () => {
    const nextStep = createStepFromFirstTimeStepPreset(timeStepPresets, 1);

    setError(null);
    setStatus(null);
    setEditorMode('session');
    setSelectedSessionPresetId('');
    setSessionName(t('presets.untitled_session', { defaultValue: NEW_SESSION_PRESET_NAME }));
    setSessionDescription('');
    setSessionWindowWidth('240');
    setSessionWindowHeight('');
    setSessionIsShuffle(false);
    setSessionAutoTags([]);
    setSessionSteps(nextStep ? [nextStep] : []);
    setCollapsedSessionStepIds(new Set());
  };

  const handleCreateTimeStepPreset = () => {
    const nextStep = createCustomStep(
      1,
      t('croquis.user_custom_step', { defaultValue: 'User Custom Step' }),
    );

    setError(null);
    setStatus(null);
    setEditorMode('time-step');
    setSelectedTimeStepPresetId('');
    setTimeStepName(t('presets.untitled_time_step', { defaultValue: NEW_TIME_STEP_PRESET_NAME }));
    setEditableTimeStep(nextStep);
  };

  const handleAddSessionStep = () => {
    const nextStep = createStepFromFirstTimeStepPreset(timeStepPresets, sessionSteps.length + 1);
    if (!nextStep) {
      setError(
        t('presets.error.create_time_step_before_append', {
          defaultValue: 'Create a time step preset before appending session steps.',
        }),
      );
      return;
    }

    setSessionSteps(normalizeStepOrders([...sessionSteps, nextStep]));
    setCollapsedSessionStepIds(current => {
      if (!current.has(nextStep.id)) {
        return current;
      }

      const nextCollapsedStepIds = new Set(current);
      nextCollapsedStepIds.delete(nextStep.id);
      return nextCollapsedStepIds;
    });
    setStatus(null);
  };

  const handleDeleteSessionStep = (stepId: string) => {
    setSessionSteps(current => normalizeStepOrders(current.filter(step => step.id !== stepId)));
    setCollapsedSessionStepIds(current => {
      if (!current.has(stepId)) {
        return current;
      }

      const nextCollapsedStepIds = new Set(current);
      nextCollapsedStepIds.delete(stepId);
      return nextCollapsedStepIds;
    });
    setStatus(null);
  };

  const reorderSessionStep = (
    sourceStepId: string,
    targetStepId: string,
    position: AccordionReorderPosition,
  ) => {
    setSessionSteps(current => {
      if (sourceStepId === targetStepId) {
        return current;
      }

      const sourceIndex = current.findIndex(step => step.id === sourceStepId);
      const targetIndex = current.findIndex(step => step.id === targetStepId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const nextSteps = [...current];
      const [sourceStep] = nextSteps.splice(sourceIndex, 1);
      const nextTargetIndex = nextSteps.findIndex(step => step.id === targetStepId);
      if (nextTargetIndex < 0) {
        return current;
      }

      nextSteps.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, sourceStep);
      return normalizeStepOrders(nextSteps);
    });
    setStatus(null);
  };

  const handleMoveSessionStep = (stepId: string, direction: -1 | 1) => {
    setSessionSteps(current => {
      const index = current.findIndex(step => step.id === stepId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextSteps = [...current];
      const [step] = nextSteps.splice(index, 1);
      nextSteps.splice(nextIndex, 0, step);
      return normalizeStepOrders(nextSteps);
    });
    setStatus(null);
  };

  const handleSessionStepAccordionValueChange = (value: AccordionRootValue) => {
    const expandedStepIds = new Set(
      Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
    );

    setCollapsedSessionStepIds(
      new Set(sessionSteps.map(step => step.id).filter(stepId => !expandedStepIds.has(stepId))),
    );
  };

  const handleSessionStepReorder = ({ value, targetValue, position }: AccordionReorderPayload) => {
    reorderSessionStep(value, targetValue, position);
  };

  const handleSessionStepPresetChange = (stepId: string, nextValue: string) => {
    setSessionSteps(current =>
      normalizeStepOrders(
        current.map(step => {
          if (step.id !== stepId) {
            return step;
          }

          const nextPreset = timeStepPresets.find(preset => preset.id === nextValue);
          return nextPreset ? applyTimeStepPresetToStep(step, nextPreset) : step;
        }),
      ),
    );
    setStatus(null);
  };

  const handleSessionAutoTagAdd = (tag: Tag) => {
    setSessionAutoTags(current => {
      if (current.some(autoTag => autoTag.id === tag.id)) {
        return current;
      }

      return [...current, tag];
    });
    setStatus(null);
  };

  const handleSessionAutoTagRemove = (tagId: string) => {
    setSessionAutoTags(current => current.filter(tag => tag.id !== tagId));
    setStatus(null);
  };

  const updateEditableTimeStep = (updater: (step: EditableSessionStep) => EditableSessionStep) => {
    setEditableTimeStep(current => (current === null ? current : updater(current)));
    setStatus(null);
  };

  const handleEditableTimeStepTagAdd = (tag: Tag) => {
    updateEditableTimeStep(currentStep => {
      if (currentStep.autoTags.some(autoTag => autoTag.id === tag.id)) {
        return currentStep;
      }

      return {
        ...currentStep,
        autoTags: [...currentStep.autoTags, tag],
      };
    });
  };

  const handleEditableTimeStepTagRemove = (tagId: string) => {
    updateEditableTimeStep(currentStep => ({
      ...currentStep,
      autoTags: currentStep.autoTags.filter(tag => tag.id !== tagId),
    }));
  };

  const persistSessionPreset = async (duplicate = false) => {
    const trimmedName = sessionName.trim();
    if (!trimmedName) {
      setError(
        t('presets.error.session_name_required', { defaultValue: 'Session name is required.' }),
      );
      return;
    }

    if (sessionSteps.length === 0) {
      setError(
        t('presets.error.add_time_step_before_saving', {
          defaultValue: 'Add at least one time step before saving.',
        }),
      );
      return;
    }

    if (sessionSteps.some(step => !step.timeStepPresetId)) {
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
      description: sessionDescription,
      windowWidth: normalizeOptionalString(sessionWindowWidth),
      windowHeight: normalizeOptionalString(sessionWindowHeight),
      isShuffle: sessionIsShuffle,
      autoTags: sessionAutoTags,
      steps: sessionSteps,
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
      applySessionPresetToEditor(nextSelectedPreset);
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
    const trimmedName = timeStepName.trim();
    if (!trimmedName) {
      setError(
        t('presets.error.time_step_name_required', { defaultValue: 'Time step name is required.' }),
      );
      return;
    }

    if (editableTimeStep === null) {
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
        ...editableTimeStep,
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

      saveStoredTimeStepFilterSettings(nextSelectedPreset?.id, editableTimeStep);
      setTimeStepPresets(nextTimeStepPresets);
      setSessionPresets(nextSessionPresets);
      setSessionSteps(currentSteps =>
        refreshSessionStepsFromTimeStepPresets(currentSteps, nextTimeStepPresets),
      );
      applyTimeStepPresetToEditor(nextSelectedPreset);
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
      applyTimeStepPresetToEditor(nextSelectedPreset);
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

  const canSaveSession =
    editorMode === 'session' &&
    !editorDisabled &&
    sessionName.trim().length > 0 &&
    sessionSteps.length > 0 &&
    sessionSteps.every(step => Boolean(step.timeStepPresetId));
  const canDuplicateSession = canSaveSession && selectedSessionPreset !== null;
  const canSaveTimeStep =
    editorMode === 'time-step' &&
    !editorDisabled &&
    timeStepName.trim().length > 0 &&
    editableTimeStep !== null;
  const canDuplicateTimeStep = canSaveTimeStep && selectedTimeStepPreset !== null;
  const canDeleteTimeStep = !editorDisabled && selectedTimeStepPreset !== null;

  return (
    <section
      className="session-preset-settings"
      aria-label={t('presets.settings.title', { defaultValue: 'Preset Settings' })}
    >
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
              onClick={handleCreateSessionPreset}
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
                <Button size="sm" onClick={handleCreateSessionPreset}>
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
                    handleSessionPresetSelect(preset.id);
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
              onClick={handleCreateTimeStepPreset}
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
                    handleTimeStepPresetSelect(preset.id);
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
              onClick={handleCreateTimeStepPreset}
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

      <div className="session-preset-settings__editor">
        {editorMode === 'session' ? (
          <>
            <div className="session-preset-settings__header">
              <div className="session-preset-settings__session-panel">
                <Input
                  label={t('presets.session_name', { defaultValue: 'Session Name' })}
                  value={sessionName}
                  disabled={editorDisabled}
                  onChange={event => {
                    setSessionName(event.target.value);
                    setStatus(null);
                  }}
                />
                <label className="session-preset-settings__textarea-field">
                  <span>{t('common.description', { defaultValue: 'Description' })}</span>
                  <textarea
                    value={sessionDescription}
                    disabled={editorDisabled}
                    className="session-preset-settings__textarea"
                    onChange={event => {
                      setSessionDescription(event.target.value);
                      setStatus(null);
                    }}
                  />
                </label>
                <div className="session-preset-settings__session-auto-tags">
                  <AutoTagPicker
                    label={t('croquis.session_auto_tags', { defaultValue: 'Session Auto Tags' })}
                    tags={sessionAutoTags}
                    availableTags={tags}
                    tagGroups={tagGroups}
                    disabled={editorDisabled}
                    emptyLabel={t('croquis.session_auto_tags.empty', {
                      defaultValue: 'No session auto tags',
                    })}
                    onTagAdd={handleSessionAutoTagAdd}
                    onTagRemove={handleSessionAutoTagRemove}
                  />
                </div>
              </div>
            </div>

            <main className="session-preset-settings__content">
              <div className="session-preset-settings__timeline-header">
                <span className="session-preset-settings__eyebrow">
                  {t('presets.session_timeline', { defaultValue: 'Session Timeline' })}
                </span>
                <span>{formatStepCount(sessionSteps.length, t)}</span>
              </div>

              <AccordionRoot
                type="multiple"
                value={expandedSessionStepIds}
                onValueChange={handleSessionStepAccordionValueChange}
                reorderable={sessionSteps.length > 0}
                onItemReorder={handleSessionStepReorder}
                className="session-preset-settings__timeline-grid"
              >
                {sessionSteps.map((step, index) => {
                  const stepNumber = index + 1;
                  const stepBodyId = `session-preset-step-${step.id}`;
                  const stepHeaderId = `${stepBodyId}-header`;
                  const isCollapsed = collapsedSessionStepIds.has(step.id);

                  return (
                    <AccordionItem
                      key={step.id}
                      value={step.id}
                      className="session-preset-settings__step-card"
                      disabled={editorDisabled}
                    >
                      <AccordionItemDragHeader
                        id={stepHeaderId}
                        className="session-preset-settings__step-header"
                        controlsId={stepBodyId}
                        disclosureLabel={t(
                          isCollapsed ? 'presets.expand_step' : 'presets.collapse_step',
                          {
                            step: String(stepNumber),
                            defaultValue: isCollapsed
                              ? 'Expand step {{step}}'
                              : 'Collapse step {{step}}',
                          },
                        )}
                        dragLabel={t('presets.drag_step_to_reorder', {
                          step: String(stepNumber),
                          defaultValue: 'Drag step {{step}} to reorder',
                        })}
                      >
                        <span className="session-preset-settings__step-index">
                          {String(stepNumber).padStart(2, '0')}
                        </span>
                        <Select
                          aria-label={t('presets.step_time_step_preset', {
                            step: String(stepNumber),
                            defaultValue: 'Step {{step}} time step preset',
                          })}
                          options={timeStepPresetOptions}
                          value={step.timeStepPresetId ?? ''}
                          disabled={editorDisabled || timeStepPresetOptions.length === 0}
                          onValueChange={nextValue => {
                            handleSessionStepPresetChange(step.id, nextValue);
                          }}
                        />
                        <span className="session-preset-settings__step-duration">
                          {formatDurationCompact(getStepDuration(step))}
                        </span>
                      </AccordionItemDragHeader>
                      <div className="session-preset-settings__step-summary">
                        <strong>{step.name}</strong>
                        <span>{formatDurationCompact(getStepDuration(step))}</span>
                        <span>{formatStepOptionSummary(step, t)}</span>
                        <span>{formatAutoTagSummary(step.autoTags, t)}</span>
                      </div>
                      <AccordionItemBody
                        id={stepBodyId}
                        labelledBy={stepHeaderId}
                        className="session-preset-settings__step-body"
                      >
                        <SessionPresetStepEditor
                          step={step}
                          durationSeconds={getStepDuration(step)}
                          disabled
                          onTimerChange={ignoreStepEditorChange}
                          onAutoAdvanceChange={ignoreStepEditorChange}
                          onRecordsSaveChange={ignoreStepEditorChange}
                          onRequireResultChange={ignoreStepEditorChange}
                          onCaptureChange={ignoreStepEditorChange}
                          onFilterChange={ignoreStepEditorChange}
                          onGrayscaleChange={ignoreStepEditorChange}
                          onBlurChange={ignoreStepEditorChange}
                          onBlurAmountChange={ignoreStepEditorChange}
                          onResultSavePathChange={ignoreStepEditorChange}
                        />
                        <div className="session-preset-settings__step-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={editorDisabled || index === 0}
                            onClick={() => {
                              handleMoveSessionStep(step.id, -1);
                            }}
                          >
                            {t('common.move_up', { defaultValue: 'Move Up' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={editorDisabled || index === sessionSteps.length - 1}
                            onClick={() => {
                              handleMoveSessionStep(step.id, 1);
                            }}
                          >
                            {t('common.move_down', { defaultValue: 'Move Down' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={editorDisabled}
                            onClick={() => {
                              handleDeleteSessionStep(step.id);
                            }}
                          >
                            {t('common.delete', { defaultValue: 'Delete' })}
                          </Button>
                        </div>
                      </AccordionItemBody>
                    </AccordionItem>
                  );
                })}

                {sessionSteps.length === 0 ? (
                  <div className="session-preset-settings__empty-detail">
                    <span>
                      {t('presets.append_saved_time_step_hint', {
                        defaultValue: 'Append a saved time step preset to build this session.',
                      })}
                    </span>
                    <Button size="sm" disabled={editorDisabled} onClick={handleAddSessionStep}>
                      {t('presets.append_time_step', { defaultValue: 'Append Time Step' })}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="session-preset-settings__append-card"
                    disabled={editorDisabled}
                    onClick={handleAddSessionStep}
                  >
                    <span>
                      {t('presets.append_time_step', { defaultValue: 'Append Time Step' })}
                    </span>
                    <Icon name="plus" size="sm" hierarchy="tertiary" aria-hidden />
                  </button>
                )}
              </AccordionRoot>

              <section className="session-preset-settings__options-strip">
                <div className="session-preset-settings__window-grid">
                  <Input
                    label={t('croquis.window_height', { defaultValue: 'Window height' })}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sessionWindowHeight}
                    placeholder="180"
                    disabled={editorDisabled}
                    onChange={event => {
                      setSessionWindowHeight(normalizeWindowDimension(event.target.value));
                      setStatus(null);
                    }}
                  />
                  <Input
                    label={t('croquis.window_width', { defaultValue: 'Window width' })}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={sessionWindowWidth}
                    placeholder="1080"
                    disabled={editorDisabled}
                    onChange={event => {
                      setSessionWindowWidth(normalizeWindowDimension(event.target.value));
                      setStatus(null);
                    }}
                  />
                </div>
                <CheckboxRow
                  label={t('croquis.shuffle_entire_queue', {
                    defaultValue: 'Shuffle entire queue',
                  })}
                  checked={sessionIsShuffle}
                  disabled={editorDisabled}
                  onCheckedChange={checked => {
                    setSessionIsShuffle(checked);
                    setStatus(null);
                  }}
                />
              </section>

              {error ? (
                <div className="session-preset-settings__message is-error">{error}</div>
              ) : null}
              {status ? (
                <div className="session-preset-settings__message" role="status">
                  {status}
                </div>
              ) : null}
            </main>

            <footer className="session-preset-settings__footer">
              <Button
                size="sm"
                disabled={!canSaveSession}
                onClick={() => {
                  void persistSessionPreset(false);
                }}
              >
                {busy
                  ? t('common.saving', { defaultValue: 'Saving...' })
                  : t('presets.save_session', { defaultValue: 'Save Session' })}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canDuplicateSession}
                onClick={() => {
                  void persistSessionPreset(true);
                }}
              >
                {t('presets.duplicate_session', { defaultValue: 'Duplicate Session' })}
              </Button>
            </footer>
          </>
        ) : (
          <>
            <div className="session-preset-settings__header">
              <div className="session-preset-settings__session-panel session-preset-settings__session-panel--time-step">
                <Input
                  label={t('presets.time_step_name', { defaultValue: 'Time Step Name' })}
                  value={timeStepName}
                  disabled={editorDisabled}
                  onChange={event => {
                    setTimeStepName(event.target.value);
                    setEditableTimeStep(current =>
                      current ? { ...current, name: event.target.value } : current,
                    );
                    setStatus(null);
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
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            defaultDurationSeconds: nextSeconds,
                          }));
                        }}
                        onAutoAdvanceChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            autoAdvance: checked,
                          }));
                        }}
                        onRecordsSaveChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            recordSaveEnabled: checked,
                            captureEnabled: checked ? currentStep.captureEnabled : false,
                          }));
                        }}
                        onRequireResultChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            resultRequired: checked,
                          }));
                        }}
                        onCaptureChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            captureEnabled: checked,
                          }));
                        }}
                        onFilterChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            filterEnabled: checked,
                          }));
                        }}
                        onGrayscaleChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            grayscaleEnabled: checked,
                          }));
                        }}
                        onBlurChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            blurEnabled: checked,
                          }));
                        }}
                        onBlurAmountChange={value => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            blurAmount: clampFilterPercent(value),
                          }));
                        }}
                        onResultSavePathChange={path => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            resultSavePath: normalizeOptionalString(path),
                          }));
                        }}
                        onAutoTagAdd={handleEditableTimeStepTagAdd}
                        onAutoTagRemove={handleEditableTimeStepTagRemove}
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
                    <Button
                      size="sm"
                      disabled={editorDisabled}
                      onClick={handleCreateTimeStepPreset}
                    >
                      {t('presets.create_time_step_preset_title', {
                        defaultValue: 'Create Time Step Preset',
                      })}
                    </Button>
                  </div>
                )}
              </div>

              {error ? (
                <div className="session-preset-settings__message is-error">{error}</div>
              ) : null}
              {status ? (
                <div className="session-preset-settings__message" role="status">
                  {status}
                </div>
              ) : null}
            </main>

            <footer className="session-preset-settings__footer">
              <Button
                size="sm"
                disabled={!canSaveTimeStep}
                onClick={() => {
                  void persistTimeStepPreset(false);
                }}
              >
                {busy
                  ? t('common.saving', { defaultValue: 'Saving...' })
                  : t('presets.save_time_step', { defaultValue: 'Save Time Step' })}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canDuplicateTimeStep}
                onClick={() => {
                  void persistTimeStepPreset(true);
                }}
              >
                {t('presets.duplicate_time_step', { defaultValue: 'Duplicate Time Step' })}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!canDeleteTimeStep}
                onClick={() => {
                  void deleteTimeStepPreset();
                }}
              >
                {t('presets.delete_time_step', { defaultValue: 'Delete Time Step' })}
              </Button>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
