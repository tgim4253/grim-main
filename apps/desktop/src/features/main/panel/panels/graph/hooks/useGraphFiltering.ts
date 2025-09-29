import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Connection,
  GraphConnection,
  GraphData,
  GraphNode,
} from '@tgim/types/graph';
import { GraphOption } from '@tgim/types/graph-settings';
import { GraphContext } from '../../../types';

interface Params {
  graphData: GraphData;
  rootGraphNodeId: string;
  graphOption: GraphOption;
  graphContext: GraphContext;
}

export function useGraphFiltering({
  graphData,
  rootGraphNodeId,
  graphOption,
  graphContext,
}: Params) {
  const nodesById = useMemo(() => {
    const nodesById = Object.fromEntries(graphData.nodes.map(node => [node.id, node]));

    graphData.nodes.forEach(node => {
      node.isHidden = false;
      node.childLinks = [];
    });

    graphData.links.forEach(link => {
      const source = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
      if (source) {
        nodesById[source].childLinks.push(link);
      }
    });

    return nodesById;
  }, [graphData.links, graphData.nodes]);

  const normaliseLinkNodeId = useCallback((value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'object' && 'id' in (value as GraphNode)) {
      return (value as GraphNode).id;
    }
    return String(value);
  }, []);

  const getPrunedTree = useCallback(() => {
    const visibleNodes: GraphNode[] = [];
    const visibleLinks: GraphConnection[] = [];

    const startNode = nodesById[rootGraphNodeId];
    if (!startNode) {
      return { nodes: [], links: [] };
    }

    (function traverseTree(node: GraphNode) {
      visibleNodes.push(node);
      const filteredLinks = node.childLinks.filter((link: GraphConnection) => {
        const targetId = normaliseLinkNodeId(link.target);
        const target = nodesById[targetId];
        return target ? !target.isHidden : false;
      });
      visibleLinks.push(...filteredLinks);
      filteredLinks
        .map(link => {
          const targetId = normaliseLinkNodeId(link.target);
          return nodesById[targetId];
        })
        .filter(Boolean)
        .forEach(traverseTree);
    })(startNode);

    return { nodes: visibleNodes, links: visibleLinks };
  }, [nodesById, normaliseLinkNodeId, rootGraphNodeId]);

  const [prunedTree, setPrunedTree] = useState(() => getPrunedTree());

  useEffect(() => {
    setPrunedTree(getPrunedTree());
  }, [getPrunedTree]);

  const incomingByTarget = useMemo(() => {
    const map = new Map<string, GraphConnection>();
    graphData.links.forEach(link => {
      const targetId = normaliseLinkNodeId(link.target);
      if (targetId) {
        map.set(targetId, link);
      }
    });
    return map;
  }, [graphData.links, normaliseLinkNodeId]);

  const evaluateClauses = useCallback(
    (node: GraphNode, connection: Connection | undefined): boolean => {
      if (!graphOption.clauses.length) return true;

      const adjacency = graphContext.adjacency[node.nodeId] ?? [];

      return graphOption.clauses.every(clause => {
        const include = clause.include;
        if (clause.type === 'linkedToNode') {
          const isConnected =
            node.nodeId === clause.nodeId ||
            adjacency.some(entry => entry.nodeId === clause.nodeId);
          return include ? isConnected : !isConnected;
        }

        if (clause.type === 'linkedViaKind') {
          const hasKind =
            (connection && connection.kind === clause.relationKind) ||
            adjacency.some(entry => entry.relationKind === clause.relationKind);
          return include ? hasKind : !hasKind;
        }

        if (clause.type === 'linkedViaNodeKind') {
          const hasNodeKind =
            graphContext.nodeTypes[node.nodeId] === clause.nodeKind ||
            adjacency.some(entry => graphContext.nodeTypes[entry.nodeId] === clause.nodeKind);
          return include ? hasNodeKind : !hasNodeKind;
        }

        return true;
      });
    },
    [graphContext.adjacency, graphContext.nodeTypes, graphOption.clauses],
  );

  useEffect(() => {
    graphData.nodes.forEach(node => {
      let hidden = false;

      if (node.id !== rootGraphNodeId) {
        const inbound = incomingByTarget.get(node.id);
        const connection = inbound?.data;

        if (
          graphOption.maxDepth !== null &&
          typeof node.depth === 'number' &&
          node.depth > graphOption.maxDepth
        ) {
          hidden = true;
        }

        if (graphOption.hideLevelTwoNodes && connection && connection.level === 2) {
          hidden = true;
        }

        if (connection) {
          const perKindLevels = graphOption.perKindLevels[connection.kindRuleId];
          if (perKindLevels && perKindLevels.length > 0) {
            if (!perKindLevels.includes(connection.level)) {
              hidden = true;
            }
          } else if (
            graphOption.visibleLevels.length > 0 &&
            !graphOption.visibleLevels.includes(connection.level)
          ) {
            hidden = true;
          }

          if (
            graphOption.connectionKinds.include.length > 0 &&
            !graphOption.connectionKinds.include.includes(connection.kind)
          ) {
            hidden = true;
          }

          if (graphOption.connectionKinds.exclude.includes(connection.kind)) {
            hidden = true;
          }
        }

        if (
          graphOption.nodeKinds.include.length > 0 &&
          !graphOption.nodeKinds.include.includes(node.type)
        ) {
          hidden = true;
        }

        if (graphOption.nodeKinds.exclude.includes(node.type)) {
          hidden = true;
        }

        if (!evaluateClauses(node, connection)) {
          hidden = true;
        }
      }

      node.isHidden = hidden;
    });

    setPrunedTree(getPrunedTree());
  }, [
    evaluateClauses,
    getPrunedTree,
    graphData.nodes,
    graphOption,
    incomingByTarget,
    rootGraphNodeId,
  ]);

  return { prunedTree, setPrunedTree, getPrunedTree, incomingByTarget };
}
