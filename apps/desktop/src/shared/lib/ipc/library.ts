import type { CroquisPreferences, LibrarySettings, LibrarySnapshot } from '../../types';
import { invokeCamel } from './core';

export const libraryIpc = {
  loadSnapshot: () => invokeCamel<LibrarySnapshot>('load_library_snapshot'),
  loadSettings: () => invokeCamel<LibrarySettings>('load_library_settings'),
  saveSettings: (payload: LibrarySettings) =>
    invokeCamel<LibrarySettings>('save_library_settings', { payload }),
  loadCroquisPreferences: () => invokeCamel<CroquisPreferences | null>('load_croquis_preferences'),
  saveCroquisPreferences: (preferences: CroquisPreferences) =>
    invokeCamel<CroquisPreferences>('save_croquis_preferences', { preferences }),
};
