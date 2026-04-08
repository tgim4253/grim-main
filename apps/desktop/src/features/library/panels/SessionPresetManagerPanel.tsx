import { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type { SessionPreset, SessionPresetStepDraft, Tag } from '../../../shared/types';
import { SessionPresetSidebar } from './sessionPresetManager/SessionPresetSidebar';
import { SessionPresetStepEditor } from './sessionPresetManager/SessionPresetStepEditor';
import { createEmptyStep, toEditableStep, type EditableStep } from './sessionPresetManager/shared';

type SessionPresetManagerPanelProps = {
  refreshToken: number;
  tags: Tag[];
  onDataChanged: () => Promise<void>;
};

export function SessionPresetManagerPanel({
  refreshToken,
  tags,
  onDataChanged,
}: SessionPresetManagerPanelProps) {
  const [presets, setPresets] = useState<SessionPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextPresets = await ipc.session.listPresets();
        if (cancelled) {
          return;
        }

        setPresets(nextPresets);
        setSelectedPresetId(current => {
          if (current && nextPresets.some(preset => preset.id === current)) {
            return current;
          }

          return nextPresets[0]?.id ?? null;
        });
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error ? nextError.message : 'Failed to load session presets',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const selectedPreset = useMemo(
    () => presets.find(preset => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId],
  );

  useEffect(() => {
    if (!selectedPreset) {
      setName('');
      setDescription('');
      setIsDefault(false);
      setSteps([createEmptyStep()]);
      return;
    }

    setName(selectedPreset.name);
    setDescription(selectedPreset.description ?? '');
    setIsDefault(selectedPreset.isDefault);
    setSteps(
      selectedPreset.steps.length > 0
        ? selectedPreset.steps.map(toEditableStep)
        : [createEmptyStep()],
    );
  }, [selectedPreset]);

  const availableTagNames = useMemo(
    () =>
      Array.from(new Set(tags.map(tag => tag.name))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [tags],
  );

  const handleSave = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const trimmedName = name.trim();
        const payloadSteps: SessionPresetStepDraft[] = steps.map((step, index) => ({
          id: step.id ?? null,
          name: step.name.trim(),
          stepOrder: index + 1,
          defaultDurationSeconds: step.defaultDurationSeconds.trim()
            ? Number(step.defaultDurationSeconds)
            : null,
          autoTagNames: step.autoTagNames
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
          resultRequired: step.resultRequired,
        }));

        const nextPresets = await ipc.session.savePreset({
          id: selectedPresetId,
          name: trimmedName,
          description: description.trim() || null,
          isDefault,
          steps: payloadSteps,
        });
        setPresets(nextPresets);
        if (nextPresets.length === 0) {
          setSelectedPresetId(null);
          await onDataChanged();
          return;
        }

        const savedPreset =
          (selectedPresetId
            ? nextPresets.find(preset => preset.id === selectedPresetId)
            : undefined) ||
          nextPresets.find(preset => preset.name === trimmedName) ||
          nextPresets[0];
        setSelectedPresetId(savedPreset.id);
        await onDataChanged();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to save session preset');
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleDelete = () => {
    if (!selectedPresetId) {
      return;
    }

    void (async () => {
      const shouldDelete = window.confirm('Delete this session preset?');
      if (!shouldDelete) {
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const nextPresets = await ipc.session.deletePreset({ presetId: selectedPresetId });
        setPresets(nextPresets);
        setSelectedPresetId(nextPresets[0] ? nextPresets[0].id : null);
        await onDataChanged();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : 'Failed to delete session preset',
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  if (loading) {
    return <div className="library-panel-state">Loading session presets...</div>;
  }

  return (
    <div className="library-manager">
      <SessionPresetSidebar
        presets={presets}
        selectedPresetId={selectedPresetId}
        onCreatePreset={() => {
          setSelectedPresetId(null);
        }}
        onSelectPreset={setSelectedPresetId}
      />

      <div className="library-manager__content">
        <div className="library-viewer__section">
          <div className="app-kicker">{selectedPresetId ? 'Edit Preset' : 'New Preset'}</div>
          <h2 className="library-viewer__title">
            {selectedPresetId
              ? selectedPreset
                ? selectedPreset.name
                : 'Preset'
              : 'Create Session Preset'}
          </h2>
          <p className="library-viewer__copy">
            Define the step order, default duration, and auto tags for each learning cycle.
          </p>
        </div>

        <div className="library-manager__form-grid">
          <Input
            label="Preset name"
            value={name}
            onChange={event => {
              setName(event.target.value);
            }}
            placeholder="3-step figure cycle"
          />
          <Input
            label="Description"
            value={description}
            onChange={event => {
              setDescription(event.target.value);
            }}
            placeholder="Optional description"
          />
        </div>

        <label className="library-check">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={event => {
              setIsDefault(event.target.checked);
            }}
          />
          <span>Use as the default session preset</span>
        </label>

        <div className="library-viewer__section">
          <div className="library-manager__subheader">
            <div className="app-kicker">Steps</div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSteps(current => [
                  ...current,
                  createEmptyStep(`Step ${String(current.length + 1)}`),
                ]);
              }}
            >
              Add Step
            </Button>
          </div>

          <div className="library-step-stack">
            {steps.map((step, index) => (
              <SessionPresetStepEditor
                key={step.id ?? `draft-${String(index + 1)}`}
                availableTagNames={availableTagNames}
                index={index}
                step={step}
                stepsCount={steps.length}
                onChange={nextStep => {
                  setSteps(current =>
                    current.map((entry, currentIndex) =>
                      currentIndex === index ? nextStep : entry,
                    ),
                  );
                }}
                onRemove={() => {
                  setSteps(current => current.filter((_, currentIndex) => currentIndex !== index));
                }}
              />
            ))}
          </div>
        </div>

        {error ? <div className="library-inline-error">{error}</div> : null}

        <div className="library-inline-actions">
          <Button variant="primary" disabled={busy || !name.trim()} onClick={handleSave}>
            {busy ? 'Saving...' : 'Save Preset'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedPresetId(null);
            }}
          >
            Reset
          </Button>
          <Button variant="destructive" disabled={!selectedPresetId} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
