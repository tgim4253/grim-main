import type { CroquisRecordDetail, RecordExportGridLayoutConfig } from '@/shared/types';

export type RecordExportStep = 'pair' | 'grid';
export type RecordExportRatioMode = 'original' | '1:1' | '1:1.6' | '1.6:1' | 'custom';

export interface RecordExportImageDraftConfig {
  width: number;
  height: number;
  useRatio: boolean;
  ratioMode: RecordExportRatioMode;
  customRatioWidth?: number;
  customRatioHeight?: number;
}

export interface RecordExportPairLayoutDraftConfig {
  source: RecordExportImageDraftConfig;
  result: RecordExportImageDraftConfig;
  gap: number;
  padding: number;
  horizontal: boolean;
}

export type ExportableRecordDetail = CroquisRecordDetail & {
  sourceAsset: NonNullable<CroquisRecordDetail['sourceAsset']> & { storagePath: string };
  resultAsset: NonNullable<CroquisRecordDetail['resultAsset']> & { storagePath: string };
};

export const DEFAULT_RECORD_EXPORT_PAIR_LAYOUT: RecordExportPairLayoutDraftConfig = {
  source: {
    width: 100,
    height: 160,
    useRatio: true,
    ratioMode: '1:1.6',
  },
  result: {
    width: 400,
    height: 640,
    useRatio: true,
    ratioMode: 'original',
  },
  gap: 10,
  padding: 10,
  horizontal: true,
};

export const DEFAULT_RECORD_EXPORT_GRID_LAYOUT: RecordExportGridLayoutConfig = {
  hGap: 10,
  vGap: 10,
  padding: 10,
  limitPerLine: 5,
};

export function isExportableRecord(detail: CroquisRecordDetail): detail is ExportableRecordDetail {
  return Boolean(
    detail.sourceAsset?.storagePath?.trim() && detail.resultAsset?.storagePath?.trim(),
  );
}
