import { useTranslation } from 'react-i18next';
import {
  AccordionItem,
  AccordionItemBody,
  AccordionItemDragHeader,
  AccordionRoot,
  Button,
  CheckboxRow,
  Icon,
  Input,
  Select,
  type AccordionReorderPayload,
  type AccordionRootValue,
  type SelectOption,
} from '@/shared/ui';
import type { Tag, TagGroup } from '@/shared/types';
import {
  AutoTagPicker,
  SessionPresetStepEditor,
  formatDurationCompact,
  getStepDuration,
  type EditableSessionStep,
} from '@/entities/session-preset';
import {
  formatAutoTagSummary,
  formatStepCount,
  formatStepOptionSummary,
} from '../model/presetSettingsFormat';
import { PresetSettingsMessage } from './PresetSettingsMessage';

const ignoreStepEditorChange = () => {};

type SessionPresetEditorPanelProps = {
  editorDisabled: boolean;
  error: string | null;
  status: string | null;
  sessionName: string;
  sessionDescription: string;
  sessionWindowWidth: string;
  sessionWindowHeight: string;
  sessionIsShuffle: boolean;
  sessionAutoTags: readonly Tag[];
  sessionSteps: readonly EditableSessionStep[];
  collapsedSessionStepIds: ReadonlySet<string>;
  expandedSessionStepIds: string[];
  tags: readonly Tag[];
  tagGroups: readonly TagGroup[];
  timeStepPresetOptions: SelectOption[];
  onSessionNameChange: (name: string) => void;
  onSessionDescriptionChange: (description: string) => void;
  onSessionWindowWidthChange: (value: string) => void;
  onSessionWindowHeightChange: (value: string) => void;
  onSessionShuffleChange: (isShuffle: boolean) => void;
  onSessionAutoTagAdd: (tag: Tag) => void;
  onSessionAutoTagRemove: (tagId: string) => void;
  onStepAdd: () => void;
  onStepDelete: (stepId: string) => void;
  onStepMove: (stepId: string, direction: -1 | 1) => void;
  onStepAccordionValueChange: (value: AccordionRootValue) => void;
  onStepReorder: (payload: AccordionReorderPayload) => void;
  onStepPresetChange: (stepId: string, presetId: string) => void;
};

export function SessionPresetEditorPanel({
  editorDisabled,
  error,
  status,
  sessionName,
  sessionDescription,
  sessionWindowWidth,
  sessionWindowHeight,
  sessionIsShuffle,
  sessionAutoTags,
  sessionSteps,
  collapsedSessionStepIds,
  expandedSessionStepIds,
  tags,
  tagGroups,
  timeStepPresetOptions,
  onSessionNameChange,
  onSessionDescriptionChange,
  onSessionWindowWidthChange,
  onSessionWindowHeightChange,
  onSessionShuffleChange,
  onSessionAutoTagAdd,
  onSessionAutoTagRemove,
  onStepAdd,
  onStepDelete,
  onStepMove,
  onStepAccordionValueChange,
  onStepReorder,
  onStepPresetChange,
}: SessionPresetEditorPanelProps) {
  const { t } = useTranslation('common');

  return (
    <>
      <div className="session-preset-settings__header">
        <div className="session-preset-settings__session-panel">
          <Input
            label={t('presets.session_name', { defaultValue: 'Session Name' })}
            value={sessionName}
            disabled={editorDisabled}
            onChange={event => {
              onSessionNameChange(event.target.value);
            }}
          />
          <label className="session-preset-settings__textarea-field">
            <span>{t('common.description', { defaultValue: 'Description' })}</span>
            <textarea
              value={sessionDescription}
              disabled={editorDisabled}
              className="session-preset-settings__textarea"
              onChange={event => {
                onSessionDescriptionChange(event.target.value);
              }}
            />
          </label>
          <div className="session-preset-settings__session-auto-tags">
            <AutoTagPicker
              label={t('croquis.session_auto_tags', { defaultValue: 'Session Auto Tags' })}
              tags={sessionAutoTags}
              availableTags={tags}
              tagGroups={tagGroups}
              disabled={editorDisabled}
              emptyLabel={t('croquis.session_auto_tags.empty', {
                defaultValue: 'No session auto tags',
              })}
              onTagAdd={onSessionAutoTagAdd}
              onTagRemove={onSessionAutoTagRemove}
            />
          </div>
        </div>
      </div>

      <main className="session-preset-settings__content">
        <div className="session-preset-settings__timeline-header">
          <span className="session-preset-settings__eyebrow">
            {t('presets.session_timeline', { defaultValue: 'Session Timeline' })}
          </span>
          <span>{formatStepCount(sessionSteps.length, t)}</span>
        </div>

        <AccordionRoot
          type="multiple"
          value={expandedSessionStepIds}
          onValueChange={onStepAccordionValueChange}
          reorderable={sessionSteps.length > 0}
          onItemReorder={onStepReorder}
          className="session-preset-settings__timeline-grid"
        >
          {sessionSteps.map((step, index) => {
            const stepNumber = index + 1;
            const stepBodyId = `session-preset-step-${step.id}`;
            const stepHeaderId = `${stepBodyId}-header`;
            const isCollapsed = collapsedSessionStepIds.has(step.id);

            return (
              <AccordionItem
                key={step.id}
                value={step.id}
                className="session-preset-settings__step-card"
                disabled={editorDisabled}
              >
                <AccordionItemDragHeader
                  id={stepHeaderId}
                  className="session-preset-settings__step-header"
                  controlsId={stepBodyId}
                  disclosureLabel={t(
                    isCollapsed ? 'presets.expand_step' : 'presets.collapse_step',
                    {
                      step: String(stepNumber),
                      defaultValue: isCollapsed ? 'Expand step {{step}}' : 'Collapse step {{step}}',
                    },
                  )}
                  dragLabel={t('presets.drag_step_to_reorder', {
                    step: String(stepNumber),
                    defaultValue: 'Drag step {{step}} to reorder',
                  })}
                >
                  <span className="session-preset-settings__step-index">
                    {String(stepNumber).padStart(2, '0')}
                  </span>
                  <Select
                    aria-label={t('presets.step_time_step_preset', {
                      step: String(stepNumber),
                      defaultValue: 'Step {{step}} time step preset',
                    })}
                    options={timeStepPresetOptions}
                    value={step.timeStepPresetId ?? ''}
                    disabled={editorDisabled || timeStepPresetOptions.length === 0}
                    onValueChange={nextValue => {
                      onStepPresetChange(step.id, nextValue);
                    }}
                  />
                  <span className="session-preset-settings__step-duration">
                    {formatDurationCompact(getStepDuration(step))}
                  </span>
                </AccordionItemDragHeader>
                <div className="session-preset-settings__step-summary">
                  <strong>{step.name}</strong>
                  <span>{formatDurationCompact(getStepDuration(step))}</span>
                  <span>{formatStepOptionSummary(step, t)}</span>
                  <span>{formatAutoTagSummary(step.autoTags, t)}</span>
                </div>
                <AccordionItemBody
                  id={stepBodyId}
                  labelledBy={stepHeaderId}
                  className="session-preset-settings__step-body"
                >
                  <SessionPresetStepEditor
                    step={step}
                    durationSeconds={getStepDuration(step)}
                    disabled
                    onTimerChange={ignoreStepEditorChange}
                    onAutoAdvanceChange={ignoreStepEditorChange}
                    onRecordsSaveChange={ignoreStepEditorChange}
                    onRequireResultChange={ignoreStepEditorChange}
                    onCaptureChange={ignoreStepEditorChange}
                    onFilterChange={ignoreStepEditorChange}
                    onGrayscaleChange={ignoreStepEditorChange}
                    onBlurChange={ignoreStepEditorChange}
                    onBlurAmountChange={ignoreStepEditorChange}
                    onResultSavePathChange={ignoreStepEditorChange}
                  />
                  <div className="session-preset-settings__step-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={editorDisabled || index === 0}
                      onClick={() => {
                        onStepMove(step.id, -1);
                      }}
                    >
                      {t('common.move_up', { defaultValue: 'Move Up' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={editorDisabled || index === sessionSteps.length - 1}
                      onClick={() => {
                        onStepMove(step.id, 1);
                      }}
                    >
                      {t('common.move_down', { defaultValue: 'Move Down' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={editorDisabled}
                      onClick={() => {
                        onStepDelete(step.id);
                      }}
                    >
                      {t('common.delete', { defaultValue: 'Delete' })}
                    </Button>
                  </div>
                </AccordionItemBody>
              </AccordionItem>
            );
          })}

          {sessionSteps.length === 0 ? (
            <div className="session-preset-settings__empty-detail">
              <span>
                {t('presets.append_saved_time_step_hint', {
                  defaultValue: 'Append a saved time step preset to build this session.',
                })}
              </span>
              <Button size="sm" disabled={editorDisabled} onClick={onStepAdd}>
                {t('presets.append_time_step', { defaultValue: 'Append Time Step' })}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="session-preset-settings__append-card"
              disabled={editorDisabled}
              onClick={onStepAdd}
            >
              <span>{t('presets.append_time_step', { defaultValue: 'Append Time Step' })}</span>
              <Icon name="plus" size="sm" hierarchy="tertiary" aria-hidden />
            </button>
          )}
        </AccordionRoot>

        <section className="session-preset-settings__options-strip">
          <div className="session-preset-settings__window-grid">
            <Input
              label={t('croquis.window_height', { defaultValue: 'Window height' })}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={sessionWindowHeight}
              placeholder="180"
              disabled={editorDisabled}
              onChange={event => {
                onSessionWindowHeightChange(event.target.value);
              }}
            />
            <Input
              label={t('croquis.window_width', { defaultValue: 'Window width' })}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              pattern="[0-9]*"
              value={sessionWindowWidth}
              placeholder="1080"
              disabled={editorDisabled}
              onChange={event => {
                onSessionWindowWidthChange(event.target.value);
              }}
            />
          </div>
          <CheckboxRow
            label={t('croquis.shuffle_entire_queue', {
              defaultValue: 'Shuffle entire queue',
            })}
            checked={sessionIsShuffle}
            disabled={editorDisabled}
            onCheckedChange={onSessionShuffleChange}
          />
        </section>

        <PresetSettingsMessage error={error} status={status} />
      </main>
    </>
  );
}
