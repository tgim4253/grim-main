import type {
  CroquisSession,
  CroquisStartPayload,
  CroquisStartResponse,
  DeleteSessionPresetPayload,
  DeleteTimeStepPresetPayload,
  SaveSessionPresetPayload,
  SaveTimeStepPresetPayload,
  SessionDetail,
  SessionPreset,
  SessionSummary,
  TimeStepPreset,
} from '../../types';
import { invokeCamel } from './core';

export const sessionIpc = {
  listRecent: (limit?: number) => invokeCamel<SessionSummary[]>('list_recent_sessions', { limit }),
  getDetail: (sessionId: string) => invokeCamel<SessionDetail>('get_session_detail', { sessionId }),
  listPresets: () => invokeCamel<SessionPreset[]>('list_session_presets'),
  listTimeStepPresets: () => invokeCamel<TimeStepPreset[]>('list_time_step_presets'),
  savePreset: (payload: SaveSessionPresetPayload) =>
    invokeCamel<SessionPreset[]>('save_session_preset', { payload }),
  deletePreset: (payload: DeleteSessionPresetPayload) =>
    invokeCamel<SessionPreset[]>('delete_session_preset', { payload }),
  saveTimeStepPreset: (payload: SaveTimeStepPresetPayload) =>
    invokeCamel<TimeStepPreset[]>('save_time_step_preset', { payload }),
  deleteTimeStepPreset: (payload: DeleteTimeStepPresetPayload) =>
    invokeCamel<TimeStepPreset[]>('delete_time_step_preset', { payload }),
  start: (payload: CroquisStartPayload) =>
    invokeCamel<CroquisStartResponse>('start_croquis_session', { payload }),
  load: (sessionId: string) =>
    invokeCamel<CroquisSession | null>('load_croquis_session', { sessionId }),
};
