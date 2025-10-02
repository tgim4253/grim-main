import React, { useMemo } from 'react';
import { Button, Modal } from '@tgim/ui/index';

import { formatBytes } from '../../../lib/format';

interface Props {
  progress: FolderImportProgressEvent;
  onClose: () => void;
  folderName: string;
  totalBytesFallback?: number;
  totalFilesFallback?: number;
  startedAt: number;
}

const formatDuration = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return '0초';
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${String(hours)}시간`);
  if (minutes > 0) parts.push(`${String(minutes)}분`);
  if (seconds > 0 || parts.length === 0) parts.push(`${String(seconds)}초`);

  return parts.join(' ');
};

const FolderImportProgressModal: React.FC<Props> = ({
  progress,
  onClose,
  folderName,
  totalBytesFallback,
  totalFilesFallback,
  startedAt,
}) => {
  const safeName = folderName || '선택한 폴더';
  const totalBytes = progress.totalBytes ?? totalBytesFallback ?? 0;
  const processedBytes = totalBytes
    ? Math.min(progress.processedBytes, totalBytes)
    : progress.processedBytes;
  const totalFiles = progress.totalFiles ?? totalFilesFallback ?? 0;
  const processedFiles = totalFiles
    ? Math.min(progress.processedFiles, totalFiles)
    : progress.processedFiles;
  const elapsedMs =
    progress.elapsedMs > 0 ? progress.elapsedMs : Math.max(Date.now() - startedAt, 0);

  const percent =
    totalBytes > 0 ? Math.min(100, Math.round((processedBytes / totalBytes) * 100)) : 0;

  const remainingText = useMemo(() => {
    if (progress.state === 'completed') return '0초';
    if (progress.state === 'failed') return '계산 불가';
    if (!totalBytes || processedBytes <= 0 || elapsedMs <= 0) {
      return '계산 중...';
    }

    const remainingBytes = Math.max(totalBytes - processedBytes, 0);
    if (remainingBytes === 0) return '0초';

    const ratePerSecond = processedBytes / (elapsedMs / 1000);
    if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) {
      return '계산 중...';
    }

    const remainingSeconds = Math.ceil(remainingBytes / ratePerSecond);
    return formatDuration(remainingSeconds * 1000);
  }, [elapsedMs, processedBytes, progress.state, totalBytes]);

  const { title, description } = useMemo(() => {
    switch (progress.state) {
      case 'completed':
        return {
          title: '업서트 완료',
          description: `"${String(safeName)}" 폴더 업서트가 완료되었습니다.`,
        };
      case 'failed':
        return {
          title: '업서트 실패',
          description: `"${String(safeName)}" 폴더 업서트 중 오류가 발생했습니다.`,
        };
      default:
        return {
          title: '업서트 진행 중',
          description: `"${String(safeName)}" 폴더를 업서트하는 중입니다.`,
        };
    }
  }, [progress.state, safeName]);

  const dismissible = progress.state === 'completed' || progress.state === 'failed';
  const barColor = progress.state === 'failed' ? 'bg-[var(--color-status-danger)]' : 'bg-accent';

  return (
    <Modal onClose={onClose} className="bg-modal-bg w-[28rem]" dismissible={dismissible}>
      <div className="p-6 space-y-5 text-text">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-text-soft">{description}</p>
        </div>

        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full rounded-full transition-all ${String(barColor)}`}
              style={{ width: `${String(percent)}%` }}
            ></div>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm font-medium">
            <span>{formatBytes(processedBytes)}</span>
            <span>{totalBytes ? formatBytes(totalBytes) : '총 용량 정보 없음'}</span>
          </div>
          {totalFiles ? (
            <div className="mt-1 text-xs text-text-soft">
              파일 {processedFiles.toLocaleString()} / {totalFiles.toLocaleString()}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-soft">경과 시간</div>
            <div className="font-medium">{formatDuration(elapsedMs)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-soft">남은 시간</div>
            <div className="font-medium">{remainingText}</div>
          </div>
        </div>

        {dismissible ? (
          <div className="flex justify-end">
            <Button onClick={onClose}>닫기</Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default FolderImportProgressModal;
