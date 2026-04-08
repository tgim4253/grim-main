import { useEffect, useState } from 'react';
import { Button } from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type { PanelTab } from '../../../entities/library/model';
import type { SessionDetail } from '../../../shared/types';
import { formatDateTime, recordLabel, sessionLabel } from '../lib/helpers';

type SessionDetailPanelProps = {
  tab: Extract<PanelTab, { type: 'sessionDetail' }>;
  refreshToken: number;
  onOpenRecord: (recordId: string, title?: string) => void;
};

export function SessionDetailPanel({ tab, refreshToken, onOpenRecord }: SessionDetailPanelProps) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextDetail = await ipc.session.getDetail(tab.sessionId);
        if (!cancelled) {
          setDetail(nextDetail);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load session');
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
  }, [refreshToken, tab.sessionId]);

  if (loading) {
    return <div className="library-panel-state">Loading session...</div>;
  }

  if (error || !detail) {
    return (
      <div className="library-panel-state library-panel-state--error">
        {error ?? 'Session not found'}
      </div>
    );
  }

  return (
    <div className="library-detail-shell">
      <div className="library-detail-shell__main">
        <div className="library-viewer__section">
          <div className="app-kicker">Session Detail</div>
          <h2 className="library-viewer__title">{sessionLabel(detail.summary)}</h2>
          <p className="library-viewer__copy">
            {detail.preset?.name ?? 'No preset'} · {detail.summary.recordCount} records
          </p>
        </div>

        <div className="library-stat-grid">
          <div className="library-stat-card">
            <span className="app-kicker">Preset</span>
            <strong>{detail.preset?.name ?? 'Free Session'}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Steps</span>
            <strong>{String(detail.records.length)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Started</span>
            <strong>{formatDateTime(detail.summary.startedAt)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Finished</span>
            <strong>{formatDateTime(detail.summary.finishedAt)}</strong>
          </div>
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Records</div>
          <div className="library-list">
            {detail.records.length === 0 ? (
              <div className="library-empty-copy">No records are attached to this session yet.</div>
            ) : (
              detail.records.map(record => (
                <button
                  key={record.id}
                  type="button"
                  className="library-list__item"
                  onClick={() => {
                    onOpenRecord(record.id, recordLabel(record));
                  }}
                >
                  <strong>{recordLabel(record)}</strong>
                  <span>
                    {record.stepName ? `${record.stepName} · ` : ''}
                    {formatDateTime(record.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <aside className="library-detail-shell__sidebar">
        <div className="library-viewer__section">
          <div className="app-kicker">Preset</div>
          {detail.preset ? (
            <>
              <strong>{detail.preset.name}</strong>
              {detail.preset.description ? (
                <p className="library-viewer__copy">{detail.preset.description}</p>
              ) : null}
            </>
          ) : (
            <span className="library-muted-copy">This session is not linked to a preset.</span>
          )}
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Session Steps</div>
          <div className="library-step-stack">
            {detail.records.map((record, index) => (
              <div key={record.id} className="library-step-card">
                <div className="library-step-card__order">
                  Step {String(record.stepIndex ?? index + 1)}
                </div>
                <strong>{record.stepName || record.title || 'Untitled Step'}</strong>
                <span>{formatDateTime(record.createdAt)}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onOpenRecord(record.id, recordLabel(record));
                  }}
                >
                  Open Record
                </Button>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
