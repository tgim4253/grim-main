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
import { NodeList, getVisibleNodeIds } from '@tgim/ui/index';
import { File, Folder } from 'lucide-react';
import useFileTreeStore from '@tgim/stores/fileTreeStore';
import { useShallow } from 'zustand/shallow';
import { Modal } from '@tgim/ui/index';
import NewFolderModal from '../../file/modal/NewFolderModal';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import usePanelsStore from '@tgim/stores/panelStore';
import { listen } from '@tauri-apps/api/event';
import FolderImportProgressModal from '../../file/modal/FolderImportProgressModal';

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

type ImportContext = {
  folderName: string;
  totalBytes: number;
  totalFiles: number;
  startedAt: number;
};

export const FileTree = () => {
  const [isFolderModal, setIsFolderModal] = useState(false);

  // Select only what we need from the store (shallow compare to reduce re-renders)
  const { treeData, onMove, selectedNodeId, setSelectedNode, ensureVisible } = useFileTreeStore(
    useShallow(s => ({
      treeData: s.treeData,
      onMove: s.onMove,
      selectedNodeId: s.selectedNodeId,
      setSelectedNode: s.setSelectedNode,
      ensureVisible: s.ensureVisible,
    })),
  );

  const { openFile } = usePanelsStore(useShallow(s => ({ openFile: s.addPanelWithoutContainer })));

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
  const visibleOrder = useMemo(() => getVisibleNodeIds(treeData, expanded), [treeData, expanded]);
  const {
    selected,
    setSelected,
    setAnchorId,
    onItemClick,
    clearSelection: clearLocalSelection,
    onDragStartSelect,
  } = useMultiSelect(visibleOrder);

  const skipSelectedSync = useRef(false);
  const manualSelection = useRef(false);
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
    id => setExpanded(prev => new Set(prev).add(id)),
    { delay: 700, isValidTarget: () => true },
  );

  // DnD sensors and depth map for rendering
  const sensors = useStandardSensors(4);

  const activeNode = activeId ? findNode(treeData, activeId) : null;

  const [optionNode, setOptionNode] = useState<FileTreeData | undefined>(undefined);

  const onOptionClick = (node: FileTreeData | undefined) => {
    if (!node) return;
    setOptionNode(node);
    if (!isFolderModal) setIsFolderModal(true);
  };

  const { moaId } = useMoa(location);

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
      typeof window !== 'undefined' && window.CSS?.escape
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
          depth={0}
          nodes={treeData}
          expandedSet={expanded}
          onToggle={id => {
            console.log(id);
            setExpanded(prev => {
              const n = new Set(prev);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            });
          }}
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
          onClickOption={onOptionClick}
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
      {isFolderModal && (
        <Modal onClose={() => setIsFolderModal(false)} className="bg-modal-bg">
          <NewFolderModal
            onClose={() => setIsFolderModal(false)}
            onSubmit={async d => {
              if (!moaId) return;
              const hasPath = Boolean(d.path);
              if (hasPath) {
                const context: ImportContext = {
                  folderName: d.name,
                  totalBytes: d.expectedBytes ?? 0,
                  totalFiles: d.expectedFiles ?? 0,
                  startedAt: Date.now(),
                };
                importContextRef.current = context;
                setImportContext(context);
                setImportProgress({
                  folderId: '',
                  state: 'running',
                  processedBytes: 0,
                  totalBytes: d.expectedBytes ?? 0,
                  processedFiles: 0,
                  totalFiles: d.expectedFiles ?? 0,
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
