import type { AppStartupState } from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const appIpc = {
  loadStartupState: (): Promise<AppStartupState> => invokeCamel('load_app_startup_state'),
  completeInitialLaunch: () => invokeRaw('complete_initial_launch'),
};
