import { AbsoluteCropRect, NodeCrop, NormalizedCropRect } from '@tgim/types/index';
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

export const toAbsoluteCropRect = (
  crop: NodeCrop | null | undefined,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
): AbsoluteCropRect | null => {
  if (!crop) return null;
  if (!isFiniteNumber(sourceWidth) || !isFiniteNumber(sourceHeight)) {
    return null;
  }

  const normalized = toNormalizedCropRect(crop);
  if (!normalized) {
    return null;
  }

  const width = sourceWidth as number;
  const height = sourceHeight as number;
  if (!(width > 0 && height > 0)) {
    return null;
  }

  return {
    startX: normalized.startX * width,
    startY: normalized.startY * height,
    width: normalized.width * width,
    height: normalized.height * height,
  };
};

export type CropPreviewStyle = {
  displayWidth: number;
  displayHeight: number;
  backgroundSize: string;
  backgroundPosition: string;
  scale: number;
};

type CropPreviewOptions = {
  maxEdge?: number;
};

export const getCropPreviewStyle = (
  rect: AbsoluteCropRect | null | undefined,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  options?: CropPreviewOptions,
): CropPreviewStyle | null => {
  if (!rect) return null;
  if (!isFiniteNumber(sourceWidth) || !isFiniteNumber(sourceHeight)) {
    return null;
  }

  const width = sourceWidth as number;
  const height = sourceHeight as number;
  if (!(width > 0 && height > 0)) {
    return null;
  }

  if (!(rect.width > 0 && rect.height > 0)) {
    return null;
  }

  const cropMaxEdge = Math.max(rect.width, rect.height);
  if (!(cropMaxEdge > 0)) {
    return null;
  }

  const maxEdge = options?.maxEdge ?? cropMaxEdge;
  const previewEdge = Math.max(1, maxEdge);
  const scale = Math.min(previewEdge / cropMaxEdge, 1);
  const displayWidth = Math.max(rect.width * scale, 1);
  const displayHeight = Math.max(rect.height * scale, 1);
  const backgroundSize = `${width * scale}px ${height * scale}px`;
  const backgroundPosition = `${-rect.startX * scale}px ${-rect.startY * scale}px`;

  return {
    displayWidth,
    displayHeight,
    backgroundSize,
    backgroundPosition,
    scale,
  };
};
