import { NodeFile } from './graph';

export interface CreateDocumentPayload {
  moaId: string;
  anchorNodeId: string;
  baseName?: string | null;
}

export interface LoadDocumentPayload {
  moaId: string;
  nodeId: string;
}

export interface DocumentData {
  nodeId: string;
  fileName: string;
  markdown: string;
}

export interface UpdateDocumentPayload {
  moaId: string;
  nodeId: string;
  markdown: string;
  baseName?: string | null;
}

export interface DocumentUpdateResult {
  file: NodeFile;
}
