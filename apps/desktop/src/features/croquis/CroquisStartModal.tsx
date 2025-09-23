import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { join } from '@tauri-apps/api/path';
import { Button, Input, Modal, Switch } from '@tgim/ui';
import { CroquisOption, CroquisPreferences, CroquisStartResponse } from '@tgim/types/croquis';
import { ipc } from '../../lib/ipc';
import { open as pickerOpen } from '@tauri-apps/plugin-dialog';

import { toast } from 'react-toastify';
import {
  createPreset,
  normaliseCroquisOption,
  normaliseCroquisPreferences,
} from './lib/preferences';

type WindowPreset = {
  label: string;
  width: string | null;
  height: string | null;
};

const WINDOW_PRESETS: WindowPreset[] = [
  { label: 'Custom', width: null, height: null },
  { label: '256xauto', width: '256', height: '0' },
  { label: '512xauto', width: '512', height: '0' },
];

const TIMER_PRESETS = [
  { label: '30s', seconds: 30 },
  { label: '1m', seconds: 60 },
  { label: '3m', seconds: 3 * 60 },
  { label: '5m', seconds: 5 * 60 },
  { label: '10m', seconds: 10 * 60 },
  { label: '30m', seconds: 30 * 60 },
] as const;

const clampSeconds = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const formatTimer = (seconds: number): string => {
  const total = clampSeconds(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

const parseTimerInput = (raw: string): number | null => {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts.length >= 2 && parts.length <= 3 && parts.every(part => /^\d+$/.test(part))) {
      const numbers = parts.map(Number);
      if (numbers.length === 2) {
        const [minutes, seconds] = numbers;
        return minutes * 60 + seconds;
      }
      if (numbers.length === 3) {
        const [hours, minutes, seconds] = numbers;
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
  }

  const unitPattern = /(\d+)\s*(h(?:ours?)?|m(?:in(?:utes)?)?|s(?:ec(?:onds)?)?)/g;
  let match: RegExpExecArray | null;
  let total = 0;
  let matched = false;

  while ((match = unitPattern.exec(value)) !== null) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2];
    if (Number.isNaN(amount)) continue;

    if (unit.startsWith('h')) {
      total += amount * 3600;
    } else if (unit.startsWith('m')) {
      total += amount * 60;
    } else {
      total += amount;
    }
  }

  return matched ? total : null;
};

export type CroquisStartModalConfirmPayload = {
  response: CroquisStartResponse;
  option: CroquisOption;
  preferences: CroquisPreferences;
  remember: boolean;
};

type CroquisStartModalProps = {
  open: boolean;
  preferences: CroquisPreferences;
  moaId: string | null;
  imageHashes: string[];
  remember?: boolean;
  onConfirm?: (payload: CroquisStartModalConfirmPayload) => void | Promise<void>;
  onClose: () => void;
};

const CroquisStartModal: React.FC<CroquisStartModalProps> = ({
  open,
  preferences,
  moaId,
  imageHashes,
  remember = true,
  onConfirm,
  onClose,
}) => {
  const [preferencesState, setPreferencesState] = useState<CroquisPreferences>(() =>
    normaliseCroquisPreferences(preferences),
  );
  const activePreset = useMemo(
    () =>
      preferencesState.presets.find(preset => preset.id === preferencesState.activePresetId) ??
      preferencesState.presets[0],
    [preferencesState],
  );
  const activeOption = useMemo(() => normaliseCroquisOption(activePreset?.option), [activePreset]);
  const [rememberSettings, setRememberSettings] = useState<boolean>(Boolean(remember));
  const [submitting, setSubmitting] = useState(false);
  const [timerInput, setTimerInput] = useState(() => formatTimer(activeOption.timer.maxTime));
  const [editingTimer, setEditingTimer] = useState(false);
  const hasUserInteractedRef = useRef(false);

  const markInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  useEffect(() => {
    if (!open) return;
    hasUserInteractedRef.current = false;
    setPreferencesState(normaliseCroquisPreferences(preferences));
    setRememberSettings(Boolean(remember));
    setEditingTimer(false);
  }, [open, preferences, remember]);

  useEffect(() => {
    if (editingTimer) return;
    setTimerInput(formatTimer(activeOption.timer.maxTime));
  }, [activeOption.timer.maxTime, editingTimer]);

  useEffect(() => {
    if (!open || !moaId) return;

    let cancelled = false;

    void (async () => {
      try {
        const persisted = await ipc.croquis.loadPreferences(moaId);
        if (cancelled || !persisted) return;
        if (hasUserInteractedRef.current) return;
        setPreferencesState(normaliseCroquisPreferences(persisted));
      } catch (error) {
        console.error('[Croquis] Failed to load saved presets', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, moaId]);

  useEffect(() => {
    if (!open || !moaId) return;
    if (activeOption.savePath) return;

    let cancelled = false;

    void (async () => {
      try {
        const moas = await ipc.moa.loadMoas();
        const target = moas.find(moa => moa.moa_id === moaId);
        if (!target) return;
        const defaultPath = await join(target.path, 'croquis');
        if (cancelled) return;
        setPreferencesState(prev => {
          const activeId = prev.activePresetId;
          const nextPresets = prev.presets.map(preset => {
            if (preset.id !== activeId) return preset;
            if (preset.option.savePath) return preset;
            return {
              ...preset,
              option: {
                ...preset.option,
                savePath: defaultPath,
              },
            };
          });
          return {
            ...prev,
            presets: nextPresets,
          };
        });
      } catch (error) {
        console.error('[Croquis] Failed to resolve default save path', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, moaId, activeOption.savePath]);

  const updateActiveOption = useCallback(
    (updater: (option: CroquisOption) => CroquisOption) => {
      markInteracted();
      setPreferencesState(prev => {
        const nextPresets = prev.presets.map(preset => {
          if (preset.id !== prev.activePresetId) return preset;
          const base = normaliseCroquisOption(preset.option);
          const nextOption = normaliseCroquisOption(updater(base));
          return {
            ...preset,
            option: nextOption,
          };
        });
        return {
          ...prev,
          presets: nextPresets,
        };
      });
    },
    [markInteracted],
  );

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      markInteracted();
      setEditingTimer(false);
      setPreferencesState(prev => {
        if (prev.activePresetId === presetId) return prev;
        return {
          ...prev,
          activePresetId: presetId,
        };
      });
    },
    [markInteracted],
  );

  const handleAddPreset = useCallback(() => {
    markInteracted();
    setEditingTimer(false);
    setPreferencesState(prev => {
      const index = prev.presets.length;
      const nextPreset = createPreset(`Preset ${index + 1}`, activeOption, index);
      return {
        presets: [...prev.presets, nextPreset],
        activePresetId: nextPreset.id,
      };
    });
  }, [activeOption, markInteracted]);

  const handleWindowPresetClick = useCallback(
    (preset: WindowPreset) => {
      updateActiveOption(prev => ({
        ...prev,
        window: {
          width: preset.width,
          height: preset.height,
        },
      }));
    },
    [updateActiveOption],
  );

  const handleWindowDimensionChange = useCallback(
    (key: 'width' | 'height') => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      updateActiveOption(prev => ({
        ...prev,
        window: {
          ...prev.window,
          [key]: value ? value : null,
        },
      }));
    },
    [updateActiveOption],
  );

  const handleTimerPresetClick = useCallback(
    (seconds: number) => {
      setEditingTimer(false);
      updateActiveOption(prev => ({
        ...prev,
        timer: {
          ...prev.timer,
          maxTime: seconds,
        },
      }));
    },
    [updateActiveOption],
  );

  const handleTimerInputFocus = useCallback(() => {
    setEditingTimer(true);
    setTimerInput(activeOption.timer.maxTime.toString());
  }, [activeOption.timer.maxTime]);

  const handleTimerInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setTimerInput(event.target.value);
  }, []);

  const commitTimerInput = useCallback(() => {
    const parsed = parseTimerInput(timerInput);
    const safeValue = clampSeconds(parsed ?? activeOption.timer.maxTime ?? 0);
    setEditingTimer(false);
    updateActiveOption(prev => ({
      ...prev,
      timer: {
        ...prev.timer,
        maxTime: safeValue,
      },
    }));
    setTimerInput(formatTimer(safeValue));
  }, [activeOption.timer.maxTime, timerInput, updateActiveOption]);

  const handleTimerInputBlur = useCallback(() => {
    commitTimerInput();
  }, [commitTimerInput]);

  const handleTimerInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        setEditingTimer(false);
        setTimerInput(formatTimer(activeOption.timer.maxTime));
        event.currentTarget.blur();
      }
    },
    [activeOption.timer.maxTime],
  );

  const handleSkipModeChange = useCallback(
    (value: 'manual' | 'auto') => {
      updateActiveOption(prev => ({
        ...prev,
        auto: {
          ...prev.auto,
          isSkip: value === 'auto',
        },
      }));
    },
    [updateActiveOption],
  );

  const handleToggleOption = useCallback(
    (key: 'isGray' | 'isShuffle' | 'isCapture') => {
      updateActiveOption(prev => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    [updateActiveOption],
  );

  const handleSavePathChange = useCallback(
    (value: string) => {
      updateActiveOption(prev => ({
        ...prev,
        savePath: value,
      }));
    },
    [updateActiveOption],
  );

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const selectedCount = imageHashes.length;
  const windowWidth = activeOption.window?.width ?? '';
  const windowHeight = activeOption.window?.height ?? '';
  const skipMode: 'manual' | 'auto' = activeOption.auto.isSkip ? 'auto' : 'manual';
  const rememberMode = rememberSettings ? 'remember' : 'session';

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    if (!selectedCount) {
      toast.error('Select at least one image to start Croquis.');
      return;
    }
    if (!moaId) {
      toast.error('Workspace information is not ready yet.');
      return;
    }

    setSubmitting(true);
    try {
      const payloadOption = normaliseCroquisOption(activeOption);
      const safeMaxTime = clampSeconds(payloadOption.timer.maxTime);
      payloadOption.timer.maxTime = safeMaxTime;

      const preferencesPayload: CroquisPreferences = {
        activePresetId: preferencesState.activePresetId,
        presets: preferencesState.presets.map(preset => ({
          ...preset,
          option: normaliseCroquisOption(preset.option),
        })),
      };

      const response = await ipc.croquis.startSession({
        moaId,
        imageHashes,
        option: payloadOption,
        saveOption: rememberSettings,
        preferences: preferencesPayload,
      });

      await onConfirm?.({
        response,
        option: payloadOption,
        preferences: preferencesPayload,
        remember: rememberSettings,
      });
      onClose();
      return response;
    } catch (error) {
      console.error('[Croquis] Failed to start session', error);
      toast.error('Failed to start Croquis. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    activeOption,
    imageHashes,
    moaId,
    onClose,
    onConfirm,
    preferencesState,
    rememberSettings,
    selectedCount,
    submitting,
  ]);

  if (!open || !activePreset) {
    return null;
  }

  const activeTimerSeconds = activeOption.timer.maxTime;

  return (
    <Modal onClose={handleCancel} dismissible>
      <div className="flex w-[48rem] max-w-full flex-col gap-5 text-text md:flex-row">
        <aside className="flex shrink-0 flex-col gap-3 md:w-44">
          <div>
            <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
              Presets
            </header>
            <div className="mt-2 flex max-h-[22rem] flex-col gap-2 overflow-y-auto pr-1">
              {preferencesState.presets.map(preset => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="toggle"
                  active={preset.id === preferencesState.activePresetId}
                  className="justify-start"
                  onClick={() => handlePresetSelect(preset.id)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
          <Button type="button" variant="ghost" className="justify-start" onClick={handleAddPreset}>
            + Add preset
          </Button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Start Croquis session</h2>
              <p className="mt-1 text-sm text-text-soft">
                {selectedCount === 1
                  ? '1 image selected'
                  : `${selectedCount.toLocaleString()} images selected`}
              </p>
            </div>
            <div className="rounded-md border border-border px-2 py-1 text-xs text-text-soft">
              {activePreset.name}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2">
              <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                Window size
              </header>
              <div className="flex flex-wrap gap-2">
                {WINDOW_PRESETS.map(preset => {
                  const isActive =
                    (preset.width ?? '') === windowWidth && (preset.height ?? '') === windowHeight;
                  return (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="toggle"
                      active={isActive}
                      onClick={() => handleWindowPresetClick(preset)}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                    Width
                  </span>
                  <Input.Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="input-default"
                    value={windowWidth}
                    placeholder="e.g. 1280"
                    onChange={handleWindowDimensionChange('width')}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                    Height
                  </span>
                  <Input.Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="input-default"
                    value={windowHeight}
                    placeholder="e.g. 720"
                    onChange={handleWindowDimensionChange('height')}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-2">
              <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                Timer
              </header>
              <div className="flex flex-wrap gap-2">
                {TIMER_PRESETS.map(preset => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="toggle"
                    active={activeTimerSeconds === preset.seconds}
                    onClick={() => handleTimerPresetClick(preset.seconds)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Seconds per pose
                </span>
                <Input.Input
                  type="text"
                  inputMode="numeric"
                  className="input-default"
                  value={timerInput}
                  placeholder="e.g. 1m 30s"
                  onFocus={handleTimerInputFocus}
                  onBlur={handleTimerInputBlur}
                  onChange={handleTimerInputChange}
                  onKeyDown={handleTimerInputKeyDown}
                  spellCheck={false}
                />
              </label>
              <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                Pose control
              </header>
              <Switch
                current={skipMode}
                onChanged={value => handleSkipModeChange((value as 'manual' | 'auto') ?? 'manual')}
                options={[
                  { name: 'Manual', value: 'manual' },
                  { name: 'Auto skip', value: 'auto' },
                ]}
              />
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2">
              <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                Session options
              </header>
              <div className="flex flex-wrap gap-2">
                {skipMode === 'manual' && (
                  <Button
                    type="button"
                    variant="toggle"
                    active={activeOption.isCapture}
                    onClick={() => handleToggleOption('isCapture')}
                  >
                    Capture reference
                  </Button>
                )}
                <Button
                  type="button"
                  variant="toggle"
                  active={activeOption.isGray}
                  onClick={() => handleToggleOption('isGray')}
                >
                  Grayscale
                </Button>
                <Button
                  type="button"
                  variant="toggle"
                  active={activeOption.isShuffle}
                  onClick={() => handleToggleOption('isShuffle')}
                >
                  Shuffle order
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                Saving
              </header>
              <label
                className="flex cursor-pointer flex-col gap-1 text-sm"
                onClick={async () => {
                  const result = await pickerOpen({ directory: true });
                  if (!result) return;
                  handleSavePathChange(result);
                }}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Save path
                </span>
                <Input.Input
                  type="text"
                  className="input-default"
                  value={activeOption.savePath}
                  placeholder="Path for captured images"
                  readOnly
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-soft">Remember for this workspace?</span>
                <Switch
                  current={rememberMode}
                  onChanged={value => {
                    markInteracted();
                    setRememberSettings(value === 'remember');
                  }}
                  options={[
                    { name: 'Session only', value: 'session' },
                    { name: 'Remember', value: 'remember' },
                  ]}
                />
              </div>
            </section>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={submitting || !selectedCount}
            >
              {submitting ? 'Starting…' : 'Start Croquis'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CroquisStartModal;
