import type {
  CroquisRecordDetail,
  CroquisRecordSummary,
  DeleteCroquisRecordPayload,
  FinishCroquisRecordPayload,
  SaveCroquisRecordPayload,
  UpdateCroquisRecordTagsPayload,
} from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const recordIpc = {
  listRecent: (limit?: number) =>
    invokeCamel<CroquisRecordSummary[]>('list_recent_records', { limit }),
  getDetail: (recordId: string) =>
    invokeCamel<CroquisRecordDetail>('get_record_detail', { recordId }),
  save: (payload: SaveCroquisRecordPayload) =>
    invokeCamel<CroquisRecordDetail>('save_croquis_record', { payload }),
  delete: (payload: DeleteCroquisRecordPayload) => invokeRaw('delete_croquis_record', { payload }),
  finish: (payload: FinishCroquisRecordPayload) =>
    invokeCamel<CroquisRecordDetail>('finish_croquis_record', { payload }),
  updateTags: (payload: UpdateCroquisRecordTagsPayload) =>
    invokeCamel<CroquisRecordDetail>('update_croquis_record_tags', { payload }),
};
