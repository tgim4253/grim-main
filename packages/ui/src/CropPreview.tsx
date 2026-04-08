import { useMemo } from 'react';
import { AbsoluteCropRect } from '@tgim/types/crop';
import { cn, getCropPreviewStyle } from '@tgim/utils/index';

type CropPreviewProps = {
  imageSrc: string;
  rect: AbsoluteCropRect;
  sourceWidth: number;
  sourceHeight: number;
  maxEdge?: number;
  className?: string;
};

const CropPreview: React.FC<CropPreviewProps> = ({
  imageSrc,
  rect,
  sourceWidth,
  sourceHeight,
  maxEdge,
  className,
}) => {
  const preview = useMemo(
    () => getCropPreviewStyle(rect, sourceWidth, sourceHeight, { maxEdge }),
    [rect, sourceHeight, sourceWidth, maxEdge],
  );

  if (!preview) {
    return null;
  }

  return (
    <div
      className={cn('crop-preview', className)}
      style={{ width: preview.displayWidth, height: preview.displayHeight }}
    >
      <div
        className="crop-preview__image"
        style={{
          backgroundImage: `url("${imageSrc}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: preview.backgroundSize,
          backgroundPosition: preview.backgroundPosition,
        }}
      />
    </div>
  );
};

export default CropPreview;
