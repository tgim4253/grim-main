import { useEffect, useMemo, useState } from 'react';
import {
  AccordionItem,
  AccordionItemBody,
  AccordionItemHeader,
  AccordionRoot,
  Button,
  Chip,
  ChipButton,
  CheckboxConditionalRow,
  CheckboxRow,
  Icon,
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
} from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import { buildPreferences, cloneOption, findFallbackPreset } from '../lib/startModal';
import './croquis.css';

const DURATION_OPTIONS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '3m', value: 180 },
  { label: '10m', value: 600 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
  { label: '∞', value: 0 },
] as const;

const DURATION_MIN_SECONDS = 0;
const DURATION_SLIDER_MAX_SECONDS = 3600;
const DURATION_STEP_SECONDS = 1;

type CroquisStartModalProps = {
  open: boolean;
  assetIds: string[];
  sessionPresets: SessionPreset[];
  librarySettings: LibrarySettings;
  onClose: () => void;
  onStarted: () => Promise<void> | void;
  saveCroquisPreferences?: (preferences: CroquisPreferences) => Promise<unknown>;
  startCroquisSession?: (payload: CroquisStartPayload) => Promise<unknown>;
};

const formatDurationCompact = (seconds?: number | null) => {
  if (seconds === null || seconds === undefined || seconds <= 0) {
    return '∞';
  }

  if (seconds % 3600 === 0) {
    return `${String(seconds / 3600)}h`;
  }

  if (seconds % 60 === 0) {
    return `${String(seconds / 60)}m`;
  }

  return `${String(seconds)}s`;
};

const formatSeconds = (seconds: number) => formatDurationCompact(seconds);

const formatEstimate = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes)}:${String(remainingSeconds).padStart(2, '0')}`;
};

const normalizeWindowDimension = (value: string) => value.replace(/\D/g, '');

const clampDurationSeconds = (seconds: number) => {
  return Math.max(DURATION_MIN_SECONDS, Math.trunc(Number.isFinite(seconds) ? seconds : 0));
};

const normalizeDurationUnit = (value: string, max?: number) => {
  const digits = value.replace(/\D/g, '');
  const unitValue = Math.max(0, digits ? Number(digits) : 0);

  if (!Number.isFinite(unitValue)) {
    return 0;
  }

  return max === undefined ? unitValue : Math.min(max, unitValue);
};

const getDurationParts = (seconds: number) => {
  const clampedSeconds = clampDurationSeconds(seconds);

  return {
    hours: Math.floor(clampedSeconds / 3600),
    minutes: Math.floor((clampedSeconds % 3600) / 60),
    seconds: clampedSeconds % 60,
  };
};

const composeDurationSeconds = ({
  hours,
  minutes,
  seconds,
}: {
  hours: number;
  minutes: number;
  seconds: number;
}) => clampDurationSeconds(hours * 3600 + minutes * 60 + seconds);

const getStepDuration = (
  step: SessionPreset['steps'][number] | undefined,
  fallbackSeconds: number,
) => step?.defaultDurationSeconds ?? fallbackSeconds;

type CroquisStepBodyProps = {
  step: SessionPreset['steps'][number];
  option: CroquisOption;
  durationSeconds: number;
  onTimerChange: (seconds: number) => void;
  onAutoSkipChange: (checked: boolean) => void;
  onCaptureChange: (checked: boolean) => void;
  onRecordsSaveChange: (checked: boolean) => void;
  onRequireResultChange: (checked: boolean) => void;
};

function CroquisStepBody({
  step,
  option,
  durationSeconds,
  onTimerChange,
  onAutoSkipChange,
  onCaptureChange,
  onRecordsSaveChange,
  onRequireResultChange,
}: CroquisStepBodyProps) {
  const durationParts = getDurationParts(durationSeconds);

  return (
    <div className="croquis-start-modal__step-body">
      <div className="croquis-start-modal__step-column">
        <section className="croquis-start-modal__control-group">
          <div className="croquis-start-modal__control-header">
            <span className="croquis-start-modal__control-label">Duration</span>
            <span className="croquis-start-modal__control-value">
              {formatSeconds(durationSeconds)}
            </span>
          </div>

          <div className="croquis-start-modal__duration-row" aria-label="Fallback duration">
            {DURATION_OPTIONS.map(duration => (
              <ChipButton
                key={duration.value}
                shape="pill"
                variant="outline"
                pressed={durationSeconds === duration.value}
                onClick={() => {
                  onTimerChange(duration.value);
                }}
              >
                {duration.label}
              </ChipButton>
            ))}
          </div>

          <input
            className="croquis-start-modal__duration-slider"
            type="range"
            min={DURATION_MIN_SECONDS}
            max={DURATION_SLIDER_MAX_SECONDS}
            step={DURATION_STEP_SECONDS}
            value={Math.min(durationSeconds, DURATION_SLIDER_MAX_SECONDS)}
            aria-label="Fallback duration in seconds"
            onChange={event => {
              onTimerChange(clampDurationSeconds(Number(event.target.value)));
            }}
          />

          <div className="croquis-start-modal__duration-time-inputs">
            <Input
              className="croquis-start-modal__duration-input"
              label="h"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={durationParts.hours}
              aria-label="Fallback duration hours"
              onChange={event => {
                onTimerChange(
                  composeDurationSeconds({
                    ...durationParts,
                    hours: normalizeDurationUnit(event.target.value),
                  }),
                );
              }}
            />
            <Input
              className="croquis-start-modal__duration-input"
              label="m"
              type="number"
              min={0}
              max={59}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={durationParts.minutes}
              aria-label="Fallback duration minutes"
              onChange={event => {
                onTimerChange(
                  composeDurationSeconds({
                    ...durationParts,
                    minutes: normalizeDurationUnit(event.target.value, 59),
                  }),
                );
              }}
            />
            <Input
              className="croquis-start-modal__duration-input"
              label="s"
              type="number"
              min={0}
              max={59}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={durationParts.seconds}
              aria-label="Fallback duration seconds"
              onChange={event => {
                onTimerChange(
                  composeDurationSeconds({
                    ...durationParts,
                    seconds: normalizeDurationUnit(event.target.value, 59),
                  }),
                );
              }}
            />
          </div>
        </section>

        <section className="croquis-start-modal__control-group">
          <span className="croquis-start-modal__control-label">Asset Tags</span>
          <div className="croquis-start-modal__tag-row">
            {step.autoTags.map(tag => (
              <Chip key={tag.id} shape="rounded" variant="neutral-dismiss">
                {tag.name}
              </Chip>
            ))}
            <Chip shape="rounded" variant="add">
              ADD TAG
            </Chip>
          </div>
        </section>
      </div>

      <div className="croquis-start-modal__step-column">
        <section className="croquis-start-modal__control-group croquis-start-modal__step-settings">
          <span className="croquis-start-modal__control-label">Step Settings</span>
          <div className="croquis-start-modal__setting-stack">
            <CheckboxRow
              label="Auto-advance"
              checked={option.auto.isSkip}
              onCheckedChange={onAutoSkipChange}
              width="full"
            />
            <CheckboxConditionalRow
              label="Records Save"
              checked={option.isRecordSave}
              onCheckedChange={onRecordsSaveChange}
              width="full"
              childrenClassName="croquis-start-modal__nested-settings"
            >
              <CheckboxRow
                label="Require result"
                checked={step.resultRequired}
                onCheckedChange={onRequireResultChange}
                width="full"
              />
              <CheckboxRow
                label="Capture enabled"
                checked={option.isCapture}
                onCheckedChange={onCaptureChange}
                width="full"
              />
            </CheckboxConditionalRow>
          </div>
        </section>
      </div>
    </div>
  );
}

export function CroquisStartModal({
  open,
  assetIds,
  sessionPresets,
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
  const [durationOverrides, setDurationOverrides] = useState<Record<string, number>>({});
  const [resultRequiredOverrides, setResultRequiredOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setDurationOverrides({});
    setResultRequiredOverrides({});
    setSelectedPresetId(fallbackPreset ? fallbackPreset.id : '');
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
          steps: baseSelectedPreset.steps.map(step => ({
            ...step,
            defaultDurationSeconds:
              durationOverrides[step.id] ?? getStepDuration(step, option.timer.maxTime),
            resultRequired: resultRequiredOverrides[step.id] ?? step.resultRequired,
          })),
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

  const handleStart = async () => {
    if (selectedPreset === null) {
      return;
    }

    if (assetIds.length === 0) {
      setError('Select at least one asset to start a Croquis session.');
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
            disabled={busy || selectedPreset === null || assetIds.length === 0}
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
        onValueChange={nextPresetId => {
          setSelectedPresetId(nextPresetId);
          setDurationOverrides({});
          setResultRequiredOverrides({});
        }}
      />

      <div className="croquis-start-modal__pipeline">
        <div className="croquis-start-modal__pipeline-header">
          <span>Time Steps Pipeline</span>
          <span>{String(selectedPresetSteps.length)} Steps Total</span>
        </div>

        <AccordionRoot
          key={selectedPreset?.id ?? 'empty-preset'}
          type="single"
          collapsible
          defaultValue={selectedPresetSteps[0]?.id ?? null}
          className="croquis-start-modal__accordion"
        >
          {selectedPresetSteps.map((step, index) => (
            <AccordionItem key={step.id} value={step.id}>
              <AccordionItemHeader
                index={String(index + 1).padStart(2, '0')}
                meta={formatDurationCompact(getStepDuration(step, option.timer.maxTime))}
              >
                {step.name}
              </AccordionItemHeader>
              <AccordionItemBody>
                <CroquisStepBody
                  step={step}
                  option={option}
                  durationSeconds={getStepDuration(step, option.timer.maxTime)}
                  onTimerChange={seconds => {
                    const nextSeconds = clampDurationSeconds(seconds);
                    setDurationOverrides(current => ({
                      ...current,
                      [step.id]: nextSeconds,
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
                    setResultRequiredOverrides(current => ({
                      ...current,
                      [step.id]: checked,
                    }));
                  }}
                  onCaptureChange={checked => {
                    setOption(current => ({
                      ...current,
                      isCapture: checked,
                    }));
                  }}
                />
              </AccordionItemBody>
            </AccordionItem>
          ))}
        </AccordionRoot>
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
