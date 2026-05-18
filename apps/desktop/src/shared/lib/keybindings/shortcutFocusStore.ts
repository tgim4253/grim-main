import { create } from 'zustand';

export type GrimShortcutFocusArea =
  | 'explorer'
  | 'references'
  | 'references.grid'
  | 'references.preview'
  | 'records'
  | 'records.grid'
  | 'records.preview'
  | 'tags'
  | 'presets'
  | 'croquis'
  | 'capture'
  | 'modal'
  | null;

type ShortcutFocusState = {
  area: GrimShortcutFocusArea;
  explorerNodeId: string | null;
  referenceAssetId: string | null;
  recordId: string | null;
  modalDepth: number;
  setArea: (area: GrimShortcutFocusArea) => void;
  setExplorerNodeId: (nodeId: string | null) => void;
  focusExplorerNode: (nodeId: string) => void;
  focusReferenceGrid: (assetId?: string | null) => void;
  focusRecordGrid: (recordId?: string | null) => void;
  setReferenceAssetId: (assetId: string | null) => void;
  setRecordId: (recordId: string | null) => void;
  pushModal: () => void;
  popModal: () => void;
};

export const useShortcutFocusStore = create<ShortcutFocusState>(set => ({
  area: null,
  explorerNodeId: null,
  referenceAssetId: null,
  recordId: null,
  modalDepth: 0,
  setArea: area => {
    set({ area });
  },
  setExplorerNodeId: explorerNodeId => {
    set({ explorerNodeId });
  },
  focusExplorerNode: explorerNodeId => {
    set({ area: 'explorer', explorerNodeId });
  },
  focusReferenceGrid: referenceAssetId => {
    set(state => ({
      area: 'references.grid',
      referenceAssetId: referenceAssetId === undefined ? state.referenceAssetId : referenceAssetId,
    }));
  },
  focusRecordGrid: recordId => {
    set(state => ({
      area: 'records.grid',
      recordId: recordId === undefined ? state.recordId : recordId,
    }));
  },
  setReferenceAssetId: referenceAssetId => {
    set({ referenceAssetId });
  },
  setRecordId: recordId => {
    set({ recordId });
  },
  pushModal: () => {
    set(state => ({ modalDepth: state.modalDepth + 1 }));
  },
  popModal: () => {
    set(state => ({ modalDepth: Math.max(0, state.modalDepth - 1) }));
  },
}));
