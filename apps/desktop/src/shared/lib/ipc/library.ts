import type {
  CroquisPreferences,
  ExplorerSnapshot,
  LibrarySettings,
  LibrarySnapshot,
} from '../../types';
import { invokeCamel } from './core';

export const libraryIpc = {
  loadLibrarySnapshot: () => invokeCamel<LibrarySnapshot>('load_library_snapshot'),
  loadExplorerSnapshot: () => invokeCamel<ExplorerSnapshot>('load_explorer_snapshot'),
  loadSettingsSnapshot: () => invokeCamel<LibrarySettings>('load_settings_snapshot'),
  saveSettings: (payload: LibrarySettings) =>
    invokeCamel<LibrarySettings>('save_library_settings', { payload }),
  loadCroquisPreferencesSnapshot: () =>
    invokeCamel<CroquisPreferences | null>('load_croquis_preferences_snapshot'),
  saveCroquisPreferences: (preferences: CroquisPreferences) =>
    invokeCamel<CroquisPreferences>('save_croquis_preferences', { preferences }),
};
