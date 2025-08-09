import { create } from 'zustand';
import { FileTreeTypes } from '@tgim/types/index';
import { TreeUtils } from '@tgim/utils/index';

interface FileTreeState {
  treeApi: FileTreeTypes.FileTreeApi | null;
  setTreeApi: (treeApi: FileTreeTypes.FileTreeApi) => void;

  treeData: FileTreeTypes.FileTreeData[];
  setTreeData: (data: FileTreeTypes.FileTreeData[]) => void;

  onMove: (args: {
    dragIds: string[];
    dragNodes: FileTreeTypes.FileNodeApi[];
    parentId: string | null;
    parentNode: FileTreeTypes.FileNodeApi | null;
    index: number;
  }) => void;
}

const useFileTreeStore = create<FileTreeState>((set, get) => ({
  treeApi: null,
  setTreeApi: api => {
    set({ treeApi: api });
  },

  treeData: [],
  setTreeData: data => set({ treeData: data }),

  onMove: args => {
    const { dragIds, parentId, index, dragNodes, parentNode } = args;

    if (dragIds.length === 0) return;
    if (parentNode?.isLeaf) return;
    if (parentId && dragIds.includes(parentId)) return;

    const treeApi = get().treeApi;
    if (!treeApi) return;

    const treeData = get().treeData;
    const removedData = TreeUtils.removeNodes<FileTreeTypes.FileTreeData>(treeData, dragIds);

    const nodesToInsert = dragNodes.map(node => node.data);
    const newData = TreeUtils.insertNodes<FileTreeTypes.FileTreeData>(
      removedData,
      nodesToInsert,
      parentId,
      index,
    );

    set({ treeData: newData });
  },
}));

export default useFileTreeStore;
