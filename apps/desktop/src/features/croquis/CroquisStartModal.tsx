import React, { useCallback, useEffect, useState } from 'react';
import { join } from '@tauri-apps/api/path';
import { Button, Input, Modal, Switch } from '@tgim/ui';
import { CroquisOption, CroquisStartResponse } from '@tgim/types/croquis';
import { ipc } from '../../lib/ipc';
import { toast } from 'react-toastify';

type WindowPreset = {
  label: string;
  width: string | null;
  height: string | null;
};

const WINDOW_PRESETS: WindowPreset[] = [
  { label: 'Default', width: null, height: null },
  { label: '1024×768', width: '1024', height: '768' },
  { label: '1280×720', width: '1280', height: '720' },
  { label: '1920×1080', width: '1920', height: '1080' },
];

const normaliseCroquisOption = (option: CroquisOption): CroquisOption => ({
  window: {
    width: option.window?.width ?? null,
    height: option.window?.height ?? null,
  },
  auto: {
    isSkip: option.auto?.isSkip ?? false,
  },
  timer: {
    max_time: option.timer?.max_time ?? 60,
  },
  isCapture: option.isCapture ?? false,
  savePath: option.savePath ?? '',
  isGray: option.isGray ?? false,
  isShuffle: option.isShuffle ?? false,
});

export type CroquisStartModalConfirmPayload = {
  response: CroquisStartResponse;
  option: CroquisOption;
  remember: boolean;
};

type CroquisStartModalProps = {
  open: boolean;
  option: CroquisOption;
  moaId: string | null;
  imageHashes: string[];
  remember?: boolean;
  onConfirm?: (payload: CroquisStartModalConfirmPayload) => void | Promise<void>;
  onClose: () => void;
};

const CroquisStartModal: React.FC<CroquisStartModalProps> = ({
  open,
  option,
  moaId,
  imageHashes,
  remember = false,
  onConfirm,
  onClose,
}) => {
  const [localOption, setLocalOption] = useState<CroquisOption>(() =>
    normaliseCroquisOption(option),
  );
  const [rememberSettings, setRememberSettings] = useState<boolean>(Boolean(remember));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalOption(normaliseCroquisOption(option));
    setRememberSettings(Boolean(remember));
  }, [open, option, remember]);

  useEffect(() => {
    if (!open || !moaId) return;
    if (localOption.savePath) return;

    let cancelled = false;

    void (async () => {
      try {
        const moas = await ipc.moa.loadMoas();
        const target = moas.find(moa => moa.moa_id === moaId);
        if (!target) return;
        const defaultPath = await join(target.path, 'croquis');
        if (cancelled) return;
        setLocalOption(prev => ({
          ...prev,
          savePath: defaultPath,
        }));
      } catch (error) {
        console.error('[Croquis] Failed to resolve default save path', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, moaId, localOption.savePath]);

  const selectedCount = imageHashes.length;

  const windowWidth = localOption.window?.width ?? '';
  const windowHeight = localOption.window?.height ?? '';

  const skipMode = localOption.auto.isSkip ? 'auto' : 'manual';
  const rememberMode = rememberSettings ? 'remember' : 'session';

  const handleWindowPresetClick = useCallback((preset: WindowPreset) => {
    setLocalOption(prev => ({
      ...prev,
      window: {
        width: preset.width,
        height: preset.height,
      },
    }));
  }, []);

  const handleWindowDimensionChange = useCallback((key: 'width' | 'height') => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setLocalOption(prev => ({
        ...prev,
        window: {
          ...prev.window,
          [key]: value ? value : null,
        },
      }));
    };
  }, []);

  const handleTimerChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    setLocalOption(prev => ({
      ...prev,
      timer: {
        ...prev.timer,
        maxTime: Number.isFinite(next) && next >= 0 ? next : 0,
      },
    }));
  }, []);

  const handleToggleOption = useCallback((key: 'isGray' | 'isCapture' | 'isShuffle') => {
    setLocalOption(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleSavePathChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalOption(prev => ({
      ...prev,
      savePath: value,
    }));
  }, []);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

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
      const response = await ipc.croquis.startSession({
        moaId,
        imageHashes,
        option: { ...localOption, auto: { isSkip: false } },
        saveOption: rememberSettings,
      });
      await onConfirm?.({ response, option: localOption, remember: rememberSettings });
      onClose();
      return response;
    } catch (error) {
      console.error('[Croquis] Failed to start session', error);
      toast.error('Failed to start Croquis. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    imageHashes,
    localOption,
    moaId,
    onClose,
    onConfirm,
    rememberSettings,
    selectedCount,
    submitting,
  ]);

  if (!open) {
    return null;
  }

  return (
    <Modal onClose={handleCancel} dismissible>
      <div className="flex w-[32rem] max-w-full flex-col gap-6 text-text">
        <div>
          <h2 className="text-lg font-semibold">Start Croquis session</h2>
          <p className="mt-1 text-sm text-text-soft">
            {selectedCount === 1
              ? '1 image selected'
              : `${selectedCount.toLocaleString()} images selected`}
          </p>
        </div>

        <section className="space-y-3">
          <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Window size
          </header>
          <div className="flex flex-wrap gap-2">
            {WINDOW_PRESETS.map(preset => {
              const isActive =
                (preset.width ?? '') === (localOption.window?.width ?? '') &&
                (preset.height ?? '') === (localOption.window?.height ?? '');
              return (
                <Button
                  key={preset.label}
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

        <section className="space-y-3">
          <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Auto skip
          </header>
          <Switch
            current={skipMode}
            onChanged={value =>
              setLocalOption(prev => ({
                ...prev,
                auto: {
                  ...prev.auto,
                  skip: value === 'auto',
                },
              }))
            }
            options={[
              { name: 'Auto skip breaks', value: 'auto' },
              { name: 'Manual control', value: 'manual' },
            ]}
          />
        </section>

        <section className="space-y-3">
          <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Timer
          </header>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">
              Seconds per pose
            </span>
            <Input.Input
              type="number"
              min={5}
              step={5}
              inputMode="numeric"
              className="input-default"
              value={localOption.timer.max_time.toString()}
              onChange={handleTimerChange}
            />
          </label>
        </section>

        <section className="space-y-3">
          <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Session options
          </header>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="toggle"
              active={localOption.isCapture}
              onClick={() => handleToggleOption('isCapture')}
            >
              Capture reference
            </Button>
            <Button
              type="button"
              variant="toggle"
              active={localOption.isGray}
              onClick={() => handleToggleOption('isGray')}
            >
              Grayscale
            </Button>
            <Button
              type="button"
              variant="toggle"
              active={localOption.isShuffle}
              onClick={() => handleToggleOption('isShuffle')}
            >
              Shuffle order
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <header className="text-xs font-semibold uppercase tracking-wide text-text-soft">
            Saving
          </header>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-soft">
              Save path
            </span>
            <Input.Input
              type="text"
              className="input-default"
              value={localOption.savePath}
              placeholder="Path for captured images"
              onChange={handleSavePathChange}
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-soft">
              Remember these settings for this workspace?
            </span>
            <Switch
              current={rememberMode}
              onChanged={value => setRememberSettings(value === 'remember')}
              options={[
                { name: 'This session', value: 'session' },
                { name: 'Remember', value: 'remember' },
              ]}
            />
          </div>
        </section>

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
    </Modal>
  );
};

export default CroquisStartModal;
