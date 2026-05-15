import { describe, expect, it } from 'vitest';
import type { AssetSummary, ImportResult, VirtualFolder } from '@/shared/types';
import {
  createEmptyImportResult,
  createImportSummary,
  formatPreviewFailureMessage,
  mergeImportResult,
} from './importSummary';

const now = '2026-01-01T00:00:00.000Z';

function asset(id: string, fileSize: number): AssetSummary {
  return {
    id,
    hash: `${id}-hash`,
    fileName: `${id}.png`,
    fileSize,
    createdAt: now,
    updatedAt: now,
  };
}

function folder(overrides: Partial<VirtualFolder> = {}): VirtualFolder {
  return {
    id: 'folder-1',
    name: 'Sketches',
    fullPath: '/Library/Sketches',
    kind: 'user',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('import summary model', () => {
  it('creates summary counts and formats total asset size', () => {
    const result: ImportResult = {
      imported: 2,
      reused: 1,
      failed: [{ filePath: '/bad.png', error: 'bad' }],
      assets: [asset('a', 1024), asset('b', 512)],
    };

    expect(createImportSummary(result, folder())).toEqual({
      importedCount: 2,
      reusedCount: 1,
      processedCount: 3,
      failedCount: 1,
      totalSize: '1.50 KB',
      destinationFolder: '/Library/Sketches',
    });
  });

  it('falls back to folder name when fullPath is empty', () => {
    expect(
      createImportSummary(createEmptyImportResult(), folder({ fullPath: '' })).destinationFolder,
    ).toBe('Sketches');
  });

  it('formats preview failure messages only when failures exist', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
      `${key}:${String(options?.formattedCount)}`;

    expect(formatPreviewFailureMessage(0, t)).toBeNull();
    expect(formatPreviewFailureMessage(12, t)).toBe('import.preview_failure_message:12');
  });

  it('creates empty results and merges import result batches in place', () => {
    const target = createEmptyImportResult([{ filePath: '/old.png', error: 'old' }]);

    mergeImportResult(target, {
      imported: 1,
      reused: 2,
      failed: [{ filePath: '/new.png', error: 'new' }],
      assets: [asset('new', 1)],
    });

    expect(target).toEqual({
      imported: 1,
      reused: 2,
      failed: [
        { filePath: '/old.png', error: 'old' },
        { filePath: '/new.png', error: 'new' },
      ],
      assets: [asset('new', 1)],
    });
  });
});
