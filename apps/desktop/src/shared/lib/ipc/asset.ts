import type {
  AssetDetail,
  AssetListSource,
  AssetSummary,
  UpdateAssetFoldersPayload,
  UpdateAssetTagsPayload,
} from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const assetIpc = {
  list: (source: AssetListSource) => invokeCamel<AssetSummary[]>('list_assets', { source }),
  getDetail: (assetId: string) => invokeCamel<AssetDetail>('get_asset_detail', { assetId }),
  updateFolders: (payload: UpdateAssetFoldersPayload) =>
    invokeCamel<AssetDetail>('update_asset_folders', { payload }),
  updateTags: (payload: UpdateAssetTagsPayload) =>
    invokeCamel<AssetDetail>('update_asset_tags', { payload }),
  revealPath: (path: string) => invokeRaw('reveal_path', { path }),
};
