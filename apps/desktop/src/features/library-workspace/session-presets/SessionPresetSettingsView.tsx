import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelectOption } from '../../../shared/ui';
import type { SessionPreset, Tag, TagGroup, TimeStepPreset } from '../../../shared/types';
import {
  formatDurationCompact,
  getStepDuration,
  setStoredActiveSessionPresetId,
} from '@/entities/session-preset';
import type { EditorMode } from './model/types';
import { usePresetPersistence } from './model/usePresetPersistence';
import { usePresetSettingsData } from './model/usePresetSettingsData';
import { useSessionPresetDraft } from './model/useSessionPresetDraft';
import { useTimeStepPresetDraft } from './model/useTimeStepPresetDraft';
import { PresetNavigationPanel } from './ui/PresetNavigationPanel';
import { PresetSettingsFooter } from './ui/PresetSettingsFooter';
import { SessionPresetEditorPanel } from './ui/SessionPresetEditorPanel';
import { TimeStepPresetEditorPanel } from './ui/TimeStepPresetEditorPanel';
import './session-preset-settings.css';

export function SessionPresetSettingsView() {
  const { t } = useTranslation('common');
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('session');
  const [loading, setLoading] = useState(true);
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
  const applySessionPresetToEditor = sessionDraft.applyPreset;
  const applyTimeStepPresetToEditor = timeStepDraft.applyPreset;

  usePresetSettingsData({
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
  });

  const selectedSessionPresetId = sessionDraft.draft.presetId;
  const selectedTimeStepPresetId = timeStepDraft.draft.presetId;
  const selectedSessionPreset = useMemo(
    () => sessionPresets.find(preset => preset.id === selectedSessionPresetId) ?? null,
    [sessionPresets, selectedSessionPresetId],
  );
  const selectedTimeStepPreset = useMemo(
    () => timeStepPresets.find(preset => preset.id === selectedTimeStepPresetId) ?? null,
    [timeStepPresets, selectedTimeStepPresetId],
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
  const { busy, persistSessionPreset, persistTimeStepPreset, deleteTimeStepPreset } =
    usePresetPersistence({
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
    });
  const editorDisabled = loading || busy;
  const sessionName = sessionDraft.draft.name;
  const sessionSteps = sessionDraft.draft.steps;
  const timeStepName = timeStepDraft.draft.name;
  const editableTimeStep = timeStepDraft.draft.step;
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
          <SessionPresetEditorPanel
            editorDisabled={editorDisabled}
            error={error}
            status={status}
            sessionName={sessionDraft.draft.name}
            sessionDescription={sessionDraft.draft.description}
            sessionWindowWidth={sessionDraft.draft.windowWidth}
            sessionWindowHeight={sessionDraft.draft.windowHeight}
            sessionIsShuffle={sessionDraft.draft.isShuffle}
            sessionAutoTags={sessionDraft.draft.autoTags}
            sessionSteps={sessionDraft.draft.steps}
            collapsedSessionStepIds={sessionDraft.draft.collapsedStepIds}
            expandedSessionStepIds={sessionDraft.expandedStepIds}
            tags={tags}
            tagGroups={tagGroups}
            timeStepPresetOptions={timeStepPresetOptions}
            onSessionNameChange={sessionDraft.setName}
            onSessionDescriptionChange={sessionDraft.setDescription}
            onSessionWindowWidthChange={sessionDraft.setWindowWidth}
            onSessionWindowHeightChange={sessionDraft.setWindowHeight}
            onSessionShuffleChange={sessionDraft.setShuffle}
            onSessionAutoTagAdd={sessionDraft.addAutoTag}
            onSessionAutoTagRemove={sessionDraft.removeAutoTag}
            onStepAdd={sessionDraft.addStep}
            onStepDelete={sessionDraft.deleteStep}
            onStepMove={sessionDraft.moveStep}
            onStepAccordionValueChange={sessionDraft.setAccordionValue}
            onStepReorder={sessionDraft.reorderFromAccordion}
            onStepPresetChange={sessionDraft.updateStepPreset}
          />
        ) : (
          <TimeStepPresetEditorPanel
            editorDisabled={editorDisabled}
            error={error}
            status={status}
            timeStepName={timeStepDraft.draft.name}
            editableTimeStep={timeStepDraft.draft.step}
            tags={tags}
            tagGroups={tagGroups}
            onTimeStepNameChange={timeStepDraft.setName}
            onTimeStepUpdate={timeStepDraft.updateStep}
            onAutoTagAdd={timeStepDraft.addAutoTag}
            onAutoTagRemove={timeStepDraft.removeAutoTag}
            onCreateTimeStepPreset={handleCreateTimeStepPreset}
          />
        )}

        <PresetSettingsFooter
          mode={editorMode}
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
      </div>
    </section>
  );
}
