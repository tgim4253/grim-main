import type {
  DeleteVirtualFolderPayload,
  SaveVirtualFolderPayload,
  SaveVirtualFolderResult,
  VirtualFolder,
} from '../../types';
import { invokeCamel } from './core';

export const folderIpc = {
  save: (payload: SaveVirtualFolderPayload) =>
    invokeCamel<SaveVirtualFolderResult>('save_virtual_folder', { payload }),
  delete: (payload: DeleteVirtualFolderPayload) =>
    invokeCamel<VirtualFolder[]>('delete_virtual_folder', { payload }),
  search: (query: string) => invokeCamel<VirtualFolder[]>('search_virtual_folders', { query }),
};
