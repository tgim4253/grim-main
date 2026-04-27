import type { ImportPreviewResult, ImportRequest, ImportResult } from '../../types';
import { invokeCamel } from './core';

export const importIpc = {
  previewImages: (payload: ImportRequest) =>
    invokeCamel<ImportPreviewResult>('preview_import_images', { payload }),
  importImages: (payload: ImportRequest) => invokeCamel<ImportResult>('import_images', { payload }),
};
