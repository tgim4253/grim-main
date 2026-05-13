export type ImportSummary = {
  importedCount: number;
  reusedCount: number;
  processedCount: number;
  failedCount: number;
  totalSize: string;
  destinationFolder: string;
};

export type ImportFilePreview = {
  assetCount: number;
  totalSize: string;
};

export type ImportProgress = {
  completed: number;
  total: number;
};
