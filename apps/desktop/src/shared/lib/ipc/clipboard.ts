import { invokeRaw } from './core';

export const clipboardIpc = {
  copyImage: (path: string, options: { grayscale?: boolean } = {}) =>
    invokeRaw('copy_image_to_clipboard', { path, grayscale: options.grayscale ?? false }),
};
