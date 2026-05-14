import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../i18n', () => ({
  default: {
    t: (_key: string, options?: Record<string, unknown>) => {
      const template = typeof options?.defaultValue === 'string' ? options.defaultValue : _key;
      return template.replace(/{{(\w+)}}/g, (_match, key: string) =>
        String(options?.[key] ?? _match),
      );
    },
  },
}));
import {
  MAX_DROP_IMAGE_BYTES,
  collectSupportedDroppedImageFiles,
  countDroppedImageFileCandidates,
  fileToDataImageSource,
  formatDroppedImageFileWarnings,
  getImageMimeType,
  hasFileDropData,
  type DroppedFileDataSource,
} from './dropFileData';

function file(
  name: string,
  options: { type?: string; content?: string; lastModified?: number } = {},
) {
  return new File([options.content ?? 'x'], name, {
    type: options.type ?? '',
    lastModified: options.lastModified ?? 1,
  });
}

function oversizedImage() {
  const image = file('huge.png');
  Object.defineProperty(image, 'size', { value: MAX_DROP_IMAGE_BYTES + 1 });
  return image;
}

type TestEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void) => void;
  createReader?: () => { readEntries: (success: (entries: TestEntry[]) => void) => void };
};

function fileEntry(imageFile: File): TestEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: imageFile.name,
    file: success => success(imageFile),
  };
}

function directoryEntry(name: string, batches: TestEntry[][]): TestEntry {
  let index = 0;

  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: success => {
        success(batches[index] ?? []);
        index += 1;
      },
    }),
  };
}

describe('drop file data helpers', () => {
  it('detects file drops from DataTransfer types', () => {
    expect(hasFileDropData({ types: ['Files'] } as unknown as DataTransfer)).toBe(true);
    expect(hasFileDropData({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
  });

  it('detects image MIME from extension first, then file type fallback', () => {
    expect(getImageMimeType(file('photo.JPG', { type: 'application/octet-stream' }))).toBe(
      'image/jpeg',
    );
    expect(getImageMimeType(file('no-extension', { type: 'image/png;charset=utf-8' }))).toBe(
      'image/png',
    );
    expect(getImageMimeType(file('notes.txt', { type: 'text/plain' }))).toBeNull();
  });

  it('collects supported files, removes duplicates, and counts skipped files', async () => {
    const duplicate = file('a.png', { lastModified: 10 });
    const collection = await collectSupportedDroppedImageFiles({
      kind: 'files',
      files: [duplicate, duplicate, file('b.txt'), oversizedImage(), file('c.webp')],
    });

    expect(collection.files.map(imageFile => imageFile.name)).toEqual(['a.png', 'c.webp']);
    expect(collection.unsupportedCount).toBe(1);
    expect(collection.oversizedCount).toBe(1);
  });

  it('recursively counts entry candidates and marks limited counts as inexact', async () => {
    const source: DroppedFileDataSource = {
      kind: 'entries',
      entries: [
        directoryEntry('root', [
          [fileEntry(file('a.png')), fileEntry(file('b.jpg')), fileEntry(file('c.txt'))],
          [fileEntry(file('d.webp'))],
        ]),
      ] as unknown as Extract<DroppedFileDataSource, { kind: 'entries' }>['entries'],
    };

    await expect(countDroppedImageFileCandidates(source, 2)).resolves.toEqual({
      count: 2,
      exact: false,
    });
  });

  it('converts dropped image files to data image sources', async () => {
    await expect(fileToDataImageSource(file('hello world.png', { content: 'abc' }))).resolves.toBe(
      'data:image/png;name=hello%20world.png;base64,YWJj',
    );
    await expect(
      fileToDataImageSource(file('notes.txt', { type: 'text/plain' })),
    ).resolves.toBeNull();
    await expect(fileToDataImageSource(oversizedImage())).rejects.toThrow('huge.png');
  });

  it('formats warning messages for unsupported and oversized files', () => {
    expect(
      formatDroppedImageFileWarnings({ files: [], unsupportedCount: 2, oversizedCount: 1 }),
    ).toContain('2 non-image files skipped');
    expect(
      formatDroppedImageFileWarnings({ files: [], unsupportedCount: 0, oversizedCount: 0 }),
    ).toBeNull();
  });
});
