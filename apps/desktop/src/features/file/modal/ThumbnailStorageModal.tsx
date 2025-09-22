import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '@tgim/ui';
import { ThumbnailUsage } from '@tgim/types/file';

import { ipc } from '../../../lib/ipc';
import { formatBytes } from '../../../lib/format';

type ThumbnailStorageModalProps = {
  open: boolean;
  onClose: () => void;
};

const ThumbnailStorageModal: React.FC<ThumbnailStorageModalProps> = ({ open, onClose }) => {
  const [usage, setUsage] = useState<ThumbnailUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearingBase, setClearingBase] = useState(false);
  const [clearingDerived, setClearingDerived] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipc.thumbnail.getUsage();
      setUsage(data);
    } catch (err) {
      console.error('[ThumbnailStorageModal] Failed to load thumbnail usage', err);
      setError('썸네일 용량 정보를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setClearingBase(false);
      setClearingDerived(false);
      return;
    }
    void refresh();
  }, [open, refresh]);

  const handleClearBase = useCallback(async () => {
    setClearingBase(true);
    setError(null);
    try {
      await ipc.thumbnail.clearBase();
      await refresh();
    } catch (err) {
      console.error('[ThumbnailStorageModal] Failed to clear base thumbnails', err);
      setError('Base 썸네일을 삭제하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setClearingBase(false);
    }
  }, [refresh]);

  const handleClearDerived = useCallback(async () => {
    setClearingDerived(true);
    setError(null);
    try {
      await ipc.thumbnail.clearDerived();
      await refresh();
    } catch (err) {
      console.error('[ThumbnailStorageModal] Failed to clear derived thumbnails', err);
      setError('파생 썸네일을 삭제하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setClearingDerived(false);
    }
  }, [refresh]);

  const statusMessage = useMemo(() => {
    if (clearingBase) return 'Base 썸네일을 삭제하는 중입니다...';
    if (clearingDerived) return '파생 썸네일을 삭제하는 중입니다...';
    if (loading) return '용량 정보를 불러오는 중입니다...';
    return null;
  }, [clearingBase, clearingDerived, loading]);

  const disableActions = loading || clearingBase || clearingDerived;

  if (!open) {
    return null;
  }

  return (
    <Modal onClose={onClose} className="bg-modal-bg w-[32rem]">
      <div className="flex flex-col gap-6 text-text">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">썸네일 용량 관리</h2>
          <p className="text-sm text-text-soft">
            Base 썸네일과 파생 썸네일 캐시의 용량을 확인하고 정리할 수 있습니다.
          </p>
          {statusMessage ? <p className="text-xs text-text-soft">{statusMessage}</p> : null}
        </header>

        {error ? (
          <div className="rounded-md border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4">
          <article className="rounded-lg border border-border bg-surface-muted p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                  Base 썸네일
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatBytes(usage?.baseBytes ?? 0)}
                </div>
                <div className="mt-1 text-xs text-text-soft">
                  {usage ? `${usage.baseFiles.toLocaleString()} 파일` : '용량 정보 없음'}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={handleClearBase}
                disabled={disableActions}
                className="whitespace-nowrap"
              >
                {clearingBase ? '삭제 중...' : 'Base 삭제'}
              </Button>
            </div>
          </article>

          <article className="rounded-lg border border-border bg-surface-muted p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
                  파생 썸네일
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatBytes(usage?.derivedBytes ?? 0)}
                </div>
                <div className="mt-1 text-xs text-text-soft">
                  {usage ? `${usage.derivedFiles.toLocaleString()} 파일` : '용량 정보 없음'}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={handleClearDerived}
                disabled={disableActions}
                className="whitespace-nowrap"
              >
                {clearingDerived ? '삭제 중...' : '썸네일 삭제'}
              </Button>
            </div>
          </article>
        </section>

        <footer className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-text-soft">
              총 용량
            </div>
            <div className="text-sm font-medium">
              {usage ? formatBytes(usage.totalBytes) : loading ? '계산 중...' : '0 B'}
            </div>
            {usage ? (
              <div className="text-xs text-text-soft">{usage.totalFiles.toLocaleString()} 파일</div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={refresh} disabled={disableActions}>
              {loading && !usage ? '불러오는 중...' : '새로고침'}
            </Button>
            <Button variant="primary" onClick={onClose}>
              닫기
            </Button>
          </div>
        </footer>
      </div>
    </Modal>
  );
};

export default ThumbnailStorageModal;
