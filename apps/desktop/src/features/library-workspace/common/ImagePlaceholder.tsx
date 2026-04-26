import { cx } from '../../../shared/lib/cx';
import type { ImagePlaceholderState, MasonryImageRatio } from './types';

type ImagePlaceholderProps = {
  ratio?: MasonryImageRatio;
  state?: ImagePlaceholderState;
  className?: string;
};

export function ImagePlaceholder({
  ratio = '3:4',
  state = 'default',
  className,
}: ImagePlaceholderProps) {
  return (
    <div
      aria-hidden
      data-ratio={ratio}
      data-state={state}
      className={cx('masonry-image-placeholder', className)}
    />
  );
}
