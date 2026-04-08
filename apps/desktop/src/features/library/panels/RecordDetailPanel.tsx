import { useEffect, useState } from 'react';
import { Button } from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type { PanelTab } from '../../../entities/library/model';
import type { CroquisRecordDetail } from '../../../shared/types';
import { assetPreviewSrc, formatDateTime, formatDuration } from '../lib/helpers';

type RecordDetailPanelProps = {
  tab: Extract<PanelTab, { type: 'recordDetail' }>;
  refreshToken: number;
  onOpenAsset: (assetId: string, title?: string) => void;
  onOpenTagPicker: (record: CroquisRecordDetail) => void;
  onDelete: (recordId: string) => void;
};

export function RecordDetailPanel({
  tab,
  refreshToken,
  onOpenAsset,
  onOpenTagPicker,
  onDelete,
}: RecordDetailPanelProps) {
  const [record, setRecord] = useState<CroquisRecordDetail | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const detail = await ipc.record.getDetail(tab.recordId);
        if (!cancelled) {
          setRecord(detail);
          setTitle(detail.title);
          setNote(detail.note);
          setActionError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load record');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, tab.recordId]);

  if (loading) {
    return <div className="library-panel-state">Loading record...</div>;
  }

  if (error || !record) {
    return (
      <div className="library-panel-state library-panel-state--error">
        {error ?? 'Record not found'}
      </div>
    );
  }

  const sourceAsset = record.sourceAsset;
  const resultAsset = record.resultAsset;
  const sourcePreview = sourceAsset ? assetPreviewSrc(sourceAsset) : null;
  const resultPreview = resultAsset ? assetPreviewSrc(resultAsset) : null;
  const isDirty = title.trim() !== record.title || note !== record.note;

  const handleSaveRecord = () => {
    void (async () => {
      setSaving(true);
      setActionError(null);
      try {
        const saved = await ipc.record.save({
          id: record.id,
          sourceAssetId: record.sourceAssetId,
          resultAssetId: record.resultAssetId,
          sessionId: record.sessionId,
          stepIndex: record.stepIndex,
          stepName: record.stepName,
          title: title.trim(),
          note,
          targetDurationSeconds: record.targetDurationSeconds,
          tagIds: record.tags.map(tag => tag.id),
        });
        setRecord(saved);
        setTitle(saved.title);
        setNote(saved.note);
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : 'Failed to save record');
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleDeleteRecord = () => {
    void (async () => {
      const shouldDelete = window.confirm('Delete this croquis record?');
      if (!shouldDelete) {
        return;
      }

      setActionError(null);
      try {
        await ipc.record.delete({ recordId: record.id });
        onDelete(record.id);
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : 'Failed to delete record');
      }
    })();
  };

  return (
    <div className="library-record-detail">
      <div className="library-record-detail__form">
        <div className="library-viewer__section">
          <div className="app-kicker">Record Detail</div>
          <h2 className="library-viewer__title">{record.title || 'Untitled Record'}</h2>
          <p className="library-viewer__copy">
            {record.stepName ? `${record.stepName} · ` : ''}
            {formatDuration(record.targetDurationSeconds)}
          </p>
          <div className="library-pill-list">
            <span className={isDirty ? 'library-pill library-pill--accent' : 'library-pill'}>
              {isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <span className="library-pill">
              {record.sessionId ? 'Session-linked record' : 'Standalone record'}
            </span>
          </div>
        </div>

        <label className="library-field">
          <span className="library-field__label">Title</span>
          <input
            value={title}
            onChange={event => {
              setTitle(event.target.value);
            }}
            className="library-control"
          />
        </label>

        <label className="library-field">
          <span className="library-field__label">Note</span>
          <textarea
            value={note}
            onChange={event => {
              setNote(event.target.value);
            }}
            rows={10}
            className="library-control library-control--textarea"
          />
        </label>

        <div className="library-stat-grid">
          <div className="library-stat-card">
            <span className="app-kicker">Started</span>
            <strong>{formatDateTime(record.startedAt)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Finished</span>
            <strong>{formatDateTime(record.finishedAt)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Finalized</span>
            <strong>{formatDateTime(record.finalizedAt)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Tags</span>
            <strong>{String(record.tags.length)}</strong>
          </div>
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Tags</div>
          <div className="library-pill-list">
            {record.tags.length === 0 ? (
              <span className="library-muted-copy">No tags assigned.</span>
            ) : (
              record.tags.map(tag => (
                <span key={tag.id} className="library-pill">
                  {tag.name}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="library-inline-actions">
          <Button variant="primary" disabled={saving || !isDirty} onClick={handleSaveRecord}>
            {saving ? 'Saving...' : 'Save Record'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenTagPicker(record);
            }}
          >
            Edit Tags
          </Button>
          <Button variant="secondary" onClick={handleDeleteRecord}>
            Delete
          </Button>
        </div>

        {actionError ? <div className="library-inline-error">{actionError}</div> : null}
      </div>

      <div className="library-record-detail__assets">
        {[
          {
            key: 'source',
            label: 'Source',
            asset: sourceAsset,
            preview: sourcePreview,
          },
          {
            key: 'result',
            label: 'Result',
            asset: resultAsset,
            preview: resultPreview,
          },
        ].map(item => (
          <div key={item.key} className="library-related-asset">
            <div className="library-related-asset__header">
              <div>
                <div className="app-kicker">{item.label}</div>
                <strong>{item.asset?.fileName ?? `No ${item.label.toLowerCase()} asset`}</strong>
              </div>
              {item.asset ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const asset = item.asset;
                    if (!asset) {
                      return;
                    }
                    onOpenAsset(asset.id, asset.fileName);
                  }}
                >
                  Open
                </Button>
              ) : null}
            </div>

            {item.asset && item.preview ? (
              <img
                src={item.preview}
                alt={item.asset.fileName}
                className="library-related-asset__image"
              />
            ) : (
              <div className="library-related-asset__empty">{item.label} asset not attached.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
