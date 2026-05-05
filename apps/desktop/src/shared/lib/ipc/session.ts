import type {
  CroquisSession,
  CroquisStartPayload,
  CroquisStartResponse,
  DeleteSessionPresetPayload,
  DeleteTimeStepPresetPayload,
  SaveSessionPresetPayload,
  SaveTimeStepPresetPayload,
  SessionPreset,
  TimeStepPreset,
} from '../../types';
import { invokeCamel } from './core';

export const sessionIpc = {
  listPresets: (): Promise<SessionPreset[]> => invokeCamel('list_session_presets'),
  listTimeStepPresets: (): Promise<TimeStepPreset[]> => invokeCamel('list_time_step_presets'),
  savePreset: (payload: SaveSessionPresetPayload) =>
    invokeCamel('save_session_preset', { payload }),
  deletePreset: (payload: DeleteSessionPresetPayload) =>
    invokeCamel('delete_session_preset', { payload }),
  saveTimeStepPreset: (payload: SaveTimeStepPresetPayload) =>
    invokeCamel('save_time_step_preset', { payload }),
  deleteTimeStepPreset: (payload: DeleteTimeStepPresetPayload) =>
    invokeCamel('delete_time_step_preset', { payload }),
  start: (payload: CroquisStartPayload): Promise<CroquisStartResponse> =>
    invokeCamel('start_croquis_session', { payload }),
  load: (sessionId: string): Promise<CroquisSession | null> =>
    invokeCamel('load_croquis_session', { sessionId }),
};
