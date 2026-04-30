import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  CheckboxRow,
  Icon,
  IconButton,
  Input,
  Select,
  type SelectOption,
} from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type {
  CroquisOption,
  LibrarySettings,
  SessionPreset,
  Tag,
  TimeStepPreset,
} from '../../../shared/types';
import { buildPreferences, cloneOption, findFallbackPreset } from '../../croquis/lib/startModal';
import {
  USER_CUSTOM_STEP_LABEL,
  USER_CUSTOM_STEP_VALUE,
  applyTimeStepPresetToStep,
  clampDurationSeconds,
  createCustomStep,
  createEditableSteps,
  createStepFromTimeStepPreset,
  formatDurationCompact,
  getStepDuration,
  normalizeStepOrders,
  normalizeWindowDimension,
  toSaveSessionPresetPayload,
  toSaveTimeStepPresetPayload,
  type EditableSessionStep,
} from '../../croquis/lib/sessionPresetEditor';
import { SessionPresetStepEditor } from '../../croquis/ui/SessionPresetStepEditor';
import './session-preset-settings.css';

const NEW_SESSION_PRESET_NAME = 'Untitled Preset';
const NEW_TIME_STEP_PRESET_NAME = 'Untitled Time Step';
const DUPLICATE_SUFFIX = ' Copy';

type EditorMode = 'session' | 'time-step';
type NamedPreset = { id: string; name: string };

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

function resolveActiveOption(settings: LibrarySettings): CroquisOption {
  const preferences = settings.croquisPreferences;
  const activeOption =
    preferences?.presets.find(preset => preset.id === preferences.activePresetId)?.option ??
    preferences?.presets[0]?.option ??
    null;

  return cloneOption(activeOption);
}

function formatStepCount(stepCount: number) {
  return `${String(stepCount)} ${stepCount === 1 ? 'step' : 'steps'}`;
}

function getDuplicateName(name: string, fallbackName: string) {
  const trimmedName = name.trim() || fallbackName;
  return `${trimmedName}${DUPLICATE_SUFFIX}`;
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
  fallbackSeconds: number,
  stepOrder: number,
) {
  if (timeStepPresets.length === 0) {
    return createCustomStep(fallbackSeconds, stepOrder);
  }

  return createStepFromTimeStepPreset(timeStepPresets[0], stepOrder);
}

function formatTagNames(tags: readonly Tag[]) {
  return tags.map(tag => tag.name).join(', ');
}

function createDraftTags(value: string): Tag[] {
  const uniqueNames = Array.from(
    new Set(
      value
        .split(',')
        .map(tagName => tagName.trim())
        .filter(Boolean),
    ),
  );

  return uniqueNames.map((name, index) => ({
    id: `draft-tag-${name}`,
    groupId: null,
    name,
    color: null,
    sortOrder: index,
    createdAt: '',
    updatedAt: '',
  }));
}

export function SessionPresetSettingsView() {
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [settings, setSettings] = useState<LibrarySettings>({});
  const [editorMode, setEditorMode] = useState<EditorMode>('session');
  const [selectedSessionPresetId, setSelectedSessionPresetId] = useState('');
  const [selectedTimeStepPresetId, setSelectedTimeStepPresetId] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionSteps, setSessionSteps] = useState<EditableSessionStep[]>([]);
  const [timeStepName, setTimeStepName] = useState('');
  const [timeStepTagInput, setTimeStepTagInput] = useState('');
  const [editableTimeStep, setEditableTimeStep] = useState<EditableSessionStep | null>(null);
  const [option, setOption] = useState<CroquisOption>(() => cloneOption());
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

  const timeStepPresetOptions: SelectOption[] = useMemo(
    () => [
      {
        value: USER_CUSTOM_STEP_VALUE,
        label: USER_CUSTOM_STEP_LABEL,
      },
      ...timeStepPresets.map(preset => ({
        value: preset.id,
        label: preset.name,
        supportingText: formatDurationCompact(getStepDuration(preset, option.timer.maxTime)),
      })),
    ],
    [option.timer.maxTime, timeStepPresets],
  );

  const applySessionPresetToEditor = useCallback((preset: SessionPreset | null) => {
    const nextSteps = preset ? createEditableSteps(preset) : [];

    setSelectedSessionPresetId(preset?.id ?? '');
    setSessionName(preset?.name ?? '');
    setSessionDescription(preset?.description ?? '');
    setSessionSteps(nextSteps);
  }, []);

  const applyTimeStepPresetToEditor = useCallback((preset: TimeStepPreset | null) => {
    setSelectedTimeStepPresetId(preset?.id ?? '');
    setTimeStepName(preset?.name ?? '');
    setTimeStepTagInput(preset ? formatTagNames(preset.autoTags) : '');
    setEditableTimeStep(preset ? createStepFromTimeStepPreset(preset, 1) : null);
  }, []);

  const loadPresetSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const [nextSessionPresets, nextTimeStepPresets, nextSettings] = await Promise.all([
        ipc.session.listPresets(),
        ipc.session.listTimeStepPresets(),
        ipc.library.loadSettingsSnapshot(),
      ]);
      const fallbackSessionPreset = findFallbackPreset(nextSessionPresets, nextSettings);

      setSessionPresets(nextSessionPresets);
      setTimeStepPresets(nextTimeStepPresets);
      setSettings(nextSettings);
      setOption(resolveActiveOption(nextSettings));
      applySessionPresetToEditor(fallbackSessionPreset);
      applyTimeStepPresetToEditor(nextTimeStepPresets[0] ?? null);
      setEditorMode('session');
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Failed to load preset settings.'));
      setSessionPresets([]);
      setTimeStepPresets([]);
      applySessionPresetToEditor(null);
      applyTimeStepPresetToEditor(null);
    } finally {
      setLoading(false);
    }
  }, [applySessionPresetToEditor, applyTimeStepPresetToEditor]);

  useEffect(() => {
    void loadPresetSettings();
  }, [loadPresetSettings]);

  const handleSessionPresetSelect = (presetId: string) => {
    const nextPreset = sessionPresets.find(preset => preset.id === presetId) ?? null;
    setError(null);
    setStatus(null);
    setEditorMode('session');
    applySessionPresetToEditor(nextPreset);
  };

  const handleTimeStepPresetSelect = (presetId: string) => {
    const nextPreset = timeStepPresets.find(preset => preset.id === presetId) ?? null;
    setError(null);
    setStatus(null);
    setEditorMode('time-step');
    applyTimeStepPresetToEditor(nextPreset);
  };

  const handleCreateSessionPreset = () => {
    const nextStep = createStepFromFirstTimeStepPreset(timeStepPresets, option.timer.maxTime, 1);

    setError(null);
    setStatus(null);
    setEditorMode('session');
    setSelectedSessionPresetId('');
    setSessionName(NEW_SESSION_PRESET_NAME);
    setSessionDescription('');
    setSessionSteps([nextStep]);
  };

  const handleCreateTimeStepPreset = () => {
    const nextStep = createCustomStep(option.timer.maxTime, 1);

    setError(null);
    setStatus(null);
    setEditorMode('time-step');
    setSelectedTimeStepPresetId('');
    setTimeStepName(NEW_TIME_STEP_PRESET_NAME);
    setTimeStepTagInput('');
    setEditableTimeStep(nextStep);
  };

  const handleAddSessionStep = () => {
    const nextStep = createStepFromFirstTimeStepPreset(
      timeStepPresets,
      option.timer.maxTime,
      sessionSteps.length + 1,
    );

    setSessionSteps(normalizeStepOrders([...sessionSteps, nextStep]));
    setStatus(null);
  };

  const handleDeleteSessionStep = (stepId: string) => {
    const nextSteps = normalizeStepOrders(sessionSteps.filter(step => step.id !== stepId));

    setSessionSteps(nextSteps);
    setStatus(null);
  };

  const handleSessionStepPresetChange = (stepId: string, nextValue: string) => {
    setSessionSteps(current =>
      normalizeStepOrders(
        current.map(step => {
          if (step.id !== stepId) {
            return step;
          }

          if (nextValue === USER_CUSTOM_STEP_VALUE) {
            return {
              ...step,
              timeStepPresetId: null,
            };
          }

          const nextPreset = timeStepPresets.find(preset => preset.id === nextValue);
          return nextPreset ? applyTimeStepPresetToStep(step, nextPreset) : step;
        }),
      ),
    );
    setStatus(null);
  };

  const updateSessionStep = (
    stepId: string,
    updater: (step: EditableSessionStep) => EditableSessionStep,
  ) => {
    setSessionSteps(current =>
      normalizeStepOrders(
        current.map(step => {
          if (step.id !== stepId) {
            return step;
          }

          return {
            ...updater(step),
            timeStepPresetId: null,
          };
        }),
      ),
    );
    setStatus(null);
  };

  const updateEditableTimeStep = (updater: (step: EditableSessionStep) => EditableSessionStep) => {
    setEditableTimeStep(current => {
      if (current === null) {
        return current;
      }

      return {
        ...updater(current),
        timeStepPresetId: null,
      };
    });
    setStatus(null);
  };

  const persistSessionPreset = async (duplicate = false) => {
    const trimmedName = sessionName.trim();
    if (!trimmedName) {
      setError('Session name is required.');
      return;
    }

    if (sessionSteps.length === 0) {
      setError('Add at least one timeline step before saving.');
      return;
    }

    const nextName = duplicate
      ? getDuplicateName(trimmedName, NEW_SESSION_PRESET_NAME)
      : trimmedName;
    const payload = toSaveSessionPresetPayload({
      preset: selectedSessionPreset,
      name: nextName,
      description: sessionDescription,
      steps: sessionSteps,
      duplicate,
    });

    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const preferencesPayload = buildPreferences(option);
      const [nextSessionPresets, nextPreferences] = await Promise.all([
        ipc.session.savePreset(payload),
        ipc.library.saveCroquisPreferences(preferencesPayload),
      ]);
      const nextSelectedPreset = duplicate
        ? findCreatedPreset(sessionPresets, nextSessionPresets, nextName)
        : (nextSessionPresets.find(preset => preset.id === selectedSessionPreset?.id) ??
          findCreatedPreset(sessionPresets, nextSessionPresets, nextName) ??
          findFallbackPreset(nextSessionPresets, settings));

      setSessionPresets(nextSessionPresets);
      setSettings(current => ({
        ...current,
        croquisPreferences: nextPreferences,
      }));
      setOption(resolveActiveOption({ ...settings, croquisPreferences: nextPreferences }));
      applySessionPresetToEditor(nextSelectedPreset);
      setEditorMode('session');
      setStatus(duplicate ? 'Session preset duplicated.' : 'Session preset saved.');
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Failed to save session preset.'));
    } finally {
      setBusy(false);
    }
  };

  const persistTimeStepPreset = async (duplicate = false) => {
    const trimmedName = timeStepName.trim();
    if (!trimmedName) {
      setError('Time step name is required.');
      return;
    }

    if (editableTimeStep === null) {
      setError('Select or create a time step preset before saving.');
      return;
    }

    const nextName = duplicate
      ? getDuplicateName(trimmedName, NEW_TIME_STEP_PRESET_NAME)
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
      const nextSelectedPreset = duplicate
        ? findCreatedPreset(timeStepPresets, nextTimeStepPresets, nextName)
        : (nextTimeStepPresets.find(preset => preset.id === selectedTimeStepPreset?.id) ??
          findCreatedPreset(timeStepPresets, nextTimeStepPresets, nextName) ??
          (nextTimeStepPresets.length > 0 ? nextTimeStepPresets[0] : null));

      setTimeStepPresets(nextTimeStepPresets);
      applyTimeStepPresetToEditor(nextSelectedPreset);
      setEditorMode('time-step');
      setStatus(duplicate ? 'Time step preset duplicated.' : 'Time step preset saved.');
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Failed to save time step preset.'));
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
      const nextSessionPresets = await ipc.session.listPresets();
      const nextSelectedPreset = nextTimeStepPresets.length > 0 ? nextTimeStepPresets[0] : null;

      setTimeStepPresets(nextTimeStepPresets);
      setSessionPresets(nextSessionPresets);
      applyTimeStepPresetToEditor(nextSelectedPreset);
      if (nextSelectedPreset === null) {
        setEditorMode('session');
      }
      setStatus('Time step preset deleted.');
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Failed to delete time step preset.'));
    } finally {
      setBusy(false);
    }
  };

  const canSaveSession =
    editorMode === 'session' &&
    !editorDisabled &&
    sessionName.trim().length > 0 &&
    sessionSteps.length > 0;
  const canDuplicateSession = canSaveSession && selectedSessionPreset !== null;
  const canSaveTimeStep =
    editorMode === 'time-step' &&
    !editorDisabled &&
    timeStepName.trim().length > 0 &&
    editableTimeStep !== null;
  const canDuplicateTimeStep = canSaveTimeStep && selectedTimeStepPreset !== null;
  const canDeleteTimeStep = !editorDisabled && selectedTimeStepPreset !== null;

  return (
    <section className="session-preset-settings" aria-label="Preset Settings">
      <aside className="session-preset-settings__list-panel">
        <div className="session-preset-settings__nav-section session-preset-settings__nav-section--presets">
          <div className="session-preset-settings__list-header">
            <span className="session-preset-settings__eyebrow">Session Presets</span>
            <IconButton
              icon="plus"
              size="md"
              aria-label="Create session preset"
              title="Create session preset"
              disabled={editorDisabled}
              onClick={handleCreateSessionPreset}
            />
          </div>

          <div className="session-preset-settings__preset-list">
            {loading ? (
              <div className="session-preset-settings__state">Loading presets...</div>
            ) : sessionPresets.length === 0 ? (
              <div className="session-preset-settings__state">
                <p>No session presets available.</p>
                <Button size="sm" onClick={handleCreateSessionPreset}>
                  Create Preset
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
                    <span>{preset.description || formatStepCount(preset.steps.length)}</span>
                  </span>
                  {preset.isDefault ? (
                    <span className="session-preset-settings__preset-badge">Default</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="session-preset-settings__nav-section session-preset-settings__nav-section--steps">
          <div className="session-preset-settings__time-step-header">
            <span className="session-preset-settings__eyebrow">Time Step Presets</span>
            <IconButton
              icon="plus"
              size="md"
              aria-label="Create time step preset"
              title="Create time step preset"
              disabled={editorDisabled}
              onClick={handleCreateTimeStepPreset}
            />
          </div>

          <div className="session-preset-settings__time-step-list">
            {timeStepPresets.length === 0 ? (
              <div className="session-preset-settings__state">No time step presets yet.</div>
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
                    {formatDurationCompact(getStepDuration(preset, option.timer.maxTime))}
                  </span>
                  <span className="session-preset-settings__time-step-main">
                    <strong>{preset.name}</strong>
                    <span>{String(preset.autoTags.length)} tags</span>
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
              <span>Create Time Step Preset</span>
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
                  label="Session Name"
                  value={sessionName}
                  disabled={editorDisabled}
                  onChange={event => {
                    setSessionName(event.target.value);
                    setStatus(null);
                  }}
                />
                <label className="session-preset-settings__textarea-field">
                  <span>Description</span>
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
              </div>
            </div>

            <main className="session-preset-settings__content">
              <div className="session-preset-settings__timeline-header">
                <span className="session-preset-settings__eyebrow">Session Timeline</span>
                <span>{formatStepCount(sessionSteps.length)}</span>
              </div>

              <div className="session-preset-settings__timeline-grid">
                {sessionSteps.map((step, index) => (
                  <article key={step.id} className="session-preset-settings__step-card">
                    <div className="session-preset-settings__step-header">
                      <span className="session-preset-settings__step-index">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <Select
                        aria-label={`Step ${String(index + 1)} time step preset`}
                        options={timeStepPresetOptions}
                        value={step.timeStepPresetId ?? USER_CUSTOM_STEP_VALUE}
                        disabled={editorDisabled}
                        onValueChange={nextValue => {
                          handleSessionStepPresetChange(step.id, nextValue);
                        }}
                      />
                      <span className="session-preset-settings__step-duration">
                        {formatDurationCompact(getStepDuration(step, option.timer.maxTime))}
                      </span>
                    </div>
                    <div className="session-preset-settings__step-body">
                      <SessionPresetStepEditor
                        step={step}
                        option={option}
                        durationSeconds={getStepDuration(step, option.timer.maxTime)}
                        disabled={editorDisabled}
                        onTimerChange={seconds => {
                          const nextSeconds = clampDurationSeconds(seconds);
                          updateSessionStep(step.id, currentStep => ({
                            ...currentStep,
                            defaultDurationSeconds: nextSeconds,
                          }));
                        }}
                        onAutoSkipChange={checked => {
                          setOption(current => ({
                            ...current,
                            auto: { isSkip: checked },
                          }));
                          setStatus(null);
                        }}
                        onRecordsSaveChange={checked => {
                          setOption(current => ({
                            ...current,
                            isRecordSave: checked,
                            isCapture: checked ? current.isCapture : false,
                          }));
                          setStatus(null);
                        }}
                        onRequireResultChange={checked => {
                          updateSessionStep(step.id, currentStep => ({
                            ...currentStep,
                            resultRequired: checked,
                          }));
                        }}
                        onCaptureChange={checked => {
                          setOption(current => ({
                            ...current,
                            isCapture: checked,
                          }));
                          setStatus(null);
                        }}
                      />
                      <div className="session-preset-settings__step-actions">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={editorDisabled}
                          onClick={() => {
                            handleDeleteSessionStep(step.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}

                {sessionSteps.length === 0 ? (
                  <div className="session-preset-settings__empty-detail">
                    <span>Append a time step to build this session.</span>
                    <Button size="sm" disabled={editorDisabled} onClick={handleAddSessionStep}>
                      Append New Sequence Phase
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="session-preset-settings__append-card"
                    disabled={editorDisabled}
                    onClick={handleAddSessionStep}
                  >
                    <span>Append New Sequence Phase</span>
                    <Icon name="plus" size="sm" hierarchy="tertiary" aria-hidden />
                  </button>
                )}
              </div>

              <section className="session-preset-settings__options-strip">
                <div className="session-preset-settings__window-grid">
                  <Input
                    label="Window height"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={option.window.height ?? ''}
                    placeholder="180"
                    disabled={editorDisabled}
                    onChange={event => {
                      const height = normalizeWindowDimension(event.target.value);
                      setOption(current => ({
                        ...current,
                        window: {
                          ...current.window,
                          height,
                        },
                      }));
                      setStatus(null);
                    }}
                  />
                  <Input
                    label="Window width"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={option.window.width ?? ''}
                    placeholder="1080"
                    disabled={editorDisabled}
                    onChange={event => {
                      const width = normalizeWindowDimension(event.target.value);
                      setOption(current => ({
                        ...current,
                        window: {
                          ...current.window,
                          width,
                        },
                      }));
                      setStatus(null);
                    }}
                  />
                </div>
                <CheckboxRow
                  label="Shuffle entire queue"
                  checked={option.isShuffle}
                  disabled={editorDisabled}
                  onCheckedChange={checked => {
                    setOption(current => ({
                      ...current,
                      isShuffle: checked,
                    }));
                    setStatus(null);
                  }}
                />
                <Button
                  size="sm"
                  disabled={!canSaveSession}
                  onClick={() => {
                    void persistSessionPreset(false);
                  }}
                >
                  {busy ? 'Saving...' : 'Save Session'}
                </Button>
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
                variant="secondary"
                disabled={!canDuplicateSession}
                onClick={() => {
                  void persistSessionPreset(true);
                }}
              >
                Duplicate Session
              </Button>
            </footer>
          </>
        ) : (
          <>
            <div className="session-preset-settings__header">
              <div className="session-preset-settings__session-panel session-preset-settings__session-panel--time-step">
                <Input
                  label="Time Step Name"
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
                <span className="session-preset-settings__eyebrow">Time Step Preset</span>
                <span>
                  {editableTimeStep
                    ? formatDurationCompact(getStepDuration(editableTimeStep, option.timer.maxTime))
                    : 'None'}
                </span>
              </div>

              <div className="session-preset-settings__step-detail">
                {editableTimeStep ? (
                  <article className="session-preset-settings__step-card session-preset-settings__step-card--detail">
                    <div className="session-preset-settings__step-body">
                      <SessionPresetStepEditor
                        step={{ ...editableTimeStep, name: timeStepName }}
                        option={option}
                        durationSeconds={getStepDuration(editableTimeStep, option.timer.maxTime)}
                        disabled={editorDisabled}
                        showGlobalControls={false}
                        onTimerChange={seconds => {
                          const nextSeconds = clampDurationSeconds(seconds);
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            defaultDurationSeconds: nextSeconds,
                          }));
                        }}
                        onAutoSkipChange={() => undefined}
                        onRecordsSaveChange={() => undefined}
                        onRequireResultChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            resultRequired: checked,
                          }));
                        }}
                        onCaptureChange={() => undefined}
                      />
                      <Input
                        label="Auto Tags"
                        value={timeStepTagInput}
                        placeholder="Female, Dynamic"
                        disabled={editorDisabled}
                        onChange={event => {
                          const nextValue = event.target.value;
                          const nextTags = createDraftTags(nextValue);
                          setTimeStepTagInput(nextValue);
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            autoTags: nextTags,
                          }));
                        }}
                      />
                    </div>
                  </article>
                ) : (
                  <div className="session-preset-settings__empty-detail">
                    <span>Create a time step preset to edit duration and step rules.</span>
                    <Button
                      size="sm"
                      disabled={editorDisabled}
                      onClick={handleCreateTimeStepPreset}
                    >
                      Create Time Step Preset
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
                {busy ? 'Saving...' : 'Save Time Step'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canDuplicateTimeStep}
                onClick={() => {
                  void persistTimeStepPreset(true);
                }}
              >
                Duplicate Time Step
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!canDeleteTimeStep}
                onClick={() => {
                  void deleteTimeStepPreset();
                }}
              >
                Delete Time Step
              </Button>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
