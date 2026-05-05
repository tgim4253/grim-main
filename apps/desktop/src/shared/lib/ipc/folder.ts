import type {
  DeleteVirtualFolderPayload,
  SaveVirtualFolderPayload,
  SaveVirtualFolderResult,
  VirtualFolder,
} from '../../types';
import { invokeCamel } from './core';

export const folderIpc = {
  save: (payload: SaveVirtualFolderPayload): Promise<SaveVirtualFolderResult> =>
    invokeCamel('save_virtual_folder', { payload }),
  delete: (payload: DeleteVirtualFolderPayload): Promise<VirtualFolder[]> =>
    invokeCamel('delete_virtual_folder', { payload }),
  search: (query: string): Promise<VirtualFolder[]> =>
    invokeCamel('search_virtual_folders', { query }),
};
