import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../shared/lib/error';
import { ipc } from '../../shared/lib/ipc';
import { useKeybindings } from '../../shared/hooks';
import { useShortcutFocusStore } from '../../shared/lib/keybindings';
import { Button } from '../../shared/ui';
import { ExplorerTreeGroup } from './ExplorerTreeGroup';
import { FOLDERS_NODE_ID } from './explorerTree';
import type { ExplorerCreateFolderRequest, ExplorerFolderDraft, ExplorerNode } from './types';
import './explorer.css';

function buildDefaultExpandedState(nodes: ExplorerNode[]): Record<string, boolean> {
  return nodes.reduce<Record<string, boolean>>((state, node) => {
    if (node.children?.length) {
      state[node.id] = Boolean(node.defaultExpanded);
      Object.assign(state, buildDefaultExpandedState(node.children));
    }

    return state;
  }, {});
}

const FOLDER_NODE_ID_PREFIX = 'folder:';

function getFolderIdFromNodeId(nodeId: string) {
  return nodeId.startsWith(FOLDER_NODE_ID_PREFIX)
    ? nodeId.slice(FOLDER_NODE_ID_PREFIX.length)
    : null;
}

function resolveCreateFolderParentNodeId(focusedNodeId: string) {
  if (focusedNodeId === FOLDERS_NODE_ID) {
    return FOLDERS_NODE_ID;
  }

  if (!focusedNodeId.startsWith(FOLDER_NODE_ID_PREFIX)) {
    return FOLDERS_NODE_ID;
  }

  return focusedNodeId;
}

function findExplorerNodeById(nodes: readonly ExplorerNode[], nodeId: string): ExplorerNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const childNode = node.children ? findExplorerNodeById(node.children, nodeId) : null;
    if (childNode) {
      return childNode;
    }
  }

  return null;
}

type ExplorerPanelProps = {
  nodes: ExplorerNode[];
  activeNodeId: string;
  loading?: boolean;
  error?: string | null;
  importDisabled?: boolean;
  createFolderDisabled?: boolean;
  onNodeSelect: (node: ExplorerNode) => void;
  onImport?: () => void;
  onCreateFolder?: (request: ExplorerCreateFolderRequest) => Promise<void> | void;
  onRetry?: () => void;
};

export function ExplorerPanel({
  nodes,
  activeNodeId,
  loading = false,
  error = null,
  importDisabled = false,
  createFolderDisabled = false,
  onNodeSelect,
  onImport,
  onCreateFolder,
  onRetry,
}: ExplorerPanelProps) {
  const { t } = useTranslation('common');
  const shortcutFocusArea = useShortcutFocusStore(state => state.area);
  const shortcutExplorerNodeId = useShortcutFocusStore(state => state.explorerNodeId);
  const setExplorerNodeId = useShortcutFocusStore(state => state.setExplorerNodeId);
  const focusExplorerNode = useShortcutFocusStore(state => state.focusExplorerNode);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>(() =>
    buildDefaultExpandedState(nodes),
  );
  const [folderDraft, setFolderDraft] = useState<ExplorerFolderDraft | null>(null);
  const focusedNodeId = shortcutExplorerNodeId ?? activeNodeId;

  useEffect(() => {
    setExpandedById(current => ({ ...buildDefaultExpandedState(nodes), ...current }));
  }, [nodes]);

  useEffect(() => {
    if (!shortcutExplorerNodeId) {
      setExplorerNodeId(activeNodeId);
    }
  }, [activeNodeId, setExplorerNodeId, shortcutExplorerNodeId]);

  const handleNodeSelect = useCallback(
    (node: ExplorerNode) => {
      focusExplorerNode(node.id);

      if (node.source || node.view) {
        onNodeSelect(node);
      }

      if (node.children?.length) {
        setExpandedById(current => ({ ...current, [node.id]: !current[node.id] }));
      }
    },
    [focusExplorerNode, onNodeSelect],
  );

  const handleNodeFocus = useCallback(
    (node: ExplorerNode) => {
      focusExplorerNode(node.id);
    },
    [focusExplorerNode],
  );

  const handleAddFolder = useCallback(() => {
    if (!onCreateFolder || loading || createFolderDisabled) {
      return;
    }

    const parentNodeId = resolveCreateFolderParentNodeId(focusedNodeId);

    setFolderDraft({ parentNodeId });
    setExpandedById(current => ({ ...current, [parentNodeId]: true }));
  }, [createFolderDisabled, focusedNodeId, loading, onCreateFolder]);

  const handleNodeExpand = useCallback(() => {
    const focusedNode = findExplorerNodeById(nodes, focusedNodeId);
    if (!focusedNode?.children?.length) {
      return;
    }

    setExpandedById(current => ({ ...current, [focusedNode.id]: true }));
  }, [focusedNodeId, nodes]);

  const handleNodeCollapse = useCallback(() => {
    const focusedNode = findExplorerNodeById(nodes, focusedNodeId);
    if (!focusedNode?.children?.length) {
      return;
    }

    setExpandedById(current => ({ ...current, [focusedNode.id]: false }));
  }, [focusedNodeId, nodes]);

  const handleNodeOpen = useCallback(() => {
    const focusedNode = findExplorerNodeById(nodes, focusedNodeId);
    if (focusedNode) {
      handleNodeSelect(focusedNode);
    }
  }, [focusedNodeId, handleNodeSelect, nodes]);

  const handleNodeRename = useCallback(() => {
    const focusedNode = findExplorerNodeById(nodes, focusedNodeId);
    const folder = focusedNode?.folder;
    if (!folder || folder.kind !== 'user') {
      return;
    }

    const nextName = window.prompt(
      t('explorer.rename_folder_prompt', { defaultValue: 'Rename folder' }),
      folder.name,
    );

    if (!nextName?.trim() || nextName.trim() === folder.name) {
      return;
    }

    void (async () => {
      try {
        await ipc.folder.save({
          id: folder.id,
          name: nextName.trim(),
          parentId: folder.parentId ?? null,
          alias: folder.alias ?? null,
        });
        onRetry?.();
      } catch (nextError) {
        console.error('Failed to rename folder.', nextError);
      }
    })();
  }, [focusedNodeId, nodes, onRetry, t]);

  const handleNodeDelete = useCallback(() => {
    const focusedNode = findExplorerNodeById(nodes, focusedNodeId);
    const folder = focusedNode?.folder;
    if (!folder || folder.kind !== 'user') {
      return;
    }

    const confirmed = window.confirm(
      t('explorer.delete_folder_confirm', {
        folderName: folder.alias?.trim() || folder.name,
        defaultValue: 'Delete this folder?',
      }),
    );

    if (!confirmed) {
      return;
    }

    void (async () => {
      try {
        await ipc.folder.delete({ folderId: folder.id });
        onRetry?.();
      } catch (nextError) {
        console.error('Failed to delete folder.', nextError);
      }
    })();
  }, [focusedNodeId, nodes, onRetry, t]);

  const handleDraftCancel = useCallback(() => {
    setFolderDraft(current => (current?.pending ? current : null));
  }, []);

  const handleDraftCommit = useCallback(
    (name: string) => {
      const parentNodeId = folderDraft?.parentNodeId;
      if (!parentNodeId || !onCreateFolder) {
        setFolderDraft(null);
        return;
      }

      setFolderDraft(current => (current ? { ...current, pending: true, error: null } : current));

      void (async () => {
        try {
          await onCreateFolder({
            parentId: getFolderIdFromNodeId(parentNodeId),
            name,
          });
          setFolderDraft(null);
        } catch (nextError) {
          setFolderDraft(current =>
            current
              ? {
                  ...current,
                  pending: false,
                  error: getErrorMessage(
                    nextError,
                    t('explorer.error.create_folder', {
                      defaultValue: 'Failed to create folder.',
                    }),
                  ),
                }
              : current,
          );
        }
      })();
    },
    [folderDraft?.parentNodeId, onCreateFolder, t],
  );

  const folderActionsDisabled = loading || createFolderDisabled || Boolean(folderDraft);
  const focusedNode = findExplorerNodeById(nodes, focusedNodeId);

  useKeybindings({
    context: {
      explorerFocus: shortcutFocusArea === 'explorer',
      folderSelected: focusedNode?.folder?.kind === 'user',
      inputFocus: Boolean(folderDraft),
      libraryPage: true,
    },
    handlers: {
      'grim.explorer.folder.new': handleAddFolder,
      'grim.explorer.node.collapse': handleNodeCollapse,
      'grim.explorer.node.delete': handleNodeDelete,
      'grim.explorer.node.expand': handleNodeExpand,
      'grim.explorer.node.open': handleNodeOpen,
      'grim.explorer.node.rename': handleNodeRename,
    },
  });

  return (
    <div className="library-explorer">
      <div className="library-explorer__import-action">
        <Button
          className="library-explorer__import-button"
          size="sm"
          width="fill"
          onClick={onImport}
          disabled={importDisabled}
        >
          {t('common.import', { defaultValue: 'Import' })}
        </Button>
      </div>

      <div
        className="library-explorer__tree"
        role="tree"
        aria-label={t('explorer.title', { defaultValue: 'Explorer' })}
      >
        {error ? (
          <div className="library-explorer__state" role="status">
            <p>{error}</p>
            {onRetry ? (
              <Button size="sm" onClick={onRetry}>
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            ) : null}
          </div>
        ) : loading && nodes.length === 0 ? (
          <div className="library-explorer__state" role="status">
            <p>{t('explorer.loading_library', { defaultValue: 'Loading library...' })}</p>
          </div>
        ) : (
          nodes.map(node => (
            <ExplorerTreeGroup
              key={node.id}
              node={node}
              activeNodeId={activeNodeId}
              expandedById={expandedById}
              draft={folderDraft}
              actionsDisabled={folderActionsDisabled}
              onNodeSelect={handleNodeSelect}
              onNodeFocus={handleNodeFocus}
              onAddFolder={handleAddFolder}
              onRefresh={onRetry}
              onDraftCommit={handleDraftCommit}
              onDraftCancel={handleDraftCancel}
            />
          ))
        )}
      </div>
    </div>
  );
}
