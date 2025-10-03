declare global {
  interface Window {
    api: {
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, func: (...args: unknown[]) => void) => void;
      once: (channel: string, func: (...args: unknown[]) => void) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
  interface SidebarProps {
    sidebarPosition: 'left' | 'right';
    children?: (args: {
      hidden: boolean;
      size: number;
      setHidden: (h: boolean) => void;
      setSize: (s: number) => void;
    }) => React.ReactNode;
  }
  type Stage =
    | 'Migrating'
    | 'RefreshingMounts'
    | 'ResolvingAnchors'
    | 'InitialScan'
    | 'Ready'
    | 'Error';

  interface AppProgressEvent {
    stage: Stage;
    percent: number;
    note?: string;
  }

  type FolderImportState = 'running' | 'completed' | 'failed';

  interface FolderImportProgressEvent {
    folderId: string;
    state: FolderImportState;
    processedBytes: number;
    totalBytes?: number | null;
    processedFiles: number;
    totalFiles?: number | null;
    elapsedMs: number;
  }

  interface FolderStatusChangeEvent {
    virtualNodeIds: string[];
  }
}

export {};
