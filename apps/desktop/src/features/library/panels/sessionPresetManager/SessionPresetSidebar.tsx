import { Button } from '../../../../shared/ui';
import type { SessionPreset } from '../../../../shared/types';

type SessionPresetSidebarProps = {
  presets: SessionPreset[];
  selectedPresetId: string | null;
  onCreatePreset: () => void;
  onSelectPreset: (presetId: string) => void;
};

export function SessionPresetSidebar({
  presets,
  selectedPresetId,
  onCreatePreset,
  onSelectPreset,
}: SessionPresetSidebarProps) {
  return (
    <aside className="library-manager__nav">
      <div className="library-manager__header">
        <div>
          <div className="app-kicker">Session Presets</div>
          <strong>Learning Cycles</strong>
        </div>
        <Button variant="secondary" size="sm" onClick={onCreatePreset}>
          New
        </Button>
      </div>

      <div className="library-list">
        {presets.length === 0 ? (
          <div className="library-empty-copy">No presets yet.</div>
        ) : (
          presets.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={`library-list__item${
                preset.id === selectedPresetId ? ' library-list__item--active' : ''
              }`}
              onClick={() => {
                onSelectPreset(preset.id);
              }}
            >
              <strong>{preset.name}</strong>
              <span>
                {preset.steps.length} steps
                {preset.isDefault ? ' · Default' : ''}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
