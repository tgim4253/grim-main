import type { PanelPreferences, PanelView } from '@tgim/types/panel-settings';
import { createDefaultGraphPreferences, normaliseGraphPreferences } from './graphPreferences';

const DEFAULT_VIEW: PanelView = 'graph';

export const createDefaultPanelPreferences = (): PanelPreferences => ({
  graph: createDefaultGraphPreferences(),
  grid: null,
  activeView: DEFAULT_VIEW,
  rootNodeId: null,
});

export const normalisePanelPreferences = (
  preferences?: PanelPreferences | null,
): PanelPreferences => {
  const base = preferences ?? createDefaultPanelPreferences();

  const graph = normaliseGraphPreferences(base.graph);
  const activeView =
    base.activeView && VIEW_OPTIONS.has(base.activeView) ? base.activeView : DEFAULT_VIEW;

  return {
    graph,
    grid: base.grid ?? null,
    activeView,
    rootNodeId: base.rootNodeId ?? null,
  };
};

const VIEW_OPTIONS: Set<PanelView> = new Set(['graph', 'grid', 'viewer']);
