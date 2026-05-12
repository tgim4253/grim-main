import { assetIpc } from './ipc/asset';
import { captureIpc } from './ipc/capture';
import { folderIpc } from './ipc/folder';
import { importIpc } from './ipc/import';
import { libraryIpc } from './ipc/library';
import { recordIpc } from './ipc/record';
import { sessionIpc } from './ipc/session';
import { tagIpc } from './ipc/tag';
import { windowIpc } from './ipc/window';

export const ipc = {
  window: windowIpc,
  library: libraryIpc,
  folder: folderIpc,
  asset: assetIpc,
  import: importIpc,
  record: recordIpc,
  session: sessionIpc,
  tag: tagIpc,
  capture: captureIpc,
};
