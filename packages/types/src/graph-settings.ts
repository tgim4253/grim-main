export interface GraphPreferences {
  presets: GraphPreset[];
  activePresetId: string;
}

export interface GraphPreset {
  id: string;
  name: string;
  option: GraphOption;
}

export interface GraphOption {
  visibleLevels: number[];
  perKindLevels: Record<string, number[]>;
  maxDepth: number | null;
  hideLevelTwoNodes: boolean;
  connectionKinds: GraphFilter<string>;
  nodeKinds: GraphFilter<string>;
  clauses: GraphClause[];
}

export interface GraphFilter<T> {
  include: T[];
  exclude: T[];
}

export type GraphClause =
  | { type: 'linkedToNode'; nodeId: string; include: boolean }
  | { type: 'linkedViaKind'; relationKind: string; include: boolean }
  | { type: 'linkedViaNodeKind'; nodeKind: string; include: boolean };
