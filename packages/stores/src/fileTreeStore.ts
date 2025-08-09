import { create } from 'zustand';
import { FileTreeApi, FileTreeData, FileNodeApi } from '@tgim/types/index';
import { TreeUtils } from '@tgim/utils/index';

interface FileTreeState {
  treeApi: FileTreeApi | null;
  setTreeApi: (treeApi: FileTreeApi) => void;

  treeData: FileTreeData[];
  setTreeData: (data: FileTreeData[]) => void;

  onMove: (args: {
    dragIds: string[];
    dragNodes: FileNodeApi[];
    parentId: string | null;
    parentNode: FileNodeApi | null;
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
    const removedData = TreeUtils.removeNodes<FileTreeData>(treeData, dragIds);

    const nodesToInsert = dragNodes.map(node => node.data);
    const newData = TreeUtils.insertNodes<FileTreeData>(
      removedData,
      nodesToInsert,
      parentId,
      index,
    );

    set({ treeData: newData });
  },
}));

export default useFileTreeStore;
