import {
  Connection,
  GraphConnection,
  GraphData,
  GraphNode,
  GraphNodeType,
  GraphResponse,
  Node,
  NodeKind,
  RelationType,
  FileType,
} from '@tgim/types/graph';
import { GraphAdjacencyEntry, GraphContext } from '@tgim/types/graph-panel';
import { createNewId } from '@tgim/utils/identifier';
import { GridData, ImageItem } from '@tgim/types/grid';

interface NodeMetadata {
  label: string;
  type: GraphNodeType;
  extras: Partial<GraphNode>;
}

export function buildGraphData(graphData: GraphResponse): {
  graph: GraphData;
  context: GraphContext;
} {
  const nodesMap: Record<string, Node> = {};
  graphData.nodes.forEach(node => {
    nodesMap[node.id] = node;
  });

  const connectionsMap: Record<string, Connection[]> = {};
  const adjacency: Record<string, GraphAdjacencyEntry[]> = {};
  const nodeTypes: Record<string, GraphNodeType> = {};
  const nodeLabels: Record<string, string> = {};
  const connectionKinds = new Set<RelationType>();
  const availableLevels = new Set<number>();
  const kindRuleIds = new Set<string>();

  const registerAdjacency = (
    src: string,
    dst: string,
    relationKind: RelationType,
    kindRuleId: string,
  ) => {
    if (!adjacency[src]) {
      adjacency[src] = [];
    }
    adjacency[src].push({ nodeId: dst, relationKind, kindRuleId });
  };

  graphData.connections.forEach(connection => {
    if (!connectionsMap[connection.srcNodeId]) {
      connectionsMap[connection.srcNodeId] = [];
    }
    connectionsMap[connection.srcNodeId].push(connection);

    connectionKinds.add(connection.kind);
    availableLevels.add(connection.level);
    if (connection.kindRuleId) {
      kindRuleIds.add(connection.kindRuleId);
    }

    registerAdjacency(connection.srcNodeId, connection.dstNodeId, connection.kind, connection.kindRuleId);
    registerAdjacency(connection.dstNodeId, connection.srcNodeId, connection.kind, connection.kindRuleId);
  });

  graphData.nodes.forEach(node => {
    if (!adjacency[node.id]) {
      adjacency[node.id] = [];
    }
  });

  const resolveNodeMetadata = (node: Node): NodeMetadata => {
    let label = node.kind;
    let type: GraphNodeType = 'default';
    const extras: Partial<GraphNode> = {};

    if (node.kind === NodeKind.File && node.data['File']) {
      const data = node.data['File'];
      label = data.fileName ?? 'file';
      if (data.kind === FileType.Image) {
        type = 'image';
        extras.hash = data.xxh364;
      } else if (data.kind === FileType.Document) {
        type = 'document';
      }
    } else if (node.kind === NodeKind.Folder && node.data['Folder']) {
      const data = node.data['Folder'];
      label = data.folderName ?? 'folder';
      type = 'folder';
    }

    return { label, type, extras };
  };

  const metadataByNodeId: Record<string, NodeMetadata> = {};
  graphData.nodes.forEach(node => {
    const metadata = resolveNodeMetadata(node);
    metadataByNodeId[node.id] = metadata;
    nodeTypes[node.id] = metadata.type;
    nodeLabels[node.id] = metadata.label;
  });

  const nodes: GraphNode[] = [];
  const links: GraphConnection[] = [];

  ((startNodeId: string): string => {
    const stack: Array<{
      origId: string;
      parentNewId?: string;
      via?: Connection;
      depth: number;
      prevLevel?: number;
    }> = [{ origId: startNodeId, depth: 0 }];

    let rootNewId: string | undefined;

    while (stack.length > 0) {
      const { origId, parentNewId, via, prevLevel, depth } = stack.pop()!;

      const newId = createNewId();
      const node = nodesMap[origId];
      const metadata = metadataByNodeId[origId];
      const defaultSize = 14;
      const nodeSize = node.id === graphData.rootNodeId ? defaultSize * 1.6 : defaultSize;

      const newNode: GraphNode = {
        id: newId,
        nodeId: node.id,
        label: metadata.label,
        size: nodeSize,
        type: metadata.type,
        ...metadata.extras,
      };

      newNode.depth = depth;
      newNode.parentConnection = via ?? null;
      newNode.parentGraphNodeId = parentNewId ?? null;

      if (node.id === graphData.rootNodeId) {
        newNode.fx = 0;
        newNode.fy = 0;
      }

      if (!parentNewId && rootNewId === undefined) {
        rootNewId = newId;
      }

      if (parentNewId && via) {
        links.push({
          source: parentNewId,
          target: newId,
          label: via.kind,
          data: via,
        });
      }

      const connections: Connection[] = connectionsMap[origId] ?? [];
      newNode.isLeaf = connections.length === 0;
      nodes.push(newNode);

      for (const connection of connections) {
        if (prevLevel !== 3) {
          stack.push({
            origId: connection.dstNodeId,
            parentNewId: newId,
            via: connection,
            prevLevel: connection.level,
            depth: depth + 1,
          });
        }
      }
    }

    return rootNewId!;
  })(graphData.rootNodeId);

  return {
    graph: {
      nodes,
      links,
    },
    context: {
      adjacency,
      nodeTypes,
      connectionKinds: Array.from(connectionKinds),
      availableLevels: Array.from(availableLevels).sort((a, b) => a - b),
      kindRuleIds: Array.from(kindRuleIds),
      nodeLabels,
    },
  };
}

export function buildGridData(data: GraphResponse): GridData {
  const items = data.nodes.filter(node => node.id !== data.rootNodeId);
  const imageItems: ImageItem[] = [];

  items.forEach(item => {
    if (item.kind === NodeKind.File && item.data['File']) {
      const fileData = item.data['File'];
      if (fileData.kind !== FileType.Image) return;
      imageItems.push({
        id: createNewId(),
        nodeId: item.id,
        name: fileData.fileName,
        type: fileData.kind,
        size: fileData.size,
        hash: fileData.xxh364,
      });
    }
  });

  return { images: imageItems };
}
