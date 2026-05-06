import type {
  DeleteTagGroupPayload,
  DeleteTagPayload,
  SaveTagGroupPayload,
  SaveTagPayload,
  TagIndex,
} from '../../types';
import { invokeCamel } from './core';

export const tagIpc = {
  loadIndex: (): Promise<TagIndex> => invokeCamel('load_tag_index'),
  saveGroup: (payload: SaveTagGroupPayload) => invokeCamel('save_tag_group', { payload }),
  deleteGroup: (payload: DeleteTagGroupPayload) => invokeCamel('delete_tag_group', { payload }),
  saveTag: (payload: SaveTagPayload) => invokeCamel('save_tag', { payload }),
  deleteTag: (payload: DeleteTagPayload) => invokeCamel('delete_tag', { payload }),
};
