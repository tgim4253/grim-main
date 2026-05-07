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
  CroquisStartPayload,
  SessionPreset,
  Tag,
  TagGroup,
  TimeStepPreset,
} from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import { findFallbackPreset, setStoredActiveSessionPresetId } from '../lib/startModal';
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
  normalizeOptionalString,
  normalizeStepOrders,
  normalizeWindowDimension,
  toCroquisRuntimeStep,
  type EditableSessionStep,
} from '../lib/sessionPresetEditor';
import { AutoTagPicker } from './AutoTagPicker';
import { SessionPresetStepEditor } from './SessionPresetStepEditor';
import './croquis.css';

type CroquisStartModalProps = {
  open: boolean;
  assetIds: string[];
  sessionPresets: SessionPreset[];
  timeStepPresets?: TimeStepPreset[];
  tags?: Tag[];
  tagGroups?: TagGroup[];
  onClose: () => void;
  onStarted: () => Promise<void> | void;
  startCroquisSession?: (payload: CroquisStartPayload) => Promise<unknown>;
};

export function CroquisStartModal({
  open,
  assetIds,
  sessionPresets,
  timeStepPresets = [],
  tags = [],
  tagGroups = [],
  onClose,
  onStarted,
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
    return findFallbackPreset(sessionPresets);
  }, [sessionPresets]);

  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [windowWidth, setWindowWidth] = useState('');
  const [windowHeight, setWindowHeight] = useState('');
  const [isShuffle, setIsShuffle] = useState(false);
  const [sessionAutoTags, setSessionAutoTags] = useState<Tag[]>([]);
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
        supportingText: formatDurationCompact(getStepDuration(preset)),
      })),
    ],
    [timeStepPresets],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPresetId(fallbackPreset?.id ?? '');
    setWindowWidth(fallbackPreset?.windowWidth ?? '960');
    setWindowHeight(fallbackPreset?.windowHeight ?? '');
    setIsShuffle(fallbackPreset?.isShuffle ?? false);
    setSessionAutoTags(fallbackPreset?.autoTags ?? []);
    const nextSteps = fallbackPreset ? createEditableSteps(fallbackPreset) : [];
    setEditableSteps(nextSteps);
    setExpandedStepId(nextSteps[0]?.id ?? null);
    setError(null);
  }, [fallbackPreset, open]);

  if (!open) {
    return null;
  }

  const baseSelectedPreset =
    sessionPresets.find(preset => preset.id === selectedPresetId) || fallbackPreset;
  const selectedPreset = baseSelectedPreset;
  const hasOpenEndedStep = editableSteps.some(step => getStepDuration(step) <= 0);
  const totalDurationSeconds =
    assetIds.length * editableSteps.reduce((total, step) => total + getStepDuration(step), 0);
  const totalDurationLabel = hasOpenEndedStep ? '∞' : formatEstimate(totalDurationSeconds);
  const totalAssetsLabel = `${String(assetIds.length)} ${assetIds.length === 1 ? 'Pose' : 'Poses'}`;

  const handlePresetChange = (nextPresetId: string) => {
    const nextPreset = sessionPresets.find(preset => preset.id === nextPresetId) ?? null;
    const nextSteps = nextPreset ? createEditableSteps(nextPreset) : [];

    setSelectedPresetId(nextPresetId);
    setStoredActiveSessionPresetId(nextPreset?.id ?? null);
    setWindowWidth(nextPreset?.windowWidth ?? '960');
    setWindowHeight(nextPreset?.windowHeight ?? '');
    setIsShuffle(nextPreset?.isShuffle ?? false);
    setSessionAutoTags(nextPreset?.autoTags ?? []);
    setEditableSteps(nextSteps);
    setExpandedStepId(nextSteps[0]?.id ?? null);
  };

  const handleAddStep = () => {
    const nextStep = createCustomStep(editableSteps.length + 1);

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

  const handleStepAutoTagAdd = (stepId: string, tag: Tag) => {
    updateStep(stepId, currentStep => {
      if (currentStep.autoTags.some(autoTag => autoTag.id === tag.id)) {
        return currentStep;
      }

      return {
        ...currentStep,
        autoTags: [...currentStep.autoTags, tag],
      };
    });
  };

  const handleStepAutoTagRemove = (stepId: string, tagId: string) => {
    updateStep(stepId, currentStep => ({
      ...currentStep,
      autoTags: currentStep.autoTags.filter(tag => tag.id !== tagId),
    }));
  };

  const handleSessionAutoTagAdd = (tag: Tag) => {
    setSessionAutoTags(current => {
      if (current.some(autoTag => autoTag.id === tag.id)) {
        return current;
      }

      return [...current, tag];
    });
  };

  const handleSessionAutoTagRemove = (tagId: string) => {
    setSessionAutoTags(current => current.filter(tag => tag.id !== tagId));
  };

  const handleStart = async () => {
    if (selectedPreset === null) {
      return;
    }

    if (assetIds.length === 0) {
      setError('Select at least one asset to start a Croquis session.');
      return;
    }

    if (editableSteps.length === 0) {
      setError('Add at least one time step to start a Croquis session.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setStoredActiveSessionPresetId(selectedPreset.id);
      await startCroquisSession({
        assetIds,
        presetId: selectedPreset.id,
        presetName: selectedPreset.name,
        windowWidth: normalizeOptionalString(windowWidth),
        windowHeight: normalizeOptionalString(windowHeight),
        isShuffle,
        steps: editableSteps.map(step => toCroquisRuntimeStep(step, sessionAutoTags)),
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
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={
              busy || selectedPreset === null || assetIds.length === 0 || editableSteps.length === 0
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

      <AutoTagPicker
        label="Session Auto Tags"
        tags={sessionAutoTags}
        availableTags={tags}
        tagGroups={tagGroups}
        disabled={busy}
        emptyLabel="No session auto tags"
        onTagAdd={handleSessionAutoTagAdd}
        onTagRemove={handleSessionAutoTagRemove}
      />

      <div className="croquis-start-modal__pipeline">
        <div className="croquis-start-modal__pipeline-header">
          <span>Time Steps Pipeline</span>
          <span className="croquis-start-modal__pipeline-actions">
            <span>{String(editableSteps.length)} Steps Total</span>
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
                  meta={formatDurationCompact(getStepDuration(step))}
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
                    durationSeconds={getStepDuration(step)}
                    disabled={busy}
                    availableAutoTags={tags}
                    autoTagGroups={tagGroups}
                    onTimerChange={seconds => {
                      const nextSeconds = clampDurationSeconds(seconds);
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        defaultDurationSeconds: nextSeconds,
                      }));
                    }}
                    onAutoAdvanceChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        autoAdvance: checked,
                      }));
                    }}
                    onRecordsSaveChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        recordSaveEnabled: checked,
                        captureEnabled: checked ? currentStep.captureEnabled : false,
                      }));
                    }}
                    onRequireResultChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        resultRequired: checked,
                      }));
                    }}
                    onCaptureChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        captureEnabled: checked,
                      }));
                    }}
                    onGrayscaleChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        grayscaleEnabled: checked,
                      }));
                    }}
                    onResultSavePathChange={path => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        resultSavePath: normalizeOptionalString(path),
                      }));
                    }}
                    onAutoTagAdd={tag => {
                      handleStepAutoTagAdd(step.id, tag);
                    }}
                    onAutoTagRemove={tagId => {
                      handleStepAutoTagRemove(step.id, tagId);
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
          value={windowHeight}
          placeholder="180"
          onChange={event => {
            setWindowHeight(normalizeWindowDimension(event.target.value));
          }}
        />

        <Input
          label="Window width"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          pattern="[0-9]*"
          value={windowWidth}
          placeholder="1080"
          onChange={event => {
            setWindowWidth(normalizeWindowDimension(event.target.value));
          }}
        />
      </div>

      <CheckboxRow
        label="Shuffle entire queue"
        checked={isShuffle}
        onCheckedChange={setIsShuffle}
      />

      {error ? <div className="croquis-inline-error">{error}</div> : null}
    </Modal>
  );
}
