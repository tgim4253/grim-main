import type {
  ImportPreviewResult,
  ImportRemoteImagesRequest,
  ImportRequest,
  ImportResult,
} from '../../types';
import { invokeCamel } from './core';

export const importIpc = {
  previewImages: (payload: ImportRequest): Promise<ImportPreviewResult> =>
    invokeCamel('preview_import_images', { payload }),
  importImages: (payload: ImportRequest): Promise<ImportResult> =>
    invokeCamel('import_images', { payload }),
  importRemoteImages: (payload: ImportRemoteImagesRequest): Promise<ImportResult> =>
    invokeCamel('import_remote_images', { payload }),
};
