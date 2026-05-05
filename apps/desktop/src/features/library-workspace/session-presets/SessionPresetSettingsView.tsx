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
import type { SessionPreset, Tag, TimeStepPreset } from '../../../shared/types';
import { findFallbackPreset, setStoredActiveSessionPresetId } from '../../croquis/lib/startModal';
import {
  applyTimeStepPresetToStep,
  clampDurationSeconds,
  createCustomStep,
  createEditableSteps,
  createStepFromTimeStepPreset,
  formatDurationCompact,
  getStepDuration,
  normalizeOptionalString,
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

const ignoreStepEditorChange = () => {};

export function SessionPresetSettingsView() {
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('session');
  const [selectedSessionPresetId, setSelectedSessionPresetId] = useState('');
  const [selectedTimeStepPresetId, setSelectedTimeStepPresetId] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [sessionWindowWidth, setSessionWindowWidth] = useState('');
  const [sessionWindowHeight, setSessionWindowHeight] = useState('');
  const [sessionIsShuffle, setSessionIsShuffle] = useState(false);
  const [sessionSteps, setSessionSteps] = useState<EditableSessionStep[]>([]);
  const [timeStepName, setTimeStepName] = useState('');
  const [timeStepTagInput, setTimeStepTagInput] = useState('');
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
      const [nextSessionPresets, nextTimeStepPresets] = await Promise.all([
        ipc.session.listPresets(),
        ipc.session.listTimeStepPresets(),
      ]);
      const fallbackSessionPreset = findFallbackPreset(nextSessionPresets);

      setSessionPresets(nextSessionPresets);
      setTimeStepPresets(nextTimeStepPresets);
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
    setSessionName(NEW_SESSION_PRESET_NAME);
    setSessionDescription('');
    setSessionWindowWidth('960');
    setSessionWindowHeight('');
    setSessionIsShuffle(false);
    setSessionSteps(nextStep ? [nextStep] : []);
  };

  const handleCreateTimeStepPreset = () => {
    const nextStep = createCustomStep(1);

    setError(null);
    setStatus(null);
    setEditorMode('time-step');
    setSelectedTimeStepPresetId('');
    setTimeStepName(NEW_TIME_STEP_PRESET_NAME);
    setTimeStepTagInput('');
    setEditableTimeStep(nextStep);
  };

  const handleAddSessionStep = () => {
    const nextStep = createStepFromFirstTimeStepPreset(timeStepPresets, sessionSteps.length + 1);
    if (!nextStep) {
      setError('Create a time step preset before appending session steps.');
      return;
    }

    setSessionSteps(normalizeStepOrders([...sessionSteps, nextStep]));
    setStatus(null);
  };

  const handleDeleteSessionStep = (stepId: string) => {
    setSessionSteps(current => normalizeStepOrders(current.filter(step => step.id !== stepId)));
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

  const updateEditableTimeStep = (updater: (step: EditableSessionStep) => EditableSessionStep) => {
    setEditableTimeStep(current => (current === null ? current : updater(current)));
    setStatus(null);
  };

  const persistSessionPreset = async (duplicate = false) => {
    const trimmedName = sessionName.trim();
    if (!trimmedName) {
      setError('Session name is required.');
      return;
    }

    if (sessionSteps.length === 0) {
      setError('Add at least one time step before saving.');
      return;
    }

    if (sessionSteps.some(step => !step.timeStepPresetId)) {
      setError('Session presets can only reference saved time step presets.');
      return;
    }

    const nextName = duplicate
      ? getDuplicateName(trimmedName, NEW_SESSION_PRESET_NAME)
      : trimmedName;
    const payload = toSaveSessionPresetPayload({
      preset: selectedSessionPreset,
      name: nextName,
      description: sessionDescription,
      windowWidth: normalizeOptionalString(sessionWindowWidth),
      windowHeight: normalizeOptionalString(sessionWindowHeight),
      isShuffle: sessionIsShuffle,
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
      const nextSessionPresets = await ipc.session.listPresets();
      const nextSelectedPreset = duplicate
        ? findCreatedPreset(timeStepPresets, nextTimeStepPresets, nextName)
        : (nextTimeStepPresets.find(preset => preset.id === selectedTimeStepPreset?.id) ??
          findCreatedPreset(timeStepPresets, nextTimeStepPresets, nextName) ??
          (nextTimeStepPresets.length > 0 ? nextTimeStepPresets[0] : null));

      setTimeStepPresets(nextTimeStepPresets);
      setSessionPresets(nextSessionPresets);
      setSessionSteps(currentSteps =>
        refreshSessionStepsFromTimeStepPresets(currentSteps, nextTimeStepPresets),
      );
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
      const nextSelectedPreset = nextTimeStepPresets.length > 0 ? nextTimeStepPresets[0] : null;

      setTimeStepPresets(nextTimeStepPresets);
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
                    {formatDurationCompact(getStepDuration(preset))}
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
                        value={step.timeStepPresetId ?? ''}
                        disabled={editorDisabled || timeStepPresetOptions.length === 0}
                        onValueChange={nextValue => {
                          handleSessionStepPresetChange(step.id, nextValue);
                        }}
                      />
                      <span className="session-preset-settings__step-duration">
                        {formatDurationCompact(getStepDuration(step))}
                      </span>
                    </div>
                    <div className="session-preset-settings__step-body">
                      <SessionPresetStepEditor
                        step={step}
                        durationSeconds={getStepDuration(step)}
                        disabled
                        onTimerChange={ignoreStepEditorChange}
                        onAutoAdvanceChange={ignoreStepEditorChange}
                        onRecordsSaveChange={ignoreStepEditorChange}
                        onRequireResultChange={ignoreStepEditorChange}
                        onCaptureChange={ignoreStepEditorChange}
                        onGrayscaleChange={ignoreStepEditorChange}
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
                          Move Up
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={editorDisabled || index === sessionSteps.length - 1}
                          onClick={() => {
                            handleMoveSessionStep(step.id, 1);
                          }}
                        >
                          Move Down
                        </Button>
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
                    <span>Append a saved time step preset to build this session.</span>
                    <Button size="sm" disabled={editorDisabled} onClick={handleAddSessionStep}>
                      Append Time Step
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="session-preset-settings__append-card"
                    disabled={editorDisabled}
                    onClick={handleAddSessionStep}
                  >
                    <span>Append Time Step</span>
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
                    value={sessionWindowHeight}
                    placeholder="180"
                    disabled={editorDisabled}
                    onChange={event => {
                      setSessionWindowHeight(normalizeWindowDimension(event.target.value));
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
                  label="Shuffle entire queue"
                  checked={sessionIsShuffle}
                  disabled={editorDisabled}
                  onCheckedChange={checked => {
                    setSessionIsShuffle(checked);
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
                    ? formatDurationCompact(getStepDuration(editableTimeStep))
                    : 'None'}
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
                        onGrayscaleChange={checked => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            grayscaleEnabled: checked,
                          }));
                        }}
                        onResultSavePathChange={path => {
                          updateEditableTimeStep(currentStep => ({
                            ...currentStep,
                            resultSavePath: normalizeOptionalString(path),
                          }));
                        }}
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
