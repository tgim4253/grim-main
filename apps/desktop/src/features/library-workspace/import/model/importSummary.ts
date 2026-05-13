import { formatBytes } from '@/lib/format';
import type { ImportFailure, ImportResult, VirtualFolder } from '@/shared/types';
import type { ImportSummary } from './types';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export function createImportSummary(
  result: ImportResult,
  destinationFolder: VirtualFolder,
): ImportSummary {
  const totalSize = result.assets.reduce((sum, asset) => sum + asset.fileSize, 0);

  return {
    importedCount: result.imported,
    reusedCount: result.reused,
    processedCount: result.imported + result.reused,
    failedCount: result.failed.length,
    totalSize: formatBytes(totalSize),
    destinationFolder: destinationFolder.fullPath || destinationFolder.name,
  };
}

export function formatPreviewFailureMessage(failedCount: number, t: Translate) {
  if (failedCount === 0) {
    return null;
  }

  return t('import.preview_failure_message', {
    count: failedCount,
    formattedCount: failedCount.toLocaleString(),
    defaultValue: '{{formattedCount}} items could not be reviewed and will be skipped.',
  });
}

export function createEmptyImportResult(failed: ImportFailure[] = []): ImportResult {
  return {
    imported: 0,
    reused: 0,
    failed,
    assets: [],
  };
}

export function mergeImportResult(target: ImportResult, source: ImportResult) {
  target.imported += source.imported;
  target.reused += source.reused;
  target.failed.push(...source.failed);
  target.assets.push(...source.assets);
}
