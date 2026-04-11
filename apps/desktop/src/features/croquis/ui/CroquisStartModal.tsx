import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  CheckboxRow,
  Input,
  Modal,
  ModalFooter,
  Select,
  type SelectOption,
} from '../../../shared/ui';
import type { CroquisOption, LibrarySettings, SessionPreset } from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import { CroquisOptionChecklist } from './CroquisOptionChecklist';
import { CroquisPresetStepList } from './CroquisPresetStepList';
import { buildPreferences, cloneOption, findFallbackPreset } from '../lib/startModal';
import './croquis.css';

type CroquisStartModalProps = {
  open: boolean;
  assetIds: string[];
  sessionPresets: SessionPreset[];
  librarySettings: LibrarySettings;
  onClose: () => void;
  onStarted: () => Promise<void> | void;
};

export function CroquisStartModal({
  open,
  assetIds,
  sessionPresets,
  librarySettings,
  onClose,
  onStarted,
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
    setSelectedPresetId(fallbackPreset ? fallbackPreset.id : '');
    setError(null);
  }, [fallbackPreset, librarySettings.croquisPreferences, open]);

  if (!open) {
    return null;
  }

  const selectedPreset =
    sessionPresets.find(preset => preset.id === selectedPresetId) || fallbackPreset;

  const handleStart = async () => {
    if (selectedPreset === null) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const preferencesPayload = rememberOption ? buildPreferences(option) : null;
      if (preferencesPayload) {
        await ipc.library.saveCroquisPreferences(preferencesPayload);
      }

      await ipc.session.start({
        assetIds,
        presetId: selectedPreset.id,
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
      title="Start Croquis"
      onClose={onClose}
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
            disabled={busy || selectedPreset === null}
            onClick={() => {
              void handleStart();
            }}
          >
            {busy ? 'Starting...' : 'Start Session'}
          </Button>
        </ModalFooter>
      }
    >
      <div className="croquis-modal__intro">
        <div className="app-kicker">Croquis Session</div>
        <p>{assetIds.length} selected assets will be queued into a single library session.</p>
      </div>

      <Select
        label="Session preset"
        placeholder="Select session preset"
        options={presetOptions}
        value={selectedPresetId}
        onValueChange={setSelectedPresetId}
      />

      <CroquisPresetStepList preset={selectedPreset} />

      <div className="croquis-grid">
        <Input
          label="Fallback timer (seconds)"
          type="number"
          min={0}
          value={option.timer.maxTime}
          onChange={event => {
            setOption(current => ({
              ...current,
              timer: {
                maxTime: Math.max(0, Number(event.target.value) || 0),
              },
            }));
          }}
        />

        <Input
          label="Window width"
          value={option.window.width ?? ''}
          onChange={event => {
            setOption(current => ({
              ...current,
              window: {
                ...current.window,
                width: event.target.value,
              },
            }));
          }}
        />
      </div>

      <CroquisOptionChecklist
        items={[
          {
            label: 'Auto skip on timeout',
            checked: option.auto.isSkip,
            onChange: (checked: boolean) => {
              setOption(current => ({
                ...current,
                auto: { isSkip: checked },
              }));
            },
          },
          {
            label: 'Shuffle queue',
            checked: option.isShuffle,
            onChange: (checked: boolean) => {
              setOption(current => ({
                ...current,
                isShuffle: checked,
              }));
            },
          },
          {
            label: 'Grayscale',
            checked: option.isGray,
            onChange: (checked: boolean) => {
              setOption(current => ({
                ...current,
                isGray: checked,
              }));
            },
          },
          {
            label: 'Enable capture',
            checked: option.isCapture,
            onChange: (checked: boolean) => {
              setOption(current => ({
                ...current,
                isCapture: checked,
              }));
            },
          },
        ]}
      />

      {error ? <div className="croquis-inline-error">{error}</div> : null}
    </Modal>
  );
}
