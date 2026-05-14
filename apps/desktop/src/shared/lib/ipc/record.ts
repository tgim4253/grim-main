import type {
  CroquisRecordDetail,
  CroquisRecordResultsSnapshot,
  DeleteCroquisRecordPayload,
  ExportCroquisRecordsPayload,
  ExportCroquisRecordsResult,
  FinishCroquisRecordPayload,
  SaveCroquisRecordPayload,
  UpdateCroquisRecordTagsPayload,
} from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const recordIpc = {
  listResults: (limit?: number): Promise<CroquisRecordResultsSnapshot> =>
    invokeCamel('list_recent_record_results', { limit }),
  getDetail: (recordId: string) => invokeCamel('get_record_detail', { recordId }),
  save: (payload: SaveCroquisRecordPayload): Promise<CroquisRecordDetail> =>
    invokeCamel('save_croquis_record', { payload }),
  delete: (payload: DeleteCroquisRecordPayload) => invokeRaw('delete_croquis_record', { payload }),
  finish: (payload: FinishCroquisRecordPayload) =>
    invokeCamel('finish_croquis_record', { payload }),
  updateTags: (payload: UpdateCroquisRecordTagsPayload) =>
    invokeCamel('update_croquis_record_tags', { payload }),
  exportRecords: (payload: ExportCroquisRecordsPayload): Promise<ExportCroquisRecordsResult> =>
    invokeCamel('export_croquis_records', { payload }),
};
