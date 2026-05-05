import type { ExplorerSnapshot, LibrarySnapshot } from '../../types';
import { invokeCamel } from './core';

export const libraryIpc = {
  loadLibrarySnapshot: (): Promise<LibrarySnapshot> => invokeCamel('load_library_snapshot'),
  loadExplorerSnapshot: (): Promise<ExplorerSnapshot> => invokeCamel('load_explorer_snapshot'),
};
