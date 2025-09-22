export interface CroquisWindowOption {
  width?: string | null;
  height?: string | null;
}

export interface CroquisAutoOption {
  skip: boolean;
  save: boolean;
  capture: boolean;
}

export interface CroquisTimerOption {
  maxTime: number;
}

export interface CroquisOption {
  window: CroquisWindowOption;
  auto: CroquisAutoOption;
  timer: CroquisTimerOption;
  capture: boolean;
  savePath: string;
  saveFolder: string;
  grayOption: boolean;
  shuffleOption: boolean;
}

export interface CroquisStartPayload {
  moaId: string;
  option: CroquisOption;
  imageHashes: string[];
  saveOption?: boolean;
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
