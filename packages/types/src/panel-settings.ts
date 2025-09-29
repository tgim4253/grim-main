import type { GraphPreferences } from './graph-settings';

export type PanelView = 'graph' | 'grid' | 'viewer';

export interface GridPreferences {
  // Reserved for future expansion.
}

export interface PanelPreferences {
  graph: GraphPreferences;
  grid?: GridPreferences | null;
  activeView?: PanelView | null;
  rootNodeId?: string | null;
}
