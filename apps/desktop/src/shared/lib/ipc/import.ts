import type { ImportRequest, ImportResult } from '../../types';
import { invokeCamel } from './core';

export const importIpc = {
  importImages: (payload: ImportRequest) => invokeCamel<ImportResult>('import_images', { payload }),
  linkExternalFiles: (payload: ImportRequest) =>
    invokeCamel<ImportResult>('link_external_files', { payload }),
};
