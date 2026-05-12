export interface AppStartupState {
  isInitialLaunch: boolean;
}

export type AppLanguageCode = 'en' | 'ko' | 'jp';

export interface CompleteInitialLaunchPayload {
  templateStartEnabled: boolean;
  language: AppLanguageCode;
}
