import { useCallback, useMemo, useState, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeybindings } from '@/shared/hooks';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { SelectOption } from '../../../shared/ui';
import type { SessionPreset, Tag, TagGroup, TimeStepPreset } from '../../../shared/types';
import {
  findFallbackPreset,
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

type SessionPresetSettingsViewProps = {
  modalOpen?: boolean;
};

export function SessionPresetSettingsView({ modalOpen = false }: SessionPresetSettingsViewProps) {
  const { t } = useTranslation('common');
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('session');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [presetNameEditing, setPresetNameEditing] = useState(false);
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

  const handleSavePreset = useCallback(() => {
    if (editorMode === 'session') {
      void persistSessionPreset(false);
      return;
    }

    void persistTimeStepPreset(false);
  }, [editorMode, persistSessionPreset, persistTimeStepPreset]);

  const handleDeletePreset = useCallback(() => {
    if (editorMode === 'time-step') {
      void deleteTimeStepPreset();
      return;
    }

    if (!selectedSessionPreset) {
      return;
    }

    const confirmed = window.confirm(
      t('presets.confirm_delete_session_preset', {
        presetName: selectedSessionPreset.name,
        defaultValue: 'Delete this session preset?',
      }),
    );

    if (!confirmed) {
      return;
    }

    void (async () => {
      setError(null);
      setStatus(null);

      try {
        const nextSessionPresets = await ipc.session.deletePreset({
          presetId: selectedSessionPreset.id,
        });
        const nextSelectedPreset = findFallbackPreset(nextSessionPresets);

        setSessionPresets(nextSessionPresets);
        applySessionPresetToEditor(nextSelectedPreset);
        setStoredActiveSessionPresetId(nextSelectedPreset?.id ?? null);
        setEditorMode('session');
        setStatus(t('presets.status.session_deleted', { defaultValue: 'Session preset deleted.' }));
      } catch (nextError) {
        setError(
          getErrorMessage(
            nextError,
            t('presets.error.delete_session', {
              defaultValue: 'Failed to delete session preset.',
            }),
          ),
        );
      }
    })();
  }, [applySessionPresetToEditor, deleteTimeStepPreset, editorMode, selectedSessionPreset, t]);

  const handleFocusPresetName = useCallback(() => {
    document
      .querySelector<HTMLInputElement>(
        '.session-preset-settings [data-shortcut-target="preset-name"]',
      )
      ?.focus();
  }, []);
  const handleCancelPresetEdit = useCallback(() => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.closest('.session-preset-settings [data-shortcut-target="preset-name"]')
    ) {
      activeElement.blur();
    }
  }, []);
  const handleCommitPresetEdit = useCallback(() => {
    if (editorMode === 'session' ? canSaveSession : canSaveTimeStep) {
      handleSavePreset();
    }

    handleCancelPresetEdit();
  }, [canSaveSession, canSaveTimeStep, editorMode, handleCancelPresetEdit, handleSavePreset]);
  const handlePresetSettingsFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement) {
      setPresetNameEditing(Boolean(event.target.closest('[data-shortcut-target="preset-name"]')));
    }
  }, []);
  const handlePresetSettingsBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    const nextFocusedElement = event.relatedTarget;
    setPresetNameEditing(
      nextFocusedElement instanceof HTMLElement &&
        Boolean(nextFocusedElement.closest('[data-shortcut-target="preset-name"]')),
    );
  }, []);

  useKeybindings({
    context: {
      dirty: editorMode === 'session' ? canSaveSession : canSaveTimeStep,
      editing: presetNameEditing,
      editorFocus: true,
      inputFocus: false,
      itemSelected:
        editorMode === 'session' ? Boolean(sessionDraft.draft.name) : Boolean(timeStepName),
      libraryPage: true,
      modalOpen,
      presetSettingsView: true,
    },
    enabled: !modalOpen,
    handlers: {
      'grim.presets.cancelEdit': handleCancelPresetEdit,
      'grim.presets.commitEdit': handleCommitPresetEdit,
      'grim.presets.delete': handleDeletePreset,
      'grim.presets.rename': handleFocusPresetName,
      'grim.presets.save': handleSavePreset,
      'grim.presets.session.new': handleCreateSessionPreset,
      'grim.presets.step.add': () => {
        if (editorMode === 'session') {
          sessionDraft.addStep();
        }
      },
      'grim.presets.timeStep.new': handleCreateTimeStepPreset,
    },
  });

  return (
    <section
      className="session-preset-settings"
      aria-label={t('presets.settings.title', { defaultValue: 'Preset Settings' })}
      onBlurCapture={handlePresetSettingsBlur}
      onFocusCapture={handlePresetSettingsFocus}
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
