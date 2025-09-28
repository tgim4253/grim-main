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
  moaId: string;
  option: CroquisOption;
  imageHashes: string[];
  saveOption?: boolean;
  preferences?: CroquisPreferences;
}

export interface CroquisSessionImage {
  hash: string;
  basePath: string;
  baseWidth: number;
  baseHeight: number;
  sourcePath: string;
}

export interface CroquisSession {
  sessionId: string;
  moaId: string;
  option: CroquisOption;
  images: CroquisSessionImage[];
  createdAt: string;
}

export interface CroquisStartResponse {
  sessionId: string;
  windowLabel: string;
}
