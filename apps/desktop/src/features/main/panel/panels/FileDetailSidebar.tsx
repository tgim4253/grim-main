import { useEffect, useMemo, useState } from 'react';
import { Button } from '@tgim/ui';
import { ImageItem } from '@tgim/types/grid';
import { FileDetail, FilePathInfo, FilePathStatus } from '@tgim/types/file';
import { ipc } from '../../../../lib/ipc';
import { formatBytes } from '../../../../lib/format';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { useShallow } from 'zustand/shallow';
import { useThumbnails } from '../../../../hooks';
import { ResizeMode } from '@tgim/types/file';
import { cn } from '@tgim/utils/index';
import { FolderOpen, Loader2, PencilLine, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';

type Props = {
  moaId: string | null;
  image: ImageItem | null;
  onClose?: () => void;
};

type ActionState = {
  busy: boolean;
  targetId?: string;
};

const PREVIEW_WIDTH = 360;

const statusLabel: Record<FilePathStatus, { label: string; tone: string }> = {
  ok: { label: '정상', tone: 'text-emerald-500 dark:text-emerald-400' },
  warning: { label: '경고', tone: 'text-amber-500 dark:text-amber-400' },
  error: { label: '오류', tone: 'text-rose-500 dark:text-rose-400' },
};

const extractPath = (value: string | string[] | null): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

const formatMtime = (value?: number | null) => {
  if (!value) return '—';
  try {
    return new Date(value * 1000).toLocaleString();
  } catch {
    return value.toString();
  }
};

const FileDetailSidebar: React.FC<Props> = ({ moaId, image, onClose }) => {
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>({ busy: false });

  const { ensureThumbnails } = useThumbnails({ moaId, maxBatchSize: 20 });

  const previewKey = useMemo(() => {
    if (!image) return null;
    return convertToThumbKey(image.hash, {
      width: PREVIEW_WIDTH,
      height: 0,
      dpr: 1,
      mode: ResizeMode.Original,
    });
  }, [image]);

  const thumbEntry = useThumbStore(
    useShallow(state => ({
      entry: previewKey ? state.byKey[previewKey] : undefined,
    })),
  );

  const previewSrc = useMemo(() => {
    const entry = thumbEntry.entry;
    if (!entry || entry.status !== 'ready' || !entry.url) return undefined;
    return convertFileSrc(entry.url);
  }, [thumbEntry]);

  useEffect(() => {
    let cancelled = false;
    if (!image || !moaId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    ensureThumbnails([
      {
        hash: image.hash,
        width: PREVIEW_WIDTH,
        height: 0,
        mode: ResizeMode.Original,
      },
    ]).catch(() => {
      /* ignore preview errors */
    });

    (async () => {
      try {
        const result = await ipc.file.getFileDetail(moaId, image.hash);
        if (!cancelled) {
          setDetail(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '파일 정보를 불러오지 못했습니다');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [image, moaId, ensureThumbnails]);

  const handleRefresh = async () => {
    if (!moaId || !image) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.file.getFileDetail(moaId, image.hash);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 정보를 새로고침할 수 없습니다');
    } finally {
      setLoading(false);
    }
  };

  const setActionError = (err: string | null) => {
    toast.error(err);
  };

  const performPathAction = async (fn: () => Promise<FileDetail>, targetId?: string) => {
    setActionState({ busy: true, targetId });
    setActionError(null);
    try {
      const result = await fn();
      setDetail(result);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '잘못된 파일 경로입니다.');
    } finally {
      setActionState({ busy: false, targetId: undefined });
    }
  };

  const handleAddPath = async () => {
    if (!moaId || !image) return;
    const selection = extractPath(await openDialog({ multiple: false }));
    if (!selection) return;
    await performPathAction(() => ipc.file.linkFilePath(moaId, image.hash, { path: selection }));
  };

  const handleReplacePath = async (info: FilePathInfo) => {
    if (!moaId || !image) return;
    const selection = extractPath(await openDialog({ multiple: false }));
    if (!selection) return;
    await performPathAction(
      () =>
        ipc.file.linkFilePath(moaId, image.hash, {
          path: selection,
          replacePathId: info.id,
        }),
      info.id,
    );
  };

  const handleRemovePath = async (info: FilePathInfo) => {
    if (!moaId || !image) return;
    await performPathAction(() => ipc.file.removeFilePath(moaId, image.hash, info.id), info.id);
  };

  const handleReveal = async (info: FilePathInfo) => {
    if (!info.path) return;
    try {
      await ipc.file.revealInExplorer(info.path);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '파일 탐색기를 열 수 없습니다');
    }
  };

  if (!image) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-soft">
        이미지를 선택하면 세부 정보를 확인할 수 있습니다
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-raised border-l border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-text">{image.name}</h2>
          {detail?.file.mime && <span className="text-xs text-text-soft">{detail.file.mime}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="icon" onClick={handleRefresh} disabled={loading} title="새로고침">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          {onClose && (
            <Button variant="icon" onClick={onClose} title="닫기">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 space-y-6">
        {error && (
          <div className="rounded-md border border-rose-400/60 bg-rose-100/70 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface-muted">
            {previewSrc ? (
              <img src={previewSrc} alt={image.name} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-text-soft text-sm">
                미리보기를 준비 중입니다
              </div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-text-soft">파일 이름</dt>
              <dd className="font-medium text-text break-all">
                {detail?.file.fileName ?? image.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-soft">용량</dt>
              <dd className="font-medium text-text">
                {detail ? formatBytes(detail.file.size) : '측정 중...'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-soft">원본 크기</dt>
              <dd className="font-medium text-text">
                {detail?.file.width && detail?.file.height
                  ? `${detail.file.width} × ${detail.file.height}`
                  : '정보 없음'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-soft">해시</dt>
              <dd className="font-mono text-xs text-text break-all">{image.hash}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-text">연결된 폴더</h3>
          {detail?.folders && detail.folders.length > 0 ? (
            <ul className="space-y-1 text-sm text-text">
              {detail.folders.map(folder => (
                <li key={folder.nodeId} className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-text-soft" />
                  <span className="truncate">{folder.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-soft">연결된 폴더 노드가 없습니다.</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">파일 경로</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAddPath}
              disabled={actionState.busy}
              className="flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> 경로 추가
            </Button>
          </div>
          {detail?.paths?.length ? (
            <div className="space-y-3">
              {detail.paths.map(pathInfo => {
                const status = statusLabel[pathInfo.status];
                const busy = actionState.busy && actionState.targetId === pathInfo.id;
                return (
                  <div
                    key={pathInfo.id}
                    className="rounded-lg border border-border bg-surface-muted px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-text break-all">
                          {pathInfo.path ?? '저장된 경로 정보 없음'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-soft">
                          <span className={cn('font-semibold', status.tone)}>{status.label}</span>
                          {pathInfo.warning && <span>{pathInfo.warning}</span>}
                          {pathInfo.error && (
                            <span className="text-rose-500 dark:text-rose-300">
                              {pathInfo.error}
                            </span>
                          )}
                          {!pathInfo.exists && !pathInfo.error && (
                            <span className="text-rose-500 dark:text-rose-300">
                              파일을 찾을 수 없습니다
                            </span>
                          )}
                          {pathInfo.hashMatches === false && (
                            <span className="text-rose-500 dark:text-rose-300">해시 불일치</span>
                          )}
                          {pathInfo.hashMatches && <span>해시 일치</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="icon"
                          title="파일 위치 열기"
                          onClick={() => handleReveal(pathInfo)}
                          disabled={!pathInfo.path || busy}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="icon"
                          title="경로 수정"
                          onClick={() => handleReplacePath(pathInfo)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <PencilLine className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="icon"
                          title="경로 제거"
                          onClick={() => handleRemovePath(pathInfo)}
                          disabled={busy}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-soft">
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide">
                          기록된 수정시간
                        </span>
                        <span>{formatMtime(pathInfo.storedMtime)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wide">
                          현재 수정시간
                        </span>
                        <span>{formatMtime(pathInfo.currentMtime)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-text-soft">연결된 파일 경로가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileDetailSidebar;
