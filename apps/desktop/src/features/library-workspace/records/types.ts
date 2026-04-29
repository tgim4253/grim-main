import type {
  AssetSummary,
  CroquisRecordDetail,
  CroquisRecordSummary,
  Tag,
} from '../../../shared/types';
import type { LibraryWorkspaceItem, MasonryImageRatio } from '../common/types';

export type RecordResultItem = LibraryWorkspaceItem &
  CroquisRecordSummary & {
    detail?: CroquisRecordDetail | null;
    sourceAsset?: AssetSummary | null;
    resultAsset?: AssetSummary | null;
    tags: readonly Tag[];
    imageSrc?: string | null;
    thumbnailSrc?: string | null;
    sourceImageSrc?: string | null;
    sourceThumbnailSrc?: string | null;
    resultImageSrc?: string | null;
    resultThumbnailSrc?: string | null;
    ratio: MasonryImageRatio;
    height: number;
  };
