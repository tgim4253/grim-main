import type { SessionPreset } from './library';

export interface CroquisWindowOption {
  width?: string | null;
  height?: string | null;
}

export interface CroquisAutoOption {
  isSkip: boolean;
}

export interface CroquisTimerOption {
  maxTime: number;
}

export interface CroquisOption {
  window: CroquisWindowOption;
  auto: CroquisAutoOption;
  timer: CroquisTimerOption;
  isCapture: boolean;
  savePath: string;
  isGray: boolean;
  isShuffle: boolean;
}

export interface CroquisPreset {
  id: string;
  name: string;
  option: CroquisOption;
}

export interface CroquisPreferences {
  presets: CroquisPreset[];
  activePresetId: string;
}

export interface CroquisStartPayload {
  assetIds: string[];
  preset: SessionPreset;
  option: CroquisOption;
  saveOption?: boolean;
  preferences?: CroquisPreferences | null;
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
}

export interface CroquisSession {
  sessionId: string;
  title: string;
  option: CroquisOption;
  preset: SessionPreset;
  items: CroquisSessionItem[];
  createdAt: string;
}

export interface CroquisStartResponse {
  sessionId: string;
  windowLabel: string;
}
