import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccordionItem,
  AccordionItemBody,
  AccordionItemDragHeader,
  AccordionRoot,
  Button,
  CheckboxRow,
  Icon,
  Input,
  Select,
  type SelectOption,
} from '../../../shared/ui';
import { getErrorMessage } from '../../../shared/lib/error';
import { ipc } from '../../../shared/lib/ipc';
import type { SessionPreset, Tag, TagGroup, TimeStepPreset } from '../../../shared/types';
import {
  AutoTagPicker,
  SessionPresetStepEditor,
  clampDurationSeconds,
  clampFilterPercent,
  findFallbackPreset,
  formatDurationCompact,
  getStepDuration,
  normalizeOptionalString,
  saveStoredTimeStepFilterSettings,
  setStoredActiveSessionPresetId,
  toSaveSessionPresetPayload,
  toSaveTimeStepPresetPayload,
} from '@/entities/session-preset';
import {
  formatAutoTagSummary,
  formatStepCount,
  formatStepOptionSummary,
} from './model/presetSettingsFormat';
import { findCreatedPreset, getDuplicateName } from './model/presetSettingsSelection';
import { useSessionPresetDraft } from './model/useSessionPresetDraft';
import { useTimeStepPresetDraft } from './model/useTimeStepPresetDraft';
import { PresetNavigationPanel } from './ui/PresetNavigationPanel';
import { PresetSettingsFooter } from './ui/PresetSettingsFooter';
import { PresetSettingsMessage } from './ui/PresetSettingsMessage';
import './session-preset-settings.css';

const NEW_SESSION_PRESET_NAME = 'Untitled Preset';
const NEW_TIME_STEP_PRESET_NAME = 'Untitled Time Step';

type EditorMode = 'session' | 'time-step';
const ignoreStepEditorChange = () => {};

export function SessionPresetSettingsView() {
  const { t } = useTranslation('common');
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('session');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const clearStatus = useCallback(() => {
    setStatus(null);
  }, []);
  const sessionDraft = useSessionPresetDraft({
    timeStepPresets,
    onDirty: clearStatus,
    onError: setError,
  });
  const timeStepDraft = useTimeStepPresetDraft({ onDirty: clearStatus });
  const selectedSessionPresetId = sessionDraft.draft.presetId;
  const selectedTimeStepPresetId = timeStepDraft.draft.presetId;
  const sessionName = sessionDraft.draft.name;
  const sessionDescription = sessionDraft.draft.description;
  const sessionWindowWidth = sessionDraft.draft.windowWidth;
  const sessionWindowHeight = sessionDraft.draft.windowHeight;
  const sessionIsShuffle = sessionDraft.draft.isShuffle;
  const sessionAutoTags = sessionDraft.draft.autoTags;
  const sessionSteps = sessionDraft.draft.steps;
  const collapsedSessionStepIds = sessionDraft.draft.collapsedStepIds;
  const expandedSessionStepIds = sessionDraft.expandedStepIds;
  const timeStepName = timeStepDraft.draft.name;
  const editableTimeStep = timeStepDraft.draft.step;

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

  const applySessionPresetToEditor = sessionDraft.applyPreset;
  const applyTimeStepPresetToEditor = timeStepDraft.applyPreset;

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
    setError(null);
    setStatus(null);
    setEditorMode('session');
    sessionDraft.createPreset();
  };

  const handleCreateTimeStepPreset = () => {
    setError(null);
    setStatus(null);
    setEditorMode('time-step');
    timeStepDraft.createPreset();
  };

  const handleAddSessionStep = sessionDraft.addStep;
  const handleDeleteSessionStep = sessionDraft.deleteStep;
  const handleMoveSessionStep = sessionDraft.moveStep;
  const handleSessionStepAccordionValueChange = sessionDraft.setAccordionValue;
  const handleSessionStepReorder = sessionDraft.reorderFromAccordion;
  const handleSessionStepPresetChange = sessionDraft.updateStepPreset;
  const handleSessionAutoTagAdd = sessionDraft.addAutoTag;
  const handleSessionAutoTagRemove = sessionDraft.removeAutoTag;
  const updateEditableTimeStep = timeStepDraft.updateStep;
  const handleEditableTimeStepTagAdd = timeStepDraft.addAutoTag;
  const handleEditableTimeStepTagRemove = timeStepDraft.removeAutoTag;

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
      sessionDraft.refreshStepsFromTimeStepPresets(nextTimeStepPresets);
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
      <PresetNavigationPanel
        loading={loading}
        editorMode={editorMode}
        editorDisabled={editorDisabled}
        sessionPresets={sessionPresets}
        timeStepPresets={timeStepPresets}
        selectedSessionPresetId={selectedSessionPresetId}
        selectedTimeStepPresetId={selectedTimeStepPresetId}
        onCreateSessionPreset={handleCreateSessionPreset}
        onSessionPresetSelect={handleSessionPresetSelect}
        onCreateTimeStepPreset={handleCreateTimeStepPreset}
        onTimeStepPresetSelect={handleTimeStepPresetSelect}
      />

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
                    sessionDraft.setName(event.target.value);
                  }}
                />
                <label className="session-preset-settings__textarea-field">
                  <span>{t('common.description', { defaultValue: 'Description' })}</span>
                  <textarea
                    value={sessionDescription}
                    disabled={editorDisabled}
                    className="session-preset-settings__textarea"
                    onChange={event => {
                      sessionDraft.setDescription(event.target.value);
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
                      sessionDraft.setWindowHeight(event.target.value);
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
                      sessionDraft.setWindowWidth(event.target.value);
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
                    sessionDraft.setShuffle(checked);
                  }}
                />
              </section>

              <PresetSettingsMessage error={error} status={status} />
            </main>

            <PresetSettingsFooter
              mode="session"
              busy={busy}
              canSaveSession={canSaveSession}
              canDuplicateSession={canDuplicateSession}
              canSaveTimeStep={canSaveTimeStep}
              canDuplicateTimeStep={canDuplicateTimeStep}
              canDeleteTimeStep={canDeleteTimeStep}
              onSaveSession={() => {
                void persistSessionPreset(false);
              }}
              onDuplicateSession={() => {
                void persistSessionPreset(true);
              }}
              onSaveTimeStep={() => {
                void persistTimeStepPreset(false);
              }}
              onDuplicateTimeStep={() => {
                void persistTimeStepPreset(true);
              }}
              onDeleteTimeStep={() => {
                void deleteTimeStepPreset();
              }}
            />
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
                    timeStepDraft.setName(event.target.value);
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

              <PresetSettingsMessage error={error} status={status} />
            </main>

            <PresetSettingsFooter
              mode="time-step"
              busy={busy}
              canSaveSession={canSaveSession}
              canDuplicateSession={canDuplicateSession}
              canSaveTimeStep={canSaveTimeStep}
              canDuplicateTimeStep={canDuplicateTimeStep}
              canDeleteTimeStep={canDeleteTimeStep}
              onSaveSession={() => {
                void persistSessionPreset(false);
              }}
              onDuplicateSession={() => {
                void persistSessionPreset(true);
              }}
              onSaveTimeStep={() => {
                void persistTimeStepPreset(false);
              }}
              onDuplicateTimeStep={() => {
                void persistTimeStepPreset(true);
              }}
              onDeleteTimeStep={() => {
                void deleteTimeStepPreset();
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
