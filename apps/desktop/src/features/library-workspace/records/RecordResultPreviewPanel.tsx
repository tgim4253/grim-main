import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, ChipButton, PreviewPanel } from '../../../shared/ui';
import type { Tag } from '../../../shared/types';
import { ImagePlaceholder } from '../common/ImagePlaceholder';
import type { RecordResultItem } from './types';

type RecordResultPreviewPanelProps = {
  record: RecordResultItem;
  relatedRecords: readonly RecordResultItem[];
  tagGroupNamesById: ReadonlyMap<string, string>;
  availableTags?: readonly Tag[];
  tagEditDisabled?: boolean;
  onTagAddRequest?: (recordId: string) => void;
  onTagRemove?: (recordId: string, tagId: string) => Promise<void> | void;
  onClose?: () => void;
};

type PreviewMetadataFieldProps = {
  label: string;
  value: string;
  wide?: boolean;
};

type RecordPreviewTagGroup = {
  id: string;
  label: string;
  tags: readonly RecordResultItem['tags'][number][];
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatDateTime(
  value: string | null | undefined,
  locale: string | undefined,
  t: Translate,
) {
  if (!value) {
    return t('common.none', { defaultValue: 'None' });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDurationSeconds(value: number | null | undefined, t: Translate) {
  if (value === null || value === undefined) {
    return t('common.none', { defaultValue: 'None' });
  }

  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${String(seconds)}s`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatDurationPair(record: RecordResultItem, t: Translate) {
  const noneLabel = t('common.none', { defaultValue: 'None' });
  const actual = formatDurationSeconds(record.actualDurationSeconds, t);
  const target = formatDurationSeconds(record.targetDurationSeconds, t);

  if (actual === noneLabel && target === noneLabel) {
    return noneLabel;
  }

  if (target === noneLabel) {
    return actual;
  }

  if (actual === noneLabel) {
    return target;
  }

  return `${actual} / ${target}`;
}

function groupTags(
  record: RecordResultItem,
  tagGroupNamesById: ReadonlyMap<string, string>,
  t: Translate,
): RecordPreviewTagGroup[] {
  const groups = new Map<string, RecordResultItem['tags'][number][]>();

  for (const tag of record.tags) {
    const groupId = tag.groupId ?? 'ungrouped';
    const group = groups.get(groupId) ?? [];
    group.push(tag);
    groups.set(groupId, group);
  }

  return [...groups.entries()].map(([id, tags]) => ({
    id,
    label:
      id === 'ungrouped'
        ? t('tags.ungrouped', { defaultValue: 'Ungrouped' })
        : (tagGroupNamesById.get(id) ?? t('tags.unknown_group', { defaultValue: 'Unknown Group' })),
    tags,
  }));
}

function PreviewSectionHeading({ children }: { children: string }) {
  return (
    <div className="record-result-preview__section-heading">
      <span className="record-result-preview__section-marker" aria-hidden />
      <h3>{children}</h3>
    </div>
  );
}

function PreviewMetadataField({ label, value, wide = false }: PreviewMetadataFieldProps) {
  return (
    <div className="record-result-preview__metadata-field" data-wide={wide ? 'true' : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SplitPreviewImage({
  src,
  title,
  badge,
  tone,
}: {
  src?: string | null;
  title: string;
  badge: string;
  tone: 'source' | 'result';
}) {
  return (
    <div className="record-result-preview__split-pane" data-tone={tone}>
      {src ? (
        <img src={src} alt={title} draggable={false} className="record-result-preview__split-img" />
      ) : (
        <ImagePlaceholder className="record-result-preview__split-placeholder" />
      )}
      <span className="record-result-preview__split-badge">{badge}</span>
    </div>
  );
}

function RelatedRecordThumb({ record }: { record: RecordResultItem }) {
  const imageSrc = record.thumbnailSrc ?? record.imageSrc;

  return (
    <div className="record-result-preview__related-thumb" title={record.title}>
      {imageSrc ? (
        <img src={imageSrc} alt="" draggable={false} />
      ) : (
        <ImagePlaceholder className="record-result-preview__related-placeholder" />
      )}
    </div>
  );
}

export function RecordResultPreviewPanel({
  record,
  relatedRecords,
  tagGroupNamesById,
  availableTags = [],
  tagEditDisabled = false,
  onTagAddRequest,
  onTagRemove,
  onClose,
}: RecordResultPreviewPanelProps) {
  const { i18n, t } = useTranslation('common');
  const sourceSrc = record.sourceImageSrc ?? record.sourceThumbnailSrc;
  const resultSrc = record.resultImageSrc ?? record.resultThumbnailSrc;
  const previewTagGroups = groupTags(record, tagGroupNamesById, t);
  const canEditTags = Boolean(onTagAddRequest && onTagRemove);
  const linkedTagIds = useMemo(() => new Set(record.tags.map(tag => tag.id)), [record.tags]);
  const selectableTags = useMemo(
    () => availableTags.filter(tag => !linkedTagIds.has(tag.id)),
    [availableTags, linkedTagIds],
  );
  return (
    <PreviewPanel
      title={t('records.preview.title', { defaultValue: 'Record Preview' })}
      ariaLabel={t('records.preview.aria_label', { defaultValue: 'Record preview' })}
      className="record-result-preview"
      onClose={onClose}
    >
      <div className="record-result-preview__split">
        <SplitPreviewImage
          src={sourceSrc}
          title={record.sourceAsset?.fileName ?? record.title}
          badge={t('records.preview.original', { defaultValue: 'Original' })}
          tone="source"
        />
        <SplitPreviewImage
          src={resultSrc}
          title={record.resultAsset?.fileName ?? record.title}
          badge={t('records.preview.result', { defaultValue: 'Result' })}
          tone="result"
        />
      </div>

      <div className="record-result-preview__sections">
        <section className="record-result-preview__section">
          <PreviewSectionHeading>
            {t('common.metadata', { defaultValue: 'Metadata' })}
          </PreviewSectionHeading>
          <dl className="record-result-preview__metadata-grid">
            <PreviewMetadataField
              label={t('common.title', { defaultValue: 'Title' })}
              value={record.title || t('common.untitled', { defaultValue: 'Untitled' })}
              wide
            />
            <PreviewMetadataField
              label={t('records.duration', { defaultValue: 'Duration' })}
              value={formatDurationPair(record, t)}
            />
            <PreviewMetadataField
              label={t('records.finished', { defaultValue: 'Finished' })}
              value={formatDateTime(record.finishedAt, i18n.resolvedLanguage, t)}
            />
          </dl>
        </section>

        <section className="record-result-preview__section">
          <PreviewSectionHeading>{t('tags.tags', { defaultValue: 'Tags' })}</PreviewSectionHeading>
          {previewTagGroups.length > 0 ? (
            <div className="record-result-preview__tag-groups">
              {previewTagGroups.map(group => (
                <div key={group.id} className="record-result-preview__tag-group">
                  <p>{group.label}</p>
                  <div className="record-result-preview__tag-row">
                    {group.tags.map(tag =>
                      canEditTags ? (
                        <ChipButton
                          key={tag.id}
                          shape="rounded"
                          variant="neutral-dismiss"
                          disabled={tagEditDisabled}
                          aria-label={t('tags.remove_tag', {
                            tag: tag.name,
                            defaultValue: 'Remove tag {{tag}}',
                          })}
                          onClick={() => {
                            void Promise.resolve(onTagRemove?.(record.id, tag.id)).catch(() => {
                              // Error display is owned by the parent records view.
                            });
                          }}
                        >
                          {tag.name}
                        </ChipButton>
                      ) : (
                        <Chip key={tag.id} shape="pill" variant="outline">
                          {tag.name}
                        </Chip>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="record-result-preview__empty-text">
              {t('tags.no_tags', { defaultValue: 'No tags' })}
            </p>
          )}
          {canEditTags ? (
            <div className="record-result-preview__tag-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={tagEditDisabled || selectableTags.length === 0}
                onClick={() => {
                  onTagAddRequest?.(record.id);
                }}
              >
                {t('common.add_tag', { defaultValue: 'Add Tag' })}
              </Button>
              {availableTags.length === 0 ? (
                <span className="record-result-preview__tag-hint">
                  {t('croquis.auto_tags.create_tags_first', {
                    defaultValue: 'Create tags in Tag Settings first.',
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="record-result-preview__section record-result-preview__section--related">
          <div className="record-result-preview__related-header">
            <h3>{t('records.related_records', { defaultValue: 'Related Records' })}</h3>
            <span>{t('records.same_source', { defaultValue: 'Same Source' })}</span>
          </div>
          {relatedRecords.length > 0 ? (
            <div className="record-result-preview__related-row">
              {relatedRecords.slice(0, 4).map(relatedRecord => (
                <RelatedRecordThumb key={relatedRecord.id} record={relatedRecord} />
              ))}
            </div>
          ) : (
            <p className="record-result-preview__empty-text">
              {t('records.no_related_records', { defaultValue: 'No related records' })}
            </p>
          )}
        </section>
      </div>
    </PreviewPanel>
  );
}
