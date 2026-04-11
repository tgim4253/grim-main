import type {
  DeleteTagGroupPayload,
  DeleteTagPayload,
  SaveTagGroupPayload,
  SaveTagPayload,
  TagIndex,
} from '../../types';
import { invokeCamel } from './core';

export const tagIpc = {
  loadIndex: () => invokeCamel<TagIndex>('load_tag_index'),
  saveGroup: (payload: SaveTagGroupPayload) => invokeCamel<TagIndex>('save_tag_group', { payload }),
  deleteGroup: (payload: DeleteTagGroupPayload) =>
    invokeCamel<TagIndex>('delete_tag_group', { payload }),
  saveTag: (payload: SaveTagPayload) => invokeCamel<TagIndex>('save_tag', { payload }),
  deleteTag: (payload: DeleteTagPayload) => invokeCamel<TagIndex>('delete_tag', { payload }),
};
