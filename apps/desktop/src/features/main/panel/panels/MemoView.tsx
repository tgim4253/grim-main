import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PointerSelectionMode, PointerSelectionRect, usePointerSelection } from '@tgim/hooks';
import { NodeCrop, NodeFile, NodeMemo } from '@tgim/types/graph';
import { FileDetail } from '@tgim/types/file';
import { ipc } from '../../../../lib/ipc';
import Button from '@tgim/ui/Button';
import Modal from '@tgim/ui/Modal';
import { toast } from 'react-toastify';
import { cn } from '@tgim/utils/index';
import Switch from '@tgim/ui/Switch';

type SelectionData = {
  display: { x: number; y: number; width: number; height: number };
  absolute: { startX: number; startY: number; width: number; height: number };
  normalized: { startX: number; startY: number; width: number; height: number };
};

const MIN_SELECTION_SIZE = 4;
const FULL_IMAGE_TOLERANCE = 1e-3;

const clampSelectionToBounds = (
  rect: PointerSelectionRect,
  bounds: DOMRect,
): { x: number; y: number; width: number; height: number } | null => {
  const startX = Math.max(rect.x, bounds.left);
  const startY = Math.max(rect.y, bounds.top);
  const endX = Math.min(rect.x + rect.width, bounds.right);
  const endY = Math.min(rect.y + rect.height, bounds.bottom);

  if (endX <= startX || endY <= startY) {
    return null;
  }

  return {
    x: startX - bounds.left,
    y: startY - bounds.top,
    width: endX - startX,
    height: endY - startY,
  };
};

const computeSelectionData = (
  rect: PointerSelectionRect,
  bounds: DOMRect,
  sourceWidth: number,
  sourceHeight: number,
): SelectionData | null => {
  const display = clampSelectionToBounds(rect, bounds);
  if (!display || sourceWidth <= 0 || sourceHeight <= 0) return null;

  const scaleX = sourceWidth / bounds.width;
  const scaleY = sourceHeight / bounds.height;

  const absolute = {
    startX: display.x * scaleX,
    startY: display.y * scaleY,
    width: display.width * scaleX,
    height: display.height * scaleY,
  };

  const normalized = {
    startX: absolute.startX / sourceWidth,
    startY: absolute.startY / sourceHeight,
    width: absolute.width / sourceWidth,
    height: absolute.height / sourceHeight,
  };

  return { display, absolute, normalized };
};

const resolveCropRect = (crop: NodeCrop, sourceWidth: number, sourceHeight: number) => {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;

  const referenceWidth = crop.referenceWidth ?? sourceWidth;
  const referenceHeight = crop.referenceHeight ?? sourceHeight;

  if (referenceWidth <= 0 || referenceHeight <= 0) {
    return null;
  }

  let startX = crop.startX;
  let startY = crop.startY;
  let width = crop.width;
  let height = crop.height;

  if (crop.isRelative) {
    startX *= referenceWidth;
    startY *= referenceHeight;
    width *= referenceWidth;
    height *= referenceHeight;
  }

  const scaleX = sourceWidth / referenceWidth;
  const scaleY = sourceHeight / referenceHeight;

  return {
    startX: startX * scaleX,
    startY: startY * scaleY,
    width: width * scaleX,
    height: height * scaleY,
  };
};

const approx = (value: number, expected: number, tolerance = FULL_IMAGE_TOLERANCE) =>
  Math.abs(value - expected) <= tolerance;

const formatDimensions = (width: number, height: number) =>
  `${Math.round(width)} × ${Math.round(height)}`;

export interface MemoEntry {
  memoNodeId: string;
  memo: NodeMemo;
  attachmentNodeId: string;
  attachmentKind: 'file' | 'crop' | 'unknown';
  crop?: NodeCrop;
}

interface PendingCropData {
  absolute: { startX: number; startY: number; width: number; height: number };
  normalized: { startX: number; startY: number; width: number; height: number };
  referenceWidth: number;
  referenceHeight: number;
}

interface MemoViewProps {
  file: NodeFile;
  moaId: string;
  targetNodeId: string;
  memoEntries: MemoEntry[];
  onRefresh: () => Promise<void>;
}

const MemoView: React.FC<MemoViewProps> = ({ file, moaId, targetNodeId, memoEntries, onRefresh }) => {
  const [mode, setMode] = useState<PointerSelectionMode>('freeform');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [pendingCrop, setPendingCrop] = useState<PendingCropData | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMemoText, setCreateMemoText] = useState('');
  const [creatingMemo, setCreatingMemo] = useState(false);
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null);
  const [activeMemoText, setActiveMemoText] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [previewMode, setPreviewMode] = useState<'crop' | 'original'>('crop');

  const interactionSurfaceRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const sourceWidth = detail?.file.width ?? naturalSize?.width ?? null;
  const sourceHeight = detail?.file.height ?? naturalSize?.height ?? null;

  useEffect(() => {
    let cancelled = false;
    setImageStatus('loading');
    setImageSrc(null);
    setNaturalSize(null);

    const loadImage = async () => {
      try {
        const path = await ipc.file.getFilePath(moaId, file.xxh364);
        if (cancelled) return;
        setImageSrc(convertFileSrc(path));
        setImageStatus('loading');
      } catch (error) {
        console.error('[MemoView] Failed to load original image path', error);
        if (cancelled) return;
        setImageStatus('error');
        toast.error('원본 이미지를 불러올 수 없습니다.');
      }
    };

    void loadImage();

    return () => {
      cancelled = true;
    };
  }, [file.xxh364, moaId]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);

    const loadDetail = async () => {
      try {
        const nextDetail = await ipc.file.getFileDetail(moaId, file.xxh364);
        if (cancelled) return;
        setDetail(nextDetail);
      } catch (error) {
        console.error('[MemoView] Failed to load file detail', error);
        if (cancelled) return;
        toast.error('이미지 정보를 불러오지 못했습니다.');
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [file.xxh364, moaId]);

  useEffect(() => {
    setActiveMemoId(null);
    setActiveMemoText('');
  }, [file.nodeId]);

  const handleImageLoad = useCallback(() => {
    if (!imageRef.current) return;
    setNaturalSize({
      width: imageRef.current.naturalWidth,
      height: imageRef.current.naturalHeight,
    });
    setImageStatus('ready');
  }, []);

  const handleImageError = useCallback(() => {
    setImageStatus('error');
    setImageSrc(null);
    toast.error('이미지를 표시할 수 없습니다.');
  }, []);

  const selectionEnabled =
    imageStatus === 'ready' && !creatingMemo && sourceWidth != null && sourceHeight != null;

  const {
    selection,
    completedSelection,
    resetSelection,
    clearCompletedSelection,
    handlePointerDown: basePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = usePointerSelection<HTMLDivElement>({
    mode,
    minSize: MIN_SELECTION_SIZE,
    disabled: !selectionEnabled,
  });

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!selectionEnabled || !imageRef.current) return;
      const bounds = imageRef.current.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        return;
      }
      basePointerDown(event);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore if pointer capture fails
      }
    },
    [basePointerDown, selectionEnabled],
  );

  const displaySelection = useMemo(() => {
    if (!selection || !imageRef.current || !interactionSurfaceRef.current) return null;
    if (sourceWidth == null || sourceHeight == null) return null;

    const imageRect = imageRef.current.getBoundingClientRect();
    const surfaceRect = interactionSurfaceRef.current.getBoundingClientRect();

    const data = computeSelectionData(selection, imageRect, sourceWidth, sourceHeight);
    if (!data) return null;

    const offsetLeft = imageRect.left - surfaceRect.left;
    const offsetTop = imageRect.top - surfaceRect.top;

    return {
      x: data.display.x + offsetLeft,
      y: data.display.y + offsetTop,
      width: data.display.width,
      height: data.display.height,
    };
  }, [selection, sourceWidth, sourceHeight]);

  useEffect(() => {
    if (!completedSelection || !imageRef.current) return;
    if (sourceWidth == null || sourceHeight == null) {
      clearCompletedSelection();
      resetSelection();
      toast.error('이미지 크기를 확인할 수 없습니다.');
      return;
    }

    const bounds = imageRef.current.getBoundingClientRect();
    const data = computeSelectionData(completedSelection, bounds, sourceWidth, sourceHeight);
    if (!data) {
      clearCompletedSelection();
      resetSelection();
      toast.error('선택 영역이 유효하지 않습니다.');
      return;
    }

    const { absolute, normalized } = data;

    const isFullImage =
      approx(normalized.startX, 0) &&
      approx(normalized.startY, 0) &&
      approx(normalized.width, 1) &&
      approx(normalized.height, 1);

    if (isFullImage) {
      toast.warn('이미지 전체는 선택할 수 없습니다.');
      clearCompletedSelection();
      resetSelection();
      return;
    }

    const referenceWidth = detail?.file.width ?? Math.round(sourceWidth);
    const referenceHeight = detail?.file.height ?? Math.round(sourceHeight);

    setPendingCrop({ absolute, normalized, referenceWidth, referenceHeight });
    setCreateMemoText('');
    setCreateModalOpen(true);
    clearCompletedSelection();
    resetSelection();
  }, [
    clearCompletedSelection,
    completedSelection,
    detail?.file.height,
    detail?.file.width,
    resetSelection,
    sourceHeight,
    sourceWidth,
  ]);

  const cropMemoEntries = useMemo<MemoEntry[]>(
    () => memoEntries.filter(entry => entry.attachmentKind === 'crop' && entry.crop),
    [memoEntries],
  );

  const memoNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    cropMemoEntries.forEach((entry: MemoEntry, index: number) => {
      map.set(entry.memoNodeId, index + 1);
    });
    return map;
  }, [cropMemoEntries]);

  const overlayRects = useMemo(() => {
    if (!imageRef.current || !interactionSurfaceRef.current) return [] as Array<{
      entry: MemoEntry;
      rect: { x: number; y: number; width: number; height: number } | null;
    }>;
    if (sourceWidth == null || sourceHeight == null) return [];

    const imageRect = imageRef.current.getBoundingClientRect();
    const surfaceRect = interactionSurfaceRef.current.getBoundingClientRect();

    return cropMemoEntries.map(entry => {
      const rect = entry.crop
        ? resolveCropRect(entry.crop, sourceWidth, sourceHeight)
        : null;
      if (!rect) {
        return { entry, rect: null };
      }

      const scaleX = imageRect.width / sourceWidth;
      const scaleY = imageRect.height / sourceHeight;

      const x = rect.startX * scaleX + (imageRect.left - surfaceRect.left);
      const y = rect.startY * scaleY + (imageRect.top - surfaceRect.top);
      const width = rect.width * scaleX;
      const height = rect.height * scaleY;

      return {
        entry,
        rect: { x, y, width, height },
      };
    });
  }, [cropMemoEntries, sourceHeight, sourceWidth]);

  const activeMemo = useMemo(
    () => memoEntries.find(entry => entry.memoNodeId === activeMemoId) ?? null,
    [activeMemoId, memoEntries],
  );

  useEffect(() => {
    if (!activeMemo) {
      setActiveMemoText('');
      setPreviewMode('crop');
      return;
    }
    setActiveMemoText(activeMemo.memo.text ?? '');
    setPreviewMode('crop');
  }, [activeMemo]);

  const handleCreateMemo = useCallback(async () => {
    if (!moaId) return;
    setCreatingMemo(true);
    try {
      await ipc.memo.createMemo(moaId, {
        targetNodeId,
        text: createMemoText,
        crop: pendingCrop
          ? {
              rect: {
                startX: pendingCrop.absolute.startX,
                startY: pendingCrop.absolute.startY,
                width: pendingCrop.absolute.width,
                height: pendingCrop.absolute.height,
              },
              referenceWidth: pendingCrop.referenceWidth,
              referenceHeight: pendingCrop.referenceHeight,
              isRelative: false,
            }
          : null,
        originHash: pendingCrop ? file.xxh364 : null,
      });
      toast.success('메모를 생성했습니다.');
      setCreateModalOpen(false);
      setPendingCrop(null);
      setCreateMemoText('');
      await onRefresh();
    } catch (error) {
      console.error('[MemoView] Failed to create memo', error);
      toast.error('메모를 생성하지 못했습니다.');
    } finally {
      setCreatingMemo(false);
    }
  }, [createMemoText, file.xxh364, moaId, onRefresh, pendingCrop, targetNodeId]);

  const handleUpdateMemo = useCallback(async () => {
    if (!moaId || !activeMemo) return;
    setSavingMemo(true);
    try {
      await ipc.memo.updateMemoText(moaId, {
        nodeId: activeMemo.memoNodeId,
        text: activeMemoText,
      });
      toast.success('메모를 저장했습니다.');
      await onRefresh();
    } catch (error) {
      console.error('[MemoView] Failed to update memo', error);
      toast.error('메모를 저장하지 못했습니다.');
    } finally {
      setSavingMemo(false);
    }
  }, [activeMemo, activeMemoText, moaId, onRefresh]);

  const createDisabled = creatingMemo || (!pendingCrop && !createMemoText.trim());
  const updateDisabled =
    savingMemo || activeMemo == null || activeMemoText === (activeMemo.memo.text ?? '');

  const sortedMemos = useMemo(() => {
    return [...memoEntries].sort((a, b) => {
      const aTime = new Date(a.memo.createdAt).getTime();
      const bTime = new Date(b.memo.createdAt).getTime();
      return bTime - aTime;
    });
  }, [memoEntries]);

  const renderCropPreview = useCallback(
    (crop: NodeCrop | undefined | null) => {
      if (!crop || !imageSrc || sourceWidth == null || sourceHeight == null) {
        return null;
      }
      const rect = resolveCropRect(crop, sourceWidth, sourceHeight);
      if (!rect) return null;

      const maxEdge = Math.max(rect.width, rect.height);
      const scale = maxEdge > 0 ? Math.min(220 / maxEdge, 1) : 1;
      const displayWidth = Math.max(rect.width * scale, 1);
      const displayHeight = Math.max(rect.height * scale, 1);
      const backgroundSize = `${sourceWidth * scale}px ${sourceHeight * scale}px`;
      const backgroundPosition = `${-rect.startX * scale}px ${-rect.startY * scale}px`;

      return (
        <div
          className="overflow-hidden rounded-md border border-border bg-background"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <div
            className="h-full w-full"
            style={{
              backgroundImage: `url("${imageSrc}")`,
              backgroundRepeat: 'no-repeat',
              backgroundSize,
              backgroundPosition,
            }}
          />
        </div>
      );
    },
    [imageSrc, sourceHeight, sourceWidth],
  );

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">{file.fileName}</h2>
          <p className="text-sm text-muted-foreground">
            드래그하여 영역을 지정하거나 영역 없이 메모를 추가할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              setPendingCrop(null);
              setCreateMemoText('');
              setCreateModalOpen(true);
            }}
          >
            영역 없이 메모 추가
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="toggle"
              active={mode === 'freeform'}
              onClick={() => setMode('freeform')}
            >
              자유 형태
            </Button>
            <Button
              type="button"
              variant="toggle"
              active={mode === 'square'}
              onClick={() => setMode('square')}
            >
              정사각형
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        <div
          ref={interactionSurfaceRef}
          className={cn(
            'relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted',
            creatingMemo && 'opacity-75',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={event => {
            handlePointerUp(event);
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
              // ignore
            }
          }}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
        >
          {imageSrc && imageStatus !== 'error' ? (
            <>
              <img
                ref={imageRef}
                src={imageSrc}
                alt={file.fileName}
                onLoad={handleImageLoad}
                onError={handleImageError}
                className="max-h-full max-w-full object-contain"
              />
              {imageStatus === 'loading' ? (
                <span className="absolute bottom-3 left-3 rounded bg-surface px-2 py-1 text-xs text-muted-foreground shadow">
                  이미지를 불러오는 중...
                </span>
              ) : null}
            </>
          ) : imageStatus === 'loading' ? (
            <span className="text-sm text-muted-foreground">이미지를 불러오는 중...</span>
          ) : (
            <span className="text-sm text-destructive">이미지를 표시할 수 없습니다.</span>
          )}

          {displaySelection ? (
            <div
              className="pointer-events-none absolute border-2 border-accent/80 bg-accent/10"
              style={{
                left: displaySelection.x,
                top: displaySelection.y,
                width: displaySelection.width,
                height: displaySelection.height,
              }}
            />
          ) : null}

          {overlayRects.map(({ entry, rect }) => {
            if (!rect) return null;
            const number = memoNumberMap.get(entry.memoNodeId);
            return (
              <button
                key={entry.memoNodeId}
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setActiveMemoId(entry.memoNodeId);
                }}
                className="group absolute rounded border-2 border-primary/80 bg-primary/10 text-left shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                }}
              >
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-primary px-1 text-xs font-semibold text-primary-foreground">
                  {number}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex w-72 flex-col gap-3 overflow-y-auto pr-1">
          <h3 className="text-sm font-semibold">메모</h3>
          {sortedMemos.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 생성된 메모가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedMemos.map(entry => {
                const number = memoNumberMap.get(entry.memoNodeId);
                const isCropMemo = entry.attachmentKind === 'crop';
                const firstLine = entry.memo.text?.trim() || '내용이 없는 메모';
                return (
                  <button
                    key={entry.memoNodeId}
                    type="button"
                    onClick={() => setActiveMemoId(entry.memoNodeId)}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3 text-left shadow-sm transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {isCropMemo ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                          {number}
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-muted-foreground">
                          •
                        </span>
                      )}
                      <span>{isCropMemo ? '영역 메모' : '전체 메모'}</span>
                      <span>·</span>
                      <span>{new Date(entry.memo.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="line-clamp-2 text-sm">{firstLine}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
        이미지 위를 드래그하여 메모를 남길 영역을 선택하거나, 상단 버튼을 눌러 영역 없이 메모를 추가할 수 있습니다.
      </div>

      {createModalOpen ? (
        <Modal
          onClose={() => {
            setCreateModalOpen(false);
            setPendingCrop(null);
            setCreateMemoText('');
          }}
          className="max-w-[600px]"
        >
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">새 메모 작성</h3>
            {pendingCrop ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">선택된 영역</span>
                {renderCropPreview(
                  pendingCrop
                    ? {
                        nodeId: 'pending',
                        originHash: file.xxh364,
                        startX: pendingCrop.absolute.startX,
                        startY: pendingCrop.absolute.startY,
                        width: pendingCrop.absolute.width,
                        height: pendingCrop.absolute.height,
                        referenceWidth: pendingCrop.referenceWidth,
                        referenceHeight: pendingCrop.referenceHeight,
                        isRelative: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      }
                    : null,
                )}
                <p className="text-xs text-muted-foreground">
                  크기: {formatDimensions(pendingCrop.absolute.width, pendingCrop.absolute.height)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">이 메모는 이미지 전체와 연결됩니다.</p>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="new-memo-text">
                메모 내용
              </label>
              <textarea
                id="new-memo-text"
                value={createMemoText}
                onChange={event => setCreateMemoText(event.target.value)}
                className="min-h-[120px] w-full resize-y rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                placeholder="메모를 입력하세요"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreateModalOpen(false);
                  setPendingCrop(null);
                  setCreateMemoText('');
                }}
              >
                취소
              </Button>
              <Button type="button" onClick={handleCreateMemo} disabled={createDisabled}>
                {creatingMemo ? '저장 중...' : '메모 저장'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {activeMemo && (
        <Modal onClose={() => setActiveMemoId(null)} className="max-h-[90vh] max-w-[900px] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">메모 상세 보기</h3>
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">원본 이미지</span>
                <div className="flex max-h-72 w-72 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-3">
                  {imageSrc ? (
                    <img src={imageSrc} alt={file.fileName} className="max-h-64 w-auto object-contain" />
                  ) : (
                    <span className="text-sm text-muted-foreground">이미지를 불러오는 중...</span>
                  )}
                </div>
              </div>
              {activeMemo.crop ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">연결된 영역</span>
                    <Switch
                      current={previewMode}
                      onChanged={value => setPreviewMode(value as 'crop' | 'original')}
                      options={[
                        { name: '크롭 보기', value: 'crop' },
                        { name: '원본 보기', value: 'original' },
                      ]}
                    />
                  </div>
                  <div className="flex max-h-72 w-72 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-3">
                    {previewMode === 'crop'
                      ? renderCropPreview(activeMemo.crop)
                      : imageSrc && (
                          <img src={imageSrc} alt={file.fileName} className="max-h-64 w-auto object-contain" />
                        )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      if (sourceWidth != null && sourceHeight != null) {
                        const rect = resolveCropRect(activeMemo.crop, sourceWidth, sourceHeight);
                        if (rect) {
                          return `크기: ${formatDimensions(rect.width, rect.height)}`;
                        }
                      }
                      return `크기: ${formatDimensions(activeMemo.crop.width, activeMemo.crop.height)}`;
                    })()}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="memo-detail-text">
                메모 내용
              </label>
              <textarea
                id="memo-detail-text"
                value={activeMemoText}
                onChange={event => setActiveMemoText(event.target.value)}
                className="min-h-[160px] w-full resize-y rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>생성일: {new Date(activeMemo.memo.createdAt).toLocaleString()}</span>
              <span>수정일: {new Date(activeMemo.memo.updatedAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setActiveMemoId(null)}>
                닫기
              </Button>
              <Button type="button" onClick={handleUpdateMemo} disabled={updateDisabled}>
                {savingMemo ? '저장 중...' : '변경 사항 저장'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MemoView;

