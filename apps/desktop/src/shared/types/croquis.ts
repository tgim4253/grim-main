export interface CroquisRuntimeStep {
  stepId: string;
  timeStepPresetId?: string | null;
  stepOrder: number;
  name: string;
  defaultDurationSeconds?: number | null;
  tagIds: string[];
  autoAdvance: boolean;
  recordSaveEnabled: boolean;
  captureEnabled: boolean;
  grayscaleEnabled: boolean;
  resultRequired: boolean;
  resultSavePath?: string | null;
}

export interface CroquisStartPayload {
  assetIds: string[];
  presetId: string;
  presetName: string;
  windowWidth?: string | null;
  windowHeight?: string | null;
  isShuffle: boolean;
  steps: CroquisRuntimeStep[];
}

export interface CroquisSessionItem {
  itemId: string;
  recordId?: string | null;
  assetId: string;
  title: string;
  tagIds: string[];
  fileName: string;
  hash?: string | null;
  basePath: string;
  baseWidth: number;
  baseHeight: number;
  sourcePath: string;
  stepName: string;
  stepIndex: number;
  targetDurationSeconds?: number | null;
  autoAdvance: boolean;
  recordSaveEnabled: boolean;
  captureEnabled: boolean;
  grayscaleEnabled: boolean;
  resultRequired: boolean;
  resultSavePath?: string | null;
}

export interface CroquisSession {
  sessionId: string;
  title: string;
  presetId: string;
  presetName: string;
  windowWidth?: string | null;
  windowHeight?: string | null;
  isShuffle: boolean;
  items: CroquisSessionItem[];
  createdAt: string;
}

export interface CroquisStartResponse {
  sessionId: string;
  windowLabel: string;
}
