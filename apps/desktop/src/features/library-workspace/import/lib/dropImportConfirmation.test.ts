import { describe, expect, it } from 'vitest';
import type { DroppedFileDataSource } from '../dropFileData';
import { getDropImportWarning } from './dropImportConfirmation';

function file(name: string) {
  return new File(['x'], name, { type: 'image/png' });
}

function source(count: number): DroppedFileDataSource {
  return {
    kind: 'files',
    files: Array.from({ length: count }, (_, index) => file(`image-${String(index)}.png`)),
  };
}

describe('getDropImportWarning', () => {
  it('returns null when local and remote counts stay under the threshold', async () => {
    await expect(
      getDropImportWarning({ localSource: source(2), remoteItemCount: 1, threshold: 5 }),
    ).resolves.toBeNull();
  });

  it('returns an exact remote warning when remote count alone exceeds the threshold', async () => {
    await expect(getDropImportWarning({ remoteItemCount: 6, threshold: 5 })).resolves.toEqual({
      countIsExact: true,
      itemCount: 6,
    });
  });

  it('returns an exact combined warning when local count is exact', async () => {
    await expect(
      getDropImportWarning({ localSource: source(4), remoteItemCount: 2, threshold: 5 }),
    ).resolves.toEqual({
      countIsExact: true,
      itemCount: 6,
    });
  });

  it('marks entry counts as inexact when the candidate limit is reached', async () => {
    const entrySource: DroppedFileDataSource = {
      kind: 'entries',
      entries: [
        {
          isFile: true,
          isDirectory: false,
          name: 'a.png',
          file: (success: (file: File) => void) => success(file('a.png')),
        },
      ] as DroppedFileDataSource['entries'],
    };

    await expect(
      getDropImportWarning({ localSource: entrySource, remoteItemCount: 5, threshold: 5 }),
    ).resolves.toEqual({
      countIsExact: false,
      itemCount: undefined,
    });
  });
});
