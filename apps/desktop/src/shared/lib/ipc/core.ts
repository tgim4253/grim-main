import { invoke } from '@tauri-apps/api/core';
import type {
  AssetDetail,
  AssetListSource,
  AssetRecordCount,
  AssetSummary,
  BatchUpdateAssetFoldersPayload,
  CaptureContext,
  CaptureOverlayPayload,
  CapturePreview,
  CapturePreviewPayload,
  CroquisRecordDetail,
  CroquisRecordResultsSnapshot,
  CroquisSession,
  CroquisStartPayload,
  CroquisStartResponse,
  DeleteCroquisRecordPayload,
  DeleteSessionPresetPayload,
  DeleteTagGroupPayload,
  DeleteTagPayload,
  DeleteTimeStepPresetPayload,
  DeleteVirtualFolderPayload,
  ExplorerSnapshot,
  FinishCroquisRecordPayload,
  ImportPreviewResult,
  ImportRemoteImagesRequest,
  ImportRequest,
  ImportResult,
  LibrarySnapshot,
  SaveCroquisRecordPayload,
  SaveSessionPresetPayload,
  SaveTagGroupPayload,
  SaveTagPayload,
  SaveTimeStepPresetPayload,
  SaveVirtualFolderPayload,
  SaveVirtualFolderResult,
  SessionPreset,
  TagIndex,
  TimeStepPreset,
  UpdateAssetFoldersPayload,
  UpdateCroquisRecordTagsPayload,
  VirtualFolder,
} from '../../types';
import { convertKeysToCamel } from '../object';

type CommandContract<TPayload, TResponse> = {
  payload: TPayload;
  response: TResponse;
};

export type IpcCommandContract = {
  load_library_snapshot: CommandContract<undefined, LibrarySnapshot>;
  load_explorer_snapshot: CommandContract<undefined, ExplorerSnapshot>;
  save_virtual_folder: CommandContract<
    { payload: SaveVirtualFolderPayload },
    SaveVirtualFolderResult
  >;
  delete_virtual_folder: CommandContract<{ payload: DeleteVirtualFolderPayload }, VirtualFolder[]>;
  search_virtual_folders: CommandContract<{ query: string }, VirtualFolder[]>;

  list_assets: CommandContract<{ source: AssetListSource }, AssetSummary[]>;
  list_asset_record_counts: CommandContract<{ source: AssetListSource }, AssetRecordCount[]>;
  get_asset_detail: CommandContract<{ assetId: string }, AssetDetail>;
  update_asset_folders: CommandContract<{ payload: UpdateAssetFoldersPayload }, AssetDetail>;
  batch_update_asset_folders: CommandContract<
    { payload: BatchUpdateAssetFoldersPayload },
    AssetDetail[]
  >;
  reveal_path: CommandContract<{ path: string }, void>;

  preview_import_images: CommandContract<{ payload: ImportRequest }, ImportPreviewResult>;
  import_images: CommandContract<{ payload: ImportRequest }, ImportResult>;
  import_remote_images: CommandContract<{ payload: ImportRemoteImagesRequest }, ImportResult>;

  list_recent_record_results: CommandContract<{ limit?: number }, CroquisRecordResultsSnapshot>;
  get_record_detail: CommandContract<{ recordId: string }, CroquisRecordDetail>;
  save_croquis_record: CommandContract<{ payload: SaveCroquisRecordPayload }, CroquisRecordDetail>;
  delete_croquis_record: CommandContract<{ payload: DeleteCroquisRecordPayload }, void>;
  finish_croquis_record: CommandContract<
    { payload: FinishCroquisRecordPayload },
    CroquisRecordDetail
  >;
  update_croquis_record_tags: CommandContract<
    { payload: UpdateCroquisRecordTagsPayload },
    CroquisRecordDetail
  >;

  list_session_presets: CommandContract<undefined, SessionPreset[]>;
  list_time_step_presets: CommandContract<undefined, TimeStepPreset[]>;
  save_session_preset: CommandContract<{ payload: SaveSessionPresetPayload }, SessionPreset[]>;
  delete_session_preset: CommandContract<{ payload: DeleteSessionPresetPayload }, SessionPreset[]>;
  save_time_step_preset: CommandContract<{ payload: SaveTimeStepPresetPayload }, TimeStepPreset[]>;
  delete_time_step_preset: CommandContract<
    { payload: DeleteTimeStepPresetPayload },
    TimeStepPreset[]
  >;
  start_croquis_session: CommandContract<{ payload: CroquisStartPayload }, CroquisStartResponse>;
  load_croquis_session: CommandContract<{ sessionId: string }, CroquisSession | null>;

  load_tag_index: CommandContract<undefined, TagIndex>;
  save_tag_group: CommandContract<{ payload: SaveTagGroupPayload }, TagIndex>;
  delete_tag_group: CommandContract<{ payload: DeleteTagGroupPayload }, TagIndex>;
  save_tag: CommandContract<{ payload: SaveTagPayload }, TagIndex>;
  delete_tag: CommandContract<{ payload: DeleteTagPayload }, TagIndex>;

  open_capture_overlay: CommandContract<{ payload: CaptureOverlayPayload }, void>;
  render_capture_preview: CommandContract<CapturePreviewPayload, CapturePreview>;
  confirm_capture: CommandContract<{ baseUrl: string; context: CaptureContext }, void>;
};

type IpcCommand = keyof IpcCommandContract;
type CommandPayload<TCommand extends IpcCommand> = IpcCommandContract[TCommand]['payload'];
type CommandResponse<TCommand extends IpcCommand> = IpcCommandContract[TCommand]['response'];
type CommandsWithOptionalPayload = {
  [TCommand in IpcCommand]: CommandPayload<TCommand> extends undefined ? TCommand : never;
}[IpcCommand];
type CommandsWithRequiredPayload = Exclude<IpcCommand, CommandsWithOptionalPayload>;

export function invokeCamel<TCommand extends CommandsWithOptionalPayload>(
  command: TCommand,
  payload?: undefined,
): Promise<CommandResponse<TCommand>>;
export function invokeCamel<TCommand extends CommandsWithRequiredPayload>(
  command: TCommand,
  payload: CommandPayload<TCommand>,
): Promise<CommandResponse<TCommand>>;
export async function invokeCamel(command: IpcCommand, payload?: unknown): Promise<unknown> {
  const response = await invoke(command, payload as Record<string, unknown> | undefined);
  return convertKeysToCamel(response);
}

export function invokeRaw<TCommand extends CommandsWithOptionalPayload>(
  command: TCommand,
  payload?: undefined,
): Promise<CommandResponse<TCommand>>;
export function invokeRaw<TCommand extends CommandsWithRequiredPayload>(
  command: TCommand,
  payload: CommandPayload<TCommand>,
): Promise<CommandResponse<TCommand>>;
export function invokeRaw(command: IpcCommand, payload?: unknown) {
  return invoke(command, payload as Record<string, unknown> | undefined);
}
