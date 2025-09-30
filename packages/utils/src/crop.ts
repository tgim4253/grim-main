import {
  Connection,
  GraphResponse,
  Node,
  NodeCrop,
  NodeFile,
  NormalizedCropRect,
} from '@tgim/types/index';
import { clamp01, isFiniteNumber } from './number';

export const toNormalizedCropRect = (crop?: NodeCrop | null): NormalizedCropRect | null => {
  if (!crop) return null;

  const normalizedFromPayload = (crop as unknown as { normalizedRect?: NormalizedCropRect })
    .normalizedRect;
  if (normalizedFromPayload) {
    const { startX, startY, width, height } = normalizedFromPayload;
    if ([startX, startY, width, height].every(isFiniteNumber)) {
      const startXClamped = clamp01(startX);
      const startYClamped = clamp01(startY);

      const endXClamped = clamp01(startX + width);
      const endYClamped = clamp01(startY + height);
      const normalizedWidth = endXClamped - startXClamped;
      const normalizedHeight = endYClamped - startYClamped;
      if (normalizedWidth > 0 && normalizedHeight > 0) {
        return {
          startX: startXClamped,
          startY: startYClamped,
          width: normalizedWidth,
          height: normalizedHeight,
        };
      }
    }
  }

  const values = [crop.startX, crop.startY, crop.width, crop.height];
  if (!values.every(isFiniteNumber)) {
    return null;
  }

  let startX = crop.startX;
  let startY = crop.startY;
  let width = crop.width;
  let height = crop.height;

  if (!crop.isRelative) {
    const referenceWidth = crop.referenceWidth ?? null;
    const referenceHeight = crop.referenceHeight ?? null;
    if (
      isFiniteNumber(referenceWidth) &&
      referenceWidth > 0 &&
      isFiniteNumber(referenceHeight) &&
      referenceHeight > 0
    ) {
      startX = startX / referenceWidth;
      startY = startY / referenceHeight;
      width = width / referenceWidth;
      height = height / referenceHeight;
    } else {
      const alreadyNormalized = values.every(value => value >= 0 && value <= 1);
      if (!alreadyNormalized) {
        return null;
      }
    }
  }

  const startXClamped = clamp01(startX);
  const startYClamped = clamp01(startY);
  const endXClamped = clamp01(startX + width);
  const endYClamped = clamp01(startY + height);
  const normalizedWidth = endXClamped - startXClamped;
  const normalizedHeight = endYClamped - startYClamped;

  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return null;
  }

  return {
    startX: startXClamped,
    startY: startYClamped,
    width: normalizedWidth,
    height: normalizedHeight,
  };
};
