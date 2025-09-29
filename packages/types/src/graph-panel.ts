import { GraphNodeType, RelationType } from './graph';

export type GraphAdjacencyEntry = {
  nodeId: string;
  relationKind: RelationType;
  kindRuleId: string;
};

export interface GraphContext {
  adjacency: Record<string, GraphAdjacencyEntry[]>;
  nodeTypes: Record<string, GraphNodeType>;
  connectionKinds: RelationType[];
  availableLevels: number[];
  kindRuleIds: string[];
  nodeLabels: Record<string, string>;
}
