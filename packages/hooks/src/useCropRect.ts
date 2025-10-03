import { useMemo } from 'react';
import { AbsoluteCropRect, NormalizedCropRect } from '@tgim/types/crop';
import { NodeCrop } from '@tgim/types/graph';
import {
  CropPreviewStyle,
  getCropPreviewStyle,
  toAbsoluteCropRect,
  toNormalizedCropRect,
} from '@tgim/utils/crop';

const isNodeCrop = (value: unknown): value is NodeCrop => {
  if (!value || typeof value !== 'object') return false;
  return 'isRelative' in value || 'referenceWidth' in value || 'referenceHeight' in value;
};

export const useNormalizedCropRect = (crop?: NodeCrop | null): NormalizedCropRect | null =>
  useMemo(() => toNormalizedCropRect(crop), [crop]);

export const useAbsoluteCropRect = (
  crop?: NodeCrop | null,
  sourceWidth?: number | null,
  sourceHeight?: number | null,
): AbsoluteCropRect | null =>
  useMemo(
    () => toAbsoluteCropRect(crop, sourceWidth ?? null, sourceHeight ?? null),
    [crop, sourceWidth, sourceHeight],
  );

type CropPreviewSource = NodeCrop | AbsoluteCropRect | null | undefined;

type UseCropPreviewOptions = {
  maxEdge?: number;
};

export const useCropPreview = (
  crop: CropPreviewSource,
  sourceWidth?: number | null,
  sourceHeight?: number | null,
  options?: UseCropPreviewOptions,
): CropPreviewStyle | null => {
  const maxEdge = options?.maxEdge;

  return useMemo(() => {
    if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const rect = isNodeCrop(crop) ? toAbsoluteCropRect(crop, sourceWidth, sourceHeight) : crop;

    return getCropPreviewStyle(rect, sourceWidth, sourceHeight, { maxEdge });
  }, [crop, maxEdge, sourceHeight, sourceWidth]);
};
