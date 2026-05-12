import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccordionItem,
  AccordionItemBody,
  AccordionItemDragHeader,
  AccordionRoot,
  Button,
  CheckboxRow,
  Icon,
  IconButton,
  Input,
  Modal,
  ModalFooter,
  Select,
  type AccordionReorderPayload,
  type AccordionReorderPosition,
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
  clampFilterPercent,
  createCustomStep,
  createEditableSteps,
  formatDurationCompact,
  formatEstimate,
  getStepDuration,
  normalizeOptionalString,
  normalizeStepOrders,
  normalizeWindowDimension,
  saveRuntimeSessionFilterSettings,
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
  const { t } = useTranslation('common');
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
        label: t('croquis.user_custom_step', {
          defaultValue: USER_CUSTOM_STEP_LABEL,
        }),
      },
      ...timeStepPresets.map(preset => ({
        value: preset.id,
        label: preset.name,
        supportingText: formatDurationCompact(getStepDuration(preset)),
      })),
    ],
    [t, timeStepPresets],
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
    setExpandedStepId(null);
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
  const totalAssetsLabel = t('croquis.pose_count', {
    count: assetIds.length,
    formattedCount: assetIds.length.toLocaleString(),
    defaultValue: '{{formattedCount}} Poses',
  });

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
    setExpandedStepId(null);
  };

  const handleAddStep = () => {
    const nextStep = createCustomStep(
      editableSteps.length + 1,
      t('croquis.user_custom_step', { defaultValue: USER_CUSTOM_STEP_LABEL }),
    );

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

  const reorderStep = (
    sourceStepId: string,
    targetStepId: string,
    position: AccordionReorderPosition,
  ) => {
    setEditableSteps(current => {
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
  };

  const handleStepReorder = ({ value, targetValue, position }: AccordionReorderPayload) => {
    reorderStep(value, targetValue, position);
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
      setError(
        t('croquis.error.select_asset', {
          defaultValue: 'Select at least one asset to start a Croquis session.',
        }),
      );
      return;
    }

    if (editableSteps.length === 0) {
      setError(
        t('croquis.error.add_time_step', {
          defaultValue: 'Add at least one time step to start a Croquis session.',
        }),
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setStoredActiveSessionPresetId(selectedPreset.id);
      saveRuntimeSessionFilterSettings(selectedPreset.id, editableSteps);
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
      setError(
        nextError instanceof Error
          ? nextError.message
          : t('croquis.error.start_session', { defaultValue: 'Failed to start croquis session' }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      title={t('croquis.start_modal.title', { defaultValue: 'Start Croquis Session' })}
      onClose={onClose}
      dialogClassName="croquis-start-modal"
      bodyClassName="croquis-start-modal__body"
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
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
            {busy
              ? t('croquis.starting', { defaultValue: 'Starting...' })
              : t('croquis.start_session', { defaultValue: 'Start Session' })}
          </Button>
        </ModalFooter>
      }
    >
      <div className="croquis-start-modal__intro">
        <div className="app-kicker">
          {t('croquis.preset_configuration', { defaultValue: 'Preset Configuration' })}
        </div>
        <p>
          {t('croquis.start_modal.description', {
            defaultValue: 'Review and launch the selected training protocol.',
          })}
        </p>
      </div>

      <Select
        label={t('croquis.selected_preset', { defaultValue: 'Selected Preset' })}
        placeholder={t('croquis.select_session_preset', {
          defaultValue: 'Select session preset',
        })}
        options={presetOptions}
        value={selectedPresetId}
        onValueChange={handlePresetChange}
      />

      <AutoTagPicker
        label={t('croquis.session_auto_tags', { defaultValue: 'Session Auto Tags' })}
        tags={sessionAutoTags}
        availableTags={tags}
        tagGroups={tagGroups}
        disabled={busy}
        emptyLabel={t('croquis.session_auto_tags.empty', {
          defaultValue: 'No session auto tags',
        })}
        onTagAdd={handleSessionAutoTagAdd}
        onTagRemove={handleSessionAutoTagRemove}
      />

      <div className="croquis-start-modal__pipeline">
        <div className="croquis-start-modal__pipeline-header">
          <span>{t('croquis.time_steps_pipeline', { defaultValue: 'Time Steps Pipeline' })}</span>
          <span className="croquis-start-modal__pipeline-actions">
            <span>
              {t('croquis.steps_total', {
                count: editableSteps.length,
                formattedCount: editableSteps.length.toLocaleString(),
                defaultValue: '{{formattedCount}} Steps Total',
              })}
            </span>
            <IconButton
              icon="plus"
              size="md"
              aria-label={t('croquis.add_time_step', { defaultValue: 'Add time step' })}
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
            reorderable={!busy && editableSteps.length > 0}
            onItemReorder={handleStepReorder}
            className="croquis-start-modal__accordion"
          >
            {editableSteps.map((step, index) => (
              <AccordionItem key={step.id} value={step.id} disabled={busy}>
                <AccordionItemDragHeader
                  className="croquis-start-modal__step-header"
                  disclosureLabel={`${expandedStepId === step.id ? 'Collapse' : 'Expand'} step ${String(
                    index + 1,
                  )}`}
                  dragLabel={`Drag step ${String(index + 1)} to reorder`}
                >
                  <span className="croquis-start-modal__step-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="croquis-start-modal__step-title">{step.name}</span>
                  <span className="croquis-start-modal__step-duration">
                    {formatDurationCompact(getStepDuration(step))}
                  </span>
                </AccordionItemDragHeader>
                <AccordionItemBody className="croquis-start-modal__step-panel">
                  <Select
                    aria-label={t('croquis.step_source_preset', {
                      step: step.name,
                      defaultValue: '{{step}} source preset',
                    })}
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
                    onFilterChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        filterEnabled: checked,
                      }));
                    }}
                    onGrayscaleChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        grayscaleEnabled: checked,
                      }));
                    }}
                    onBlurChange={checked => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        blurEnabled: checked,
                      }));
                    }}
                    onBlurAmountChange={value => {
                      updateStep(step.id, currentStep => ({
                        ...currentStep,
                        blurAmount: clampFilterPercent(value),
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
                      {t('common.delete', { defaultValue: 'Delete' })}
                    </Button>
                  </div>
                </AccordionItemBody>
              </AccordionItem>
            ))}
          </AccordionRoot>
        ) : (
          <div className="croquis-start-modal__pipeline-empty">
            {t('croquis.empty_pipeline', {
              defaultValue: 'Add a user custom time step to build this session.',
            })}
          </div>
        )}
      </div>

      <div
        className="croquis-start-modal__summary"
        aria-label={t('croquis.session_summary', { defaultValue: 'Croquis session summary' })}
      >
        <div className="croquis-start-modal__summary-card">
          <Icon name="reload" size="md" color="brand" hierarchy="primary" aria-hidden />
          <div>
            <span>{t('croquis.total_estimate', { defaultValue: 'Total Estimate' })}</span>
            <strong>{totalDurationLabel}</strong>
          </div>
        </div>
        <div className="croquis-start-modal__summary-card">
          <Icon name="view-list" size="md" color="brand" hierarchy="primary" aria-hidden />
          <div>
            <span>{t('croquis.total_assets', { defaultValue: 'Total Assets' })}</span>
            <strong>{totalAssetsLabel}</strong>
          </div>
        </div>
      </div>

      <div className="croquis-start-modal__window-grid">
        <Input
          label={t('croquis.window_height', { defaultValue: 'Window height' })}
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
          label={t('croquis.window_width', { defaultValue: 'Window width' })}
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
        label={t('croquis.shuffle_entire_queue', { defaultValue: 'Shuffle entire queue' })}
        checked={isShuffle}
        onCheckedChange={setIsShuffle}
      />

      {error ? <div className="croquis-inline-error">{error}</div> : null}
    </Modal>
  );
}
