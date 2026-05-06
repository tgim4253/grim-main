import type {
  AssetDetail,
  AssetListSource,
  AssetSummary,
  BatchUpdateAssetFoldersPayload,
  UpdateAssetFoldersPayload,
} from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const assetIpc = {
  list: (source: AssetListSource): Promise<AssetSummary[]> =>
    invokeCamel('list_assets', { source }),
  getDetail: (assetId: string): Promise<AssetDetail> =>
    invokeCamel('get_asset_detail', { assetId }),
  updateFolders: (payload: UpdateAssetFoldersPayload) =>
    invokeCamel('update_asset_folders', { payload }),
  batchUpdateFolders: (payload: BatchUpdateAssetFoldersPayload) =>
    invokeCamel('batch_update_asset_folders', { payload }),
  revealPath: (path: string) => invokeRaw('reveal_path', { path }),
};
