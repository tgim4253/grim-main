import { useEffect, useMemo, useState } from 'react';
import {
  AccordionItem,
  AccordionItemBody,
  AccordionItemHeader,
  AccordionRoot,
  Button,
  CheckboxRow,
  Icon,
  IconButton,
  Input,
  Modal,
  ModalFooter,
  Select,
  type SelectOption,
} from '../../../shared/ui';
import type {
  CroquisOption,
  CroquisPreferences,
  CroquisStartPayload,
  LibrarySettings,
  SessionPreset,
  TimeStepPreset,
} from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import { buildPreferences, cloneOption, findFallbackPreset } from '../lib/startModal';
import {
  USER_CUSTOM_STEP_LABEL,
  USER_CUSTOM_STEP_VALUE,
  applyTimeStepPresetToStep,
  clampDurationSeconds,
  createCustomStep,
  createEditableSteps,
  formatDurationCompact,
  formatEstimate,
  getStepDuration,
  normalizeStepOrders,
  normalizeWindowDimension,
  toSessionStep,
  type EditableSessionStep,
} from '../lib/sessionPresetEditor';
import { SessionPresetStepEditor } from './SessionPresetStepEditor';
import './croquis.css';

type CroquisStartModalProps = {
  open: boolean;
  assetIds: string[];
  sessionPresets: SessionPreset[];
  timeStepPresets?: TimeStepPreset[];
  librarySettings: LibrarySettings;
  onClose: () => void;
  onStarted: () => Promise<void> | void;
  saveCroquisPreferences?: (preferences: CroquisPreferences) => Promise<unknown>;
  startCroquisSession?: (payload: CroquisStartPayload) => Promise<unknown>;
};

export function CroquisStartModal({
  open,
  assetIds,
  sessionPresets,
  timeStepPresets = [],
  librarySettings,
  onClose,
  onStarted,
  saveCroquisPreferences = ipc.library.saveCroquisPreferences,
  startCroquisSession = ipc.session.start,
}: CroquisStartModalProps) {
  const presetOptions: SelectOption[] = useMemo(
    () =>
      sessionPresets.map(preset => ({
        value: preset.id,
        label: preset.name,
      })),
    [sessionPresets],
  );

  const fallbackPreset: SessionPreset | null = useMemo(() => {
    return findFallbackPreset(sessionPresets, librarySettings);
  }, [librarySettings.activeSessionPresetId, sessionPresets]);

  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [option, setOption] = useState<CroquisOption>(cloneOption());
  const [rememberOption, setRememberOption] = useState(true);
  const [editableSteps, setEditableSteps] = useState<EditableSessionStep[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepPresetOptions: SelectOption[] = useMemo(
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

  useEffect(() => {
    if (!open) {
      return;
    }

    const storedPreferences = librarySettings.croquisPreferences;
    const activeOption =
      storedPreferences?.presets.find(preset => preset.id === storedPreferences.activePresetId)
        ?.option ??
      storedPreferences?.presets[0]?.option ??
      null;

    setOption(cloneOption(activeOption));
    setRememberOption(true);
    setSelectedPresetId(fallbackPreset?.id ?? '');
    const nextSteps = fallbackPreset ? createEditableSteps(fallbackPreset) : [];
    setEditableSteps(nextSteps);
    setExpandedStepId(nextSteps[0]?.id ?? null);
    setError(null);
  }, [fallbackPreset, librarySettings.croquisPreferences, open]);

  if (!open) {
    return null;
  }

  const baseSelectedPreset =
    sessionPresets.find(preset => preset.id === selectedPresetId) || fallbackPreset;
  const selectedPreset =
    baseSelectedPreset === null
      ? null
      : {
          ...baseSelectedPreset,
          steps: editableSteps.map(toSessionStep),
        };
  const selectedPresetSteps = selectedPreset?.steps ?? [];
  const hasOpenEndedStep = selectedPresetSteps.some(
    step => getStepDuration(step, option.timer.maxTime) <= 0,
  );
  const totalDurationSeconds =
    assetIds.length *
    selectedPresetSteps.reduce(
      (total, step) => total + getStepDuration(step, option.timer.maxTime),
      0,
    );
  const totalDurationLabel = hasOpenEndedStep ? '∞' : formatEstimate(totalDurationSeconds);
  const totalAssetsLabel = `${String(assetIds.length)} ${assetIds.length === 1 ? 'Pose' : 'Poses'}`;

  const handlePresetChange = (nextPresetId: string) => {
    const nextPreset = sessionPresets.find(preset => preset.id === nextPresetId) ?? null;
    const nextSteps = nextPreset ? createEditableSteps(nextPreset) : [];

    setSelectedPresetId(nextPresetId);
    setEditableSteps(nextSteps);
    setExpandedStepId(nextSteps[0]?.id ?? null);
  };

  const handleAddStep = () => {
    const nextStep = createCustomStep(option.timer.maxTime, editableSteps.length + 1);

    setEditableSteps(current => normalizeStepOrders([...current, nextStep]));
    setExpandedStepId(nextStep.id);
  };

  const handleDeleteStep = (stepId: string) => {
    setEditableSteps(current => {
      const deletedIndex = current.findIndex(step => step.id === stepId);
      const nextSteps = normalizeStepOrders(current.filter(step => step.id !== stepId));

      setExpandedStepId(currentExpandedStepId => {
        if (currentExpandedStepId && nextSteps.some(step => step.id === currentExpandedStepId)) {
          return currentExpandedStepId;
        }

        if (nextSteps.length === 0) {
          return null;
        }

        return nextSteps[Math.min(Math.max(0, deletedIndex - 1), nextSteps.length - 1)].id;
      });

      return nextSteps;
    });
  };

  const handleStepPresetChange = (stepId: string, nextValue: string) => {
    setEditableSteps(current =>
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
  };

  const updateStep = (
    stepId: string,
    updater: (step: EditableSessionStep) => EditableSessionStep,
  ) => {
    setEditableSteps(current =>
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
  };

  const handleStart = async () => {
    if (selectedPreset === null) {
      return;
    }

    if (assetIds.length === 0) {
      setError('Select at least one asset to start a Croquis session.');
      return;
    }

    if (selectedPresetSteps.length === 0) {
      setError('Add at least one time step to start a Croquis session.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const preferencesPayload = rememberOption ? buildPreferences(option) : null;
      if (preferencesPayload) {
        await saveCroquisPreferences(preferencesPayload);
      }

      await startCroquisSession({
        assetIds,
        preset: selectedPreset,
        option,
        saveOption: rememberOption,
        preferences: preferencesPayload,
      });

      await onStarted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start croquis session');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      title="Start Croquis Session"
      onClose={onClose}
      dialogClassName="croquis-start-modal"
      bodyClassName="croquis-start-modal__body"
      footer={
        <ModalFooter
          alignment="end"
          leading={
            <CheckboxRow
              label="Remember session configuration"
              checked={rememberOption}
              onCheckedChange={setRememberOption}
            />
          }
        >
          <Button size="lg" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={
              busy ||
              selectedPreset === null ||
              assetIds.length === 0 ||
              selectedPresetSteps.length === 0
            }
            onClick={() => {
              void handleStart();
            }}
          >
            {busy ? 'Starting...' : 'Start Session'}
          </Button>
        </ModalFooter>
      }
    >
      <div className="croquis-start-modal__intro">
        <div className="app-kicker">Preset Configuration</div>
        <p>Review and launch the selected training protocol.</p>
      </div>

      <Select
        label="Selected Preset"
        placeholder="Select session preset"
        options={presetOptions}
        value={selectedPresetId}
        onValueChange={handlePresetChange}
      />

      <div className="croquis-start-modal__pipeline">
        <div className="croquis-start-modal__pipeline-header">
          <span>Time Steps Pipeline</span>
          <span className="croquis-start-modal__pipeline-actions">
            <span>{String(selectedPresetSteps.length)} Steps Total</span>
            <IconButton
              icon="plus"
              size="md"
              aria-label="Add time step"
              disabled={busy || selectedPreset === null}
              onClick={handleAddStep}
            />
          </span>
        </div>

        {editableSteps.length > 0 ? (
          <AccordionRoot
            key={selectedPreset?.id ?? 'empty-preset'}
            type="single"
            collapsible
            value={expandedStepId}
            onValueChange={value => {
              setExpandedStepId(typeof value === 'string' ? value : null);
            }}
            className="croquis-start-modal__accordion"
          >
            {editableSteps.map((step, index) => (
              <AccordionItem key={step.id} value={step.id}>
                <AccordionItemHeader
                  index={String(index + 1).padStart(2, '0')}
                  meta={formatDurationCompact(getStepDuration(step, option.timer.maxTime))}
                >
                  {step.name}
                </AccordionItemHeader>
                <AccordionItemBody className="croquis-start-modal__step-panel">
                  <Select
                    aria-label={`${step.name} source preset`}
                    options={stepPresetOptions}
                    value={step.timeStepPresetId ?? USER_CUSTOM_STEP_VALUE}
                    onValueChange={nextValue => {
                      handleStepPresetChange(step.id, nextValue);
                    }}
                  />
                  <SessionPresetStepEditor
                    step={step}
                    option={option}
                    durationSeconds={getStepDuration(step, option.timer.maxTime)}
                    disabled={busy}
                    onTimerChange={seconds => {
                      const nextSeconds = clampDurationSeconds(seconds);
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        defaultDurationSeconds: nextSeconds,
                      }));
                    }}
                    onAutoSkipChange={checked => {
                      setOption(current => ({
                        ...current,
                        auto: { isSkip: checked },
                      }));
                    }}
                    onRecordsSaveChange={checked => {
                      setOption(current => ({
                        ...current,
                        isRecordSave: checked,
                        isCapture: checked ? current.isCapture : false,
                      }));
                    }}
                    onRequireResultChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        resultRequired: checked,
                      }));
                    }}
                    onCaptureChange={checked => {
                      setOption(current => ({
                        ...current,
                        isCapture: checked,
                      }));
                    }}
                  />
                  <div className="croquis-start-modal__step-actions">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        handleDeleteStep(step.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </AccordionItemBody>
              </AccordionItem>
            ))}
          </AccordionRoot>
        ) : (
          <div className="croquis-start-modal__pipeline-empty">
            Add a user custom time step to build this session.
          </div>
        )}
      </div>

      <div className="croquis-start-modal__summary" aria-label="Croquis session summary">
        <div className="croquis-start-modal__summary-card">
          <Icon name="reload" size="md" color="brand" hierarchy="primary" aria-hidden />
          <div>
            <span>Total Estimate</span>
            <strong>{totalDurationLabel}</strong>
          </div>
        </div>
        <div className="croquis-start-modal__summary-card">
          <Icon name="view-list" size="md" color="brand" hierarchy="primary" aria-hidden />
          <div>
            <span>Total Assets</span>
            <strong>{totalAssetsLabel}</strong>
          </div>
        </div>
      </div>

      <div className="croquis-start-modal__window-grid">
        <Input
          label="Window height"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          pattern="[0-9]*"
          value={option.window.height ?? ''}
          placeholder="180"
          onChange={event => {
            const height = normalizeWindowDimension(event.target.value);
            setOption(current => ({
              ...current,
              window: {
                ...current.window,
                height,
              },
            }));
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
          onChange={event => {
            const width = normalizeWindowDimension(event.target.value);
            setOption(current => ({
              ...current,
              window: {
                ...current.window,
                width,
              },
            }));
          }}
        />
      </div>

      <CheckboxRow
        label="Shuffle entire queue"
        checked={option.isShuffle}
        onCheckedChange={checked => {
          setOption(current => ({
            ...current,
            isShuffle: checked,
          }));
        }}
      />

      {error ? <div className="croquis-inline-error">{error}</div> : null}
    </Modal>
  );
}
