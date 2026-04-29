import { Chip, PreviewPanel } from '../../../shared/ui';
import { ImagePlaceholder } from '../common/ImagePlaceholder';
import type { RecordResultItem } from './types';

type RecordResultPreviewPanelProps = {
  record: RecordResultItem;
  relatedRecords: readonly RecordResultItem[];
  tagGroupNamesById: ReadonlyMap<string, string>;
  onClose?: () => void;
};

type PreviewMetadataFieldProps = {
  label: string;
  value: string;
  wide?: boolean;
};

type TagGroup = {
  id: string;
  label: string;
  tags: readonly RecordResultItem['tags'][number][];
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'None';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDurationSeconds(value?: number | null) {
  if (value === null || value === undefined) {
    return 'None';
  }

  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${String(seconds)}s`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatDurationPair(record: RecordResultItem) {
  const actual = formatDurationSeconds(record.actualDurationSeconds);
  const target = formatDurationSeconds(record.targetDurationSeconds);

  if (actual === 'None' && target === 'None') {
    return 'None';
  }

  if (target === 'None') {
    return actual;
  }

  if (actual === 'None') {
    return target;
  }

  return `${actual} / ${target}`;
}

function groupTags(
  record: RecordResultItem,
  tagGroupNamesById: ReadonlyMap<string, string>,
): TagGroup[] {
  const groups = new Map<string, RecordResultItem['tags'][number][]>();

  for (const tag of record.tags) {
    const groupId = tag.groupId ?? 'ungrouped';
    const group = groups.get(groupId) ?? [];
    group.push(tag);
    groups.set(groupId, group);
  }

  return [...groups.entries()].map(([id, tags]) => ({
    id,
    label: id === 'ungrouped' ? 'Ungrouped' : (tagGroupNamesById.get(id) ?? 'Unknown Group'),
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
  onClose,
}: RecordResultPreviewPanelProps) {
  const sourceSrc = record.sourceImageSrc ?? record.sourceThumbnailSrc;
  const resultSrc = record.resultImageSrc ?? record.resultThumbnailSrc;
  const tagGroups = groupTags(record, tagGroupNamesById);

  return (
    <PreviewPanel
      title="Record Preview"
      ariaLabel="Record preview"
      className="record-result-preview"
      onClose={onClose}
    >
      <div className="record-result-preview__split">
        <SplitPreviewImage
          src={sourceSrc}
          title={record.sourceAsset?.fileName ?? record.title}
          badge="Original"
          tone="source"
        />
        <SplitPreviewImage
          src={resultSrc}
          title={record.resultAsset?.fileName ?? record.title}
          badge="Result"
          tone="result"
        />
      </div>

      <div className="record-result-preview__sections">
        <section className="record-result-preview__section">
          <PreviewSectionHeading>Metadata</PreviewSectionHeading>
          <dl className="record-result-preview__metadata-grid">
            <PreviewMetadataField label="Title" value={record.title || 'Untitled'} wide />
            <PreviewMetadataField label="Duration" value={formatDurationPair(record)} />
            <PreviewMetadataField label="Finished" value={formatDateTime(record.finishedAt)} />
          </dl>
        </section>

        <section className="record-result-preview__section">
          <PreviewSectionHeading>Tags</PreviewSectionHeading>
          {tagGroups.length > 0 ? (
            <div className="record-result-preview__tag-groups">
              {tagGroups.map(group => (
                <div key={group.id} className="record-result-preview__tag-group">
                  <p>{group.label}</p>
                  <div className="record-result-preview__tag-row">
                    {group.tags.map(tag => (
                      <Chip key={tag.id} shape="pill" variant="outline">
                        {tag.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="record-result-preview__empty-text">No tags</p>
          )}
        </section>

        <section className="record-result-preview__section record-result-preview__section--related">
          <div className="record-result-preview__related-header">
            <h3>Related Records</h3>
            <span>Same Source</span>
          </div>
          {relatedRecords.length > 0 ? (
            <div className="record-result-preview__related-row">
              {relatedRecords.slice(0, 4).map(relatedRecord => (
                <RelatedRecordThumb key={relatedRecord.id} record={relatedRecord} />
              ))}
            </div>
          ) : (
            <p className="record-result-preview__empty-text">No related records</p>
          )}
        </section>
      </div>
    </PreviewPanel>
  );
}
