import type { CroquisPreferences } from './croquis';

export type AssetType = 'imported_image' | 'linked_external';

export interface LibrarySettings {
  activeSessionPresetId?: string | null;
  croquisPreferences?: CroquisPreferences | null;
}

export interface TagGroup {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  groupId?: string | null;
  name: string;
  color?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagIndex {
  groups: TagGroup[];
  tags: Tag[];
}

export interface VirtualFolder {
  id: string;
  parentId?: string | null;
  name: string;
  fullPath: string;
  alias?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ExplorerSection =
  | 'virtualFolders'
  | 'allAssets'
  | 'uncategorized'
  | 'recentRecords'
  | 'sessions';

export interface AssetSummary {
  id: string;
  type: AssetType;
  hash?: string | null;
  storagePath?: string | null;
  externalPath?: string | null;
  thumbnailPath?: string | null;
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  modifiedAt?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CroquisRecordSummary {
  id: string;
  title: string;
  sourceAssetId?: string | null;
  resultAssetId?: string | null;
  sessionId?: string | null;
  stepIndex?: number | null;
  stepName?: string | null;
  targetDurationSeconds?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDetail {
  id: string;
  type: AssetType;
  hash?: string | null;
  storagePath?: string | null;
  externalPath?: string | null;
  thumbnailPath?: string | null;
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  modifiedAt?: number | null;
  createdAt: string;
  updatedAt: string;
  virtualFolders: VirtualFolder[];
  tags: Tag[];
  relatedRecords: CroquisRecordSummary[];
}

export interface CroquisRecordDetail {
  id: string;
  title: string;
  sourceAssetId?: string | null;
  resultAssetId?: string | null;
  sessionId?: string | null;
  stepIndex?: number | null;
  stepName?: string | null;
  targetDurationSeconds?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  note: string;
  sourceAsset?: AssetSummary | null;
  resultAsset?: AssetSummary | null;
  tags: Tag[];
}

export type AssetListSource =
  | { kind: 'allAssets' }
  | { kind: 'uncategorized' }
  | { kind: 'folder'; folderId: string };

export interface ImportRequest {
  filePaths: string[];
  virtualFolderIds: string[];
  tagIds: string[];
}

export interface ImportResult {
  imported: number;
  reused: number;
  linked: number;
  assets: AssetSummary[];
}

export interface SaveVirtualFolderPayload {
  id?: string | null;
  name: string;
  parentId?: string | null;
  alias?: string | null;
}

export interface SaveVirtualFolderResult {
  savedFolderId: string;
  folders: VirtualFolder[];
}

export interface DeleteVirtualFolderPayload {
  folderId: string;
}

export interface UpdateAssetFoldersPayload {
  assetId: string;
  virtualFolderIds: string[];
}

export interface UpdateAssetTagsPayload {
  assetId: string;
  tagIds: string[];
}

export interface SaveCroquisRecordPayload {
  id?: string | null;
  sourceAssetId?: string | null;
  resultAssetId?: string | null;
  sessionId?: string | null;
  stepIndex?: number | null;
  stepName?: string | null;
  title?: string | null;
  note?: string | null;
  targetDurationSeconds?: number | null;
  tagIds?: string[];
}

export interface FinalizeCroquisRecordPayload {
  recordId: string;
  finishedAt?: string | null;
  finalizedAt?: string | null;
  actualDurationSeconds?: number | null;
}

export interface DeleteCroquisRecordPayload {
  recordId: string;
}

export interface UpdateCroquisRecordTagsPayload {
  recordId: string;
  tagIds: string[];
}

export interface SessionStepPreset {
  id: string;
  stepOrder: number;
  name: string;
  defaultDurationSeconds?: number | null;
  autoTags: Tag[];
  resultRequired: boolean;
}

export interface SessionPreset {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  steps: SessionStepPreset[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionPresetStepDraft {
  id?: string | null;
  name: string;
  stepOrder: number;
  defaultDurationSeconds?: number | null;
  autoTagNames: string[];
  resultRequired: boolean;
}

export interface SaveSessionPresetPayload {
  id?: string | null;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  steps: SessionPresetStepDraft[];
}

export interface DeleteSessionPresetPayload {
  presetId: string;
}

export interface SaveTagGroupPayload {
  id?: string | null;
  name: string;
  sortOrder?: number | null;
}

export interface DeleteTagGroupPayload {
  tagGroupId: string;
}

export interface SaveTagPayload {
  id?: string | null;
  groupId?: string | null;
  name: string;
  color?: string | null;
  sortOrder?: number | null;
}

export interface DeleteTagPayload {
  tagId: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  presetId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  recordCount: number;
  firstRecordId?: string | null;
}

export interface SessionDetail {
  summary: SessionSummary;
  preset?: SessionPreset | null;
  records: CroquisRecordSummary[];
}

export interface ExplorerSnapshot {
  virtualFolders: VirtualFolder[];
  allAssetsCount: number;
  uncategorizedCount: number;
  recentRecords: CroquisRecordSummary[];
  recentSessions: SessionSummary[];
}

export interface LibrarySnapshot {
  settings: LibrarySettings;
  explorer: ExplorerSnapshot;
  sessionPresets: SessionPreset[];
  tagGroups: TagGroup[];
  tags: Tag[];
}
