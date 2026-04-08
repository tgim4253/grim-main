import type { SessionPreset } from '../../../../shared/types';

export type EditableStep = {
  id?: string | null;
  name: string;
  defaultDurationSeconds: string;
  resultRequired: boolean;
  autoTagNames: string;
};

export const createEmptyStep = (name = 'Main Step'): EditableStep => ({
  name,
  defaultDurationSeconds: '',
  resultRequired: false,
  autoTagNames: '',
});

export const toEditableStep = (step: SessionPreset['steps'][number]): EditableStep => ({
  id: step.id,
  name: step.name,
  defaultDurationSeconds: step.defaultDurationSeconds ? String(step.defaultDurationSeconds) : '',
  resultRequired: step.resultRequired,
  autoTagNames: step.autoTags.map(tag => tag.name).join(', '),
});
