import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

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
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>(() =>
    buildDefaultExpandedState(nodes),
  );
  const [focusedNodeId, setFocusedNodeId] = useState(activeNodeId);
  const [folderDraft, setFolderDraft] = useState<ExplorerFolderDraft | null>(null);

  useEffect(() => {
    setExpandedById(current => ({ ...buildDefaultExpandedState(nodes), ...current }));
  }, [nodes]);

  useEffect(() => {
    setFocusedNodeId(activeNodeId);
  }, [activeNodeId]);

  const handleNodeSelect = useCallback(
    (node: ExplorerNode) => {
      setFocusedNodeId(node.id);

      if (node.source || node.view) {
        onNodeSelect(node);
      }

      if (node.children?.length) {
        setExpandedById(current => ({ ...current, [node.id]: !current[node.id] }));
      }
    },
    [onNodeSelect],
  );

  const handleNodeFocus = useCallback((node: ExplorerNode) => {
    setFocusedNodeId(node.id);
  }, []);

  const handleAddFolder = useCallback(() => {
    if (!onCreateFolder || loading || createFolderDisabled) {
      return;
    }

    const parentNodeId = resolveCreateFolderParentNodeId(focusedNodeId);

    setFolderDraft({ parentNodeId });
    setExpandedById(current => ({ ...current, [parentNodeId]: true }));
  }, [createFolderDisabled, focusedNodeId, loading, onCreateFolder]);

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
