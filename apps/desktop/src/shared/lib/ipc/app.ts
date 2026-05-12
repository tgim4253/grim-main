import type { AppStartupState, CompleteInitialLaunchPayload } from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const appIpc = {
  loadStartupState: (): Promise<AppStartupState> => invokeCamel('load_app_startup_state'),
  completeInitialLaunch: (payload: CompleteInitialLaunchPayload) =>
    invokeRaw('complete_initial_launch', { payload }),
};
