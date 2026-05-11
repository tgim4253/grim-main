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
  kind: VirtualFolderKind;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type VirtualFolderKind = 'user' | 'system_uncategorized';

export type ExplorerSection =
  | 'virtualFolders'
  | 'allAssets'
  | 'uncategorized'
  | 'recentRecords'
  | 'sessions';

export interface AssetSummary {
  id: string;
  hash: string;
  storagePath?: string | null;
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

export interface AssetRecordCount {
  assetId: string;
  relatedRecordCount: number;
}

export interface CroquisRecordSummary {
  id: string;
  title: string;
  sourceAssetId?: string | null;
  resultAssetId?: string | null;
  targetDurationSeconds?: number | null;
  actualDurationSeconds?: number | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDetail {
  id: string;
  hash: string;
  storagePath?: string | null;
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
  relatedRecords: CroquisRecordSummary[];
  lastCroquisAt?: string | null;
}

export interface CroquisRecordDetail {
  id: string;
  title: string;
  sourceAssetId?: string | null;
  resultAssetId?: string | null;
  targetDurationSeconds?: number | null;
  actualDurationSeconds?: number | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  note: string;
  sourceAsset?: AssetSummary | null;
  resultAsset?: AssetSummary | null;
  tags: Tag[];
}

export interface CroquisRecordResultsSnapshot {
  records: CroquisRecordSummary[];
  details: CroquisRecordDetail[];
}

export type AssetListSource =
  | { kind: 'allAssets' }
  | { kind: 'uncategorized' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'folderDescendants'; folderId: string };

export interface FolderStats {
  folderId: string;
  directAssetCount: number;
  descendantAssetCount: number;
  childCount: number;
}

export interface ImportRequest {
  filePaths: string[];
  virtualFolderIds: string[];
}

export interface ImportRemoteImagesRequest {
  sources: string[];
  virtualFolderIds: string[];
}

export interface ImportPreviewResult {
  assetCount: number;
  totalSize: number;
  filePaths: string[];
  failed: ImportFailure[];
}

export interface ImportFailure {
  filePath: string;
  error: string;
}

export interface ImportResult {
  imported: number;
  reused: number;
  failed: ImportFailure[];
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

export type BatchUpdateAssetFoldersMode = 'append' | 'replace';

export interface BatchUpdateAssetFoldersPayload {
  assetIds: string[];
  virtualFolderIds: string[];
  mode: BatchUpdateAssetFoldersMode;
}

export interface UpdateAssetTagsPayload {
  assetId: string;
  tagIds: string[];
}

export interface SaveCroquisRecordPayload {
  id?: string | null;
  sourceAssetId?: string | null;
  resultAssetId?: string | null;
  title?: string | null;
  note?: string | null;
  targetDurationSeconds?: number | null;
  tagIds?: string[];
}

export interface FinishCroquisRecordPayload {
  sourceAssetId: string;
  title: string;
  targetDurationSeconds?: number | null;
  actualDurationSeconds: number;
  finishedAt: string;
  tagIds?: string[];
}

export interface DeleteCroquisRecordPayload {
  recordId: string;
}

export interface UpdateCroquisRecordTagsPayload {
  recordId: string;
  tagIds: string[];
}

export interface TimeStepPreset {
  id: string;
  name: string;
  defaultDurationSeconds?: number | null;
  autoAdvance: boolean;
  recordSaveEnabled: boolean;
  captureEnabled: boolean;
  grayscaleEnabled: boolean;
  resultRequired: boolean;
  resultSavePath?: string | null;
  autoTags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionStepPreset {
  id: string;
  timeStepPresetId: string;
  stepOrder: number;
  timeStep: TimeStepPreset;
}

export interface SessionPreset {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  windowWidth?: string | null;
  windowHeight?: string | null;
  isShuffle: boolean;
  autoTags: Tag[];
  steps: SessionStepPreset[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionPresetStepDraft {
  id?: string | null;
  timeStepPresetId: string;
  stepOrder: number;
}

export interface SaveSessionPresetPayload {
  id?: string | null;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  windowWidth?: string | null;
  windowHeight?: string | null;
  isShuffle?: boolean;
  autoTagIds: string[];
  steps: SessionPresetStepDraft[];
}

export interface DeleteSessionPresetPayload {
  presetId: string;
}

export interface SaveTimeStepPresetPayload {
  id?: string | null;
  name: string;
  defaultDurationSeconds?: number | null;
  autoAdvance: boolean;
  recordSaveEnabled: boolean;
  captureEnabled: boolean;
  grayscaleEnabled: boolean;
  resultRequired: boolean;
  resultSavePath?: string | null;
  autoTagIds: string[];
}

export interface DeleteTimeStepPresetPayload {
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
  folderStats: FolderStats[];
  allAssetsCount: number;
  unassignedAssetsCount: number;
  recentRecords: CroquisRecordSummary[];
}

export interface LibrarySnapshot {
  explorer: ExplorerSnapshot;
  sessionPresets: SessionPreset[];
  tagGroups: TagGroup[];
  tags: Tag[];
}
