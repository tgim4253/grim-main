import { FileTreeData } from '@tgim/types/index';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useHoverOpen,
  useMultiSelect,
  useStandardSensors,
  DragHandle,
  parseDropTarget,
} from '@tgim/dnd/index';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { Button, Modal, NodeList } from '@tgim/ui/index';
import { File, Folder } from 'lucide-react';
import useFileTreeStore from '@tgim/stores/fileTreeStore';
import { useShallow } from 'zustand/shallow';
import NewFolderModal from '../../file/modal/NewFolderModal';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import usePanelsStore from '@tgim/stores/panelStore';
import { listen } from '@tauri-apps/api/event';
import FolderImportProgressModal from '../../file/modal/FolderImportProgressModal';
import FolderOptionsModal from '../../file/modal/FolderOptionsModal';
/* local utils for rendering */

// Find node by id (UI helper)
export const findNode = (tree: FileTreeData[], id: string): FileTreeData | null => {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
};

// Returns a depth map used for indent rendering
const buildDepthMap = (
  tree: FileTreeData[],
  depth = 0,
  map: Map<string, number> = new Map<string, number>(),
): Map<string, number> => {
  for (const n of tree) {
    map.set(n.id, depth);
    if (n.children?.length) buildDepthMap(n.children, depth + 1, map);
  }
  return map;
};

// Returns visible id list based on expanded set
const flattenVisible = (tree: FileTreeData[], expanded: Set<string>): string[] => {
  const out: string[] = [];
  const walk = (nodes: FileTreeData[]) => {
    for (const n of nodes) {
      out.push(n.id);
      if (n.children?.length && expanded.has(n.id)) {
        walk(n.children);
      }
    }
  };
  walk(tree);
  return out;
};

type ImportContext = {
  folderName: string;
  totalBytes: number;
  totalFiles: number;
  startedAt: number;
};

export const FileTree = () => {
  const [activeModal, setActiveModal] = useState<'new-folder' | 'options' | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [optionNode, setOptionNode] = useState<FileTreeData | undefined>(undefined);

  // Select only what we need from the store (shallow compare to reduce re-renders)
  const {
    treeData,
    onMove,
    selectedNodeId,
    setSelectedNode,
    ensureVisible,
    convertToTreeData,
    setTreeData,
  } = useFileTreeStore(
    useShallow(s => ({
      treeData: s.treeData,
      onMove: s.onMove,
      selectedNodeId: s.selectedNodeId,
      setSelectedNode: s.setSelectedNode,
      ensureVisible: s.ensureVisible,
      convertToTreeData: s.convertToTreeData,
      setTreeData: s.setTreeData,
    })),
  );

  const { openFile } = usePanelsStore(useShallow(s => ({ openFile: s.addPanelWithoutContainer })));
  const { moaId } = useMoa(location);

  const refreshTree = useCallback(async () => {
    if (!moaId) return;
    try {
      const graph = await ipc.graph.getGraphOne(moaId, 'root');
      const next = convertToTreeData(graph);
      setTreeData(next);
      if (optionNode) {
        const updated = findNode(next, optionNode.id);
        setOptionNode(updated ?? undefined);
      }
    } catch (err) {
      console.error('Failed to refresh file tree', err);
    }
  }, [convertToTreeData, moaId, optionNode, setTreeData]);

  const handleManualSync = useCallback(async () => {
    if (!moaId || !optionNode) return;
    try {
      setShowActionMenu(false);
      setIsSyncing(true);
      await ipc.file.syncFolder(moaId, optionNode.id);
      await refreshTree();
    } catch (err) {
      console.error('Failed to sync folder', err);
    } finally {
      setIsSyncing(false);
    }
  }, [moaId, optionNode, refreshTree]);

  // Expanded state: open folders initially if they have children
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (nodes: FileTreeData[]) => {
      for (const n of nodes) {
        if (n.children?.length) s.add(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk([]);
    return s;
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  // Multi-select (based on visible order)
  const visibleOrder = useMemo(() => flattenVisible(treeData, expanded), [treeData, expanded]);
  const {
    selected,
    setSelected,
    setAnchorId,
    onItemClick,
    clearSelection: clearLocalSelection,
    onDragStartSelect,
  } = useMultiSelect(visibleOrder);

  const skipSelectedSync = { current: false };
  const manualSelection = { current: false };
  const pendingScrollId = useRef<string | null>(null);

  const updateSelectedNode = useCallback(
    (id: string | null) => {
      skipSelectedSync.current = true;
      manualSelection.current = id !== null;
      setSelectedNode(id);
    },
    [setSelectedNode],
  );

  const handleClearSelection = useCallback(() => {
    clearLocalSelection();
    updateSelectedNode(null);
  }, [clearLocalSelection, updateSelectedNode]);

  // Hover-to-open folder while dragging
  const { hoverId, onDragOverHoverOpen, resetHoverOpen } = useHoverOpen(
    id => {
      setExpanded(prev => new Set(prev).add(id));
    },
    { delay: 700, isValidTarget: () => true },
  );

  // DnD sensors and depth map for rendering
  const sensors = useStandardSensors(4);
  const depthMap = useMemo(() => buildDepthMap(treeData), [treeData]);

  const activeNode = activeId ? findNode(treeData, activeId) : null;

  const handleOptionClick = useCallback(
    (node: FileTreeData | undefined, action: 'menu' | 'options' = 'menu') => {
      if (!node) return;
      setOptionNode(node);
      if (action === 'options') {
        setActiveModal('options');
        setShowActionMenu(false);
      } else {
        setShowActionMenu(true);
      }
    },
    [],
  );

  const [importContext, setImportContext] = useState<ImportContext | null>(null);
  const [importProgress, setImportProgress] = useState<FolderImportProgressEvent | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importContextRef = useRef<ImportContext | null>(null);

  useEffect(() => {
    if (skipSelectedSync.current) {
      skipSelectedSync.current = false;
      return;
    }

    if (!selectedNodeId) {
      clearLocalSelection();
      return;
    }

    setSelected(prev => {
      if (prev.size === 1 && prev.has(selectedNodeId)) return prev;
      return new Set([selectedNodeId]);
    });
    setAnchorId(selectedNodeId);
  }, [selectedNodeId, clearLocalSelection, setAnchorId, setSelected]);

  useEffect(() => {
    if (!selectedNodeId) {
      manualSelection.current = false;
      pendingScrollId.current = null;
      return;
    }

    if (manualSelection.current) {
      manualSelection.current = false;
      pendingScrollId.current = null;
      return;
    }

    const node = findNode(treeData, selectedNodeId);
    if (!node) {
      pendingScrollId.current = selectedNodeId;
      return;
    }

    const ancestors = ensureVisible(selectedNodeId) ?? [];

    setExpanded(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const ancestorId of ancestors) {
        if (!next.has(ancestorId)) {
          next.add(ancestorId);
          changed = true;
        }
      }

      if (node.children && !next.has(node.id)) {
        next.add(node.id);
        changed = true;
      }

      return changed ? next : prev;
    });

    pendingScrollId.current = selectedNodeId;
  }, [selectedNodeId, ensureVisible, treeData]);

  useEffect(() => {
    const targetId = pendingScrollId.current;
    if (!targetId || targetId !== selectedNodeId) return;

    const escapeId =
      typeof window !== 'undefined'
        ? window.CSS.escape(targetId)
        : targetId.replace(/["\\]/g, '\\$&');

    const element = document.querySelector<HTMLElement>(`[data-node-id="${escapeId}"]`);
    if (!element) return;

    pendingScrollId.current = null;
    element.scrollIntoView({ block: 'nearest' });
  }, [expanded, treeData, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!treeData.length) return;

    if (!findNode(treeData, selectedNodeId)) {
      updateSelectedNode(null);
    }
  }, [treeData, selectedNodeId, updateSelectedNode]);

  useEffect(() => {
    importContextRef.current = importContext;
  }, [importContext]);

  useEffect(() => {
    if (!moaId) {
      return;
    }

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        unlisten = await listen<FolderImportProgressEvent>(
          `folder-import://progress/${moaId}`,
          event => {
            const context = importContextRef.current;
            if (!context) {
              return;
            }

            setImportModalOpen(true);
            setImportProgress(prev => {
              const payload = event.payload;
              const totalBytes = payload.totalBytes ?? prev?.totalBytes ?? context.totalBytes;
              const totalFiles = payload.totalFiles ?? prev?.totalFiles ?? context.totalFiles;

              return {
                ...payload,
                totalBytes,
                totalFiles,
              };
            });

            setImportContext(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                totalBytes: event.payload.totalBytes ?? prev.totalBytes,
                totalFiles: event.payload.totalFiles ?? prev.totalFiles,
              };
            });
          },
        );
      } catch (error) {
        console.error('Failed to listen for folder import progress', error);
      }
    };

    void setup();

    return () => {
      unlisten?.();
    };
  }, [moaId]);

  useEffect(() => {
    if (!moaId) {
      return;
    }

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        unlisten = await listen<FolderStatusChangeEvent>(`folder-status://changed/${moaId}`, () => {
          void refreshTree();
        });
      } catch (error) {
        console.error('Failed to listen for folder status updates', error);
      }
    };

    void setup();

    return () => {
      unlisten?.();
    };
  }, [moaId, refreshTree]);

  const handleImportModalClose = () => {
    setImportModalOpen(false);
    setImportProgress(null);
    setImportContext(null);
  };

  return (
    <div className="w-full h-full text-sidebar-text" onClick={handleClearSelection}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => {
          const id = String(active.id);
          setActiveId(id);
          onDragStartSelect(id);
          updateSelectedNode(id);
        }}
        onDragCancel={() => {
          setActiveId(null);
          resetHoverOpen();
        }}
        onDragOver={({ over, active }) => {
          onDragOverHoverOpen(over?.id, [String(active.id)]);
        }}
        onDragEnd={({ active, over }) => {
          setActiveId(null);
          const target = parseDropTarget(over?.id);
          if (!target) return;
          const targetParent = target.id; // "root" or folder id

          // Move all selected (or the active one) into target container (append)
          const ids = selected.size ? Array.from(selected) : [String(active.id)];

          onMove({
            dragIds: ids,
            parentId: targetParent,
            index: 0, // currently unused; kept for API compatibility
          });

          // Expand the drop target if it is not the root
          setExpanded(prev => (targetParent !== 'root' ? new Set(prev).add(targetParent) : prev));

          resetHoverOpen();
        }}
      >
        <NodeList
          parentId="root"
          nodes={treeData}
          expandedSet={expanded}
          onToggle={id => {
            setExpanded(prev => {
              const n = new Set(prev);
              if (n.has(id)) {
                n.delete(id);
              } else {
                n.add(id);
              }
              return n;
            });
          }}
          depthMap={depthMap}
          dragging={!!activeId}
          hoverId={hoverId}
          selectedSet={selected}
          onSelect={(e: React.MouseEvent, id: string) => {
            onItemClick(e, id);
            updateSelectedNode(id);
          }}
          openFile={(node: FileTreeData) => {
            updateSelectedNode(node.id);
            openFile({
              nodeId: node.id,
              name: node.name,
            });
          }}
          onClickOption={handleOptionClick}
        />

        <DragOverlay dropAnimation={null}>
          {activeNode ? (
            <DragHandle>
              {activeNode.icon === 'folder' ? (
                <Folder className="size-3.5" />
              ) : (
                <File className="size-3.5" />
              )}
            </DragHandle>
          ) : null}
        </DragOverlay>
      </DndContext>
      {showActionMenu && optionNode ? (
        <Modal
          onClose={() => {
            setShowActionMenu(false);
            setOptionNode(undefined);
          }}
          className="bg-modal-bg max-w-xs"
        >
          <div className="flex flex-col gap-3 text-modal-text">
            <h3 className="text-lg font-semibold">폴더 작업</h3>
            <Button
              variant="default"
              onClick={() => {
                setShowActionMenu(false);
                setActiveModal('new-folder');
              }}
            >
              새 폴더 만들기
            </Button>
            <Button variant="default" onClick={() => void handleManualSync} disabled={isSyncing}>
              폴더/파일 업서트
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowActionMenu(false);
                setActiveModal('options');
              }}
            >
              옵션 열기
            </Button>
          </div>
        </Modal>
      ) : null}

      {activeModal === 'new-folder' && (
        <Modal
          onClose={() => {
            setActiveModal(null);
          }}
          className="bg-modal-bg"
        >
          <NewFolderModal
            onClose={() => {
              setActiveModal(null);
              setOptionNode(undefined);
            }}
            onSubmit={async d => {
              if (!moaId) return;
              const hasPath = Boolean(d.path);
              if (hasPath) {
                const context: ImportContext = {
                  folderName: d.name,
                  totalBytes: d.expectedBytes,
                  totalFiles: d.expectedFiles,
                  startedAt: Date.now(),
                };
                importContextRef.current = context;
                setImportContext(context);
                setImportProgress({
                  folderId: '',
                  state: 'running',
                  processedBytes: 0,
                  totalBytes: d.expectedBytes,
                  processedFiles: 0,
                  totalFiles: d.expectedFiles,
                  elapsedMs: 0,
                });
                setImportModalOpen(true);
              }
              try {
                await ipc.graph.createFolder(moaId, {
                  name: d.name,
                  path: d.path,
                  parent_id: optionNode?.id ?? 'root',
                  selection: d.selection,
                  expectedBytes: d.expectedBytes,
                  expectedFiles: d.expectedFiles,
                });
                await refreshTree();
                setActiveModal(null);
              } catch (err) {
                if (hasPath) {
                  setImportModalOpen(false);
                  setImportProgress(null);
                  setImportContext(null);
                }
                console.error(err);
                throw err;
              }
            }}
          />
        </Modal>
      )}
      {activeModal === 'options' && optionNode ? (
        <FolderOptionsModal
          node={optionNode}
          moaId={moaId ?? ''}
          onClose={() => {
            setActiveModal(null);
            setOptionNode(undefined);
          }}
          onUpdated={() => void refreshTree()}
        />
      ) : null}
      {isSyncing ? (
        <Modal
          onClose={() => {
            setIsSyncing(false);
          }}
          dismissible={false}
          className="bg-modal-bg max-w-xs text-center text-modal-text"
        >
          <div className="space-y-2 py-6">
            <p className="text-sm">동기화 중입니다...</p>
          </div>
        </Modal>
      ) : null}
      {importModalOpen && importProgress && importContext ? (
        <FolderImportProgressModal
          progress={importProgress}
          onClose={handleImportModalClose}
          folderName={importContext.folderName}
          totalBytesFallback={importContext.totalBytes}
          totalFilesFallback={importContext.totalFiles}
          startedAt={importContext.startedAt}
        />
      ) : null}
    </div>
  );
};

export default FileTree;
