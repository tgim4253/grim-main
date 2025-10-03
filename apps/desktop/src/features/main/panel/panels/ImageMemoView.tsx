import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PointerSelectionRect, usePointerSelection } from '@tgim/hooks';
import { CreateMemoPayload, NodeCrop, NodeFile, NodeMemo } from '@tgim/types/graph';
import { NormalizedCropRect } from '@tgim/types/crop';
import { FileDetail } from '@tgim/types/file';
import { ipc } from '../../../../lib/ipc';
import { Split } from '@tgim/ui/Splitter';
import Button from '@tgim/ui/Button';
import Modal from '@tgim/ui/Modal';
import Switch from '@tgim/ui/Switch';
import { CropPreview } from '@tgim/ui';
import { toast } from 'react-toastify';
import { toAbsoluteCropRect, toNormalizedCropRect } from '@tgim/utils/crop';
import { cn } from '@tgim/utils/index';

export type MemoAttachmentType = 'file' | 'crop';

export type MemoEntry = {
  memo: NodeMemo;
  attachmentNodeId: string;
  attachmentType: MemoAttachmentType;
  crop?: NodeCrop | null;
};

interface ImageMemoViewProps {
  file: NodeFile;
  moaId: string;
  memoEntries: MemoEntry[];
  onRefresh: () => Promise<void>;
}

type SelectionData = {
  display: { x: number; y: number; width: number; height: number };
  absolute: { startX: number; startY: number; width: number; height: number };
  normalized: NormalizedCropRect;
};

type PendingCropData = {
  absolute: { startX: number; startY: number; width: number; height: number };
  normalized: NormalizedCropRect;
  referenceWidth: number;
  referenceHeight: number;
};

type MemoListItem = MemoEntry & { marker: number };

type ActiveMemoState =
  | { mode: 'existing'; entry: MemoListItem }
  | { mode: 'create'; crop: PendingCropData | null };

const MIN_SELECTION_SIZE = 4;

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

  const normalized: NormalizedCropRect = {
    startX: absolute.startX / sourceWidth,
    startY: absolute.startY / sourceHeight,
    width: absolute.width / sourceWidth,
    height: absolute.height / sourceHeight,
  };

  return { display, absolute, normalized };
};

const approx = (value: number, expected: number, tolerance = 1e-3) =>
  Math.abs(value - expected) <= tolerance;

const ImageMemoView: React.FC<ImageMemoViewProps> = ({ file, moaId, memoEntries, onRefresh }) => {
  const interactionSurfaceRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [imageBounds, setImageBounds] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeMemoState, setActiveMemoState] = useState<ActiveMemoState | null>(null);
  const [draftText, setDraftText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalPreview, setModalPreview] = useState<'original' | 'crop'>('original');

  const sourceWidth = detail?.file.width ?? naturalSize?.width ?? null;
  const sourceHeight = detail?.file.height ?? naturalSize?.height ?? null;

  const memoList = useMemo<MemoListItem[]>(() => {
    return memoEntries
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.memo.createdAt).getTime() || 0;
        const bTime = new Date(b.memo.createdAt).getTime() || 0;
        return aTime - bTime;
      })
      .map((entry, index) => ({ ...entry, marker: index + 1 }));
  }, [memoEntries]);

  const selectionEnabled =
    selectionMode &&
    imageStatus === 'ready' &&
    !isSaving &&
    sourceWidth != null &&
    sourceHeight != null &&
    !activeMemoState;

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
    mode: 'freeform',
    minSize: MIN_SELECTION_SIZE,
    disabled: !selectionEnabled,
  });

  const displaySelection = useMemo(() => {
    if (!selection || !imageRef.current) return null;
    const bounds = imageRef.current.getBoundingClientRect();
    return clampSelectionToBounds(selection, bounds);
  }, [selection]);

  const updateImageBounds = useCallback(() => {
    if (!interactionSurfaceRef.current || !imageRef.current) {
      setImageBounds(null);
      return;
    }
    const imageRect = imageRef.current.getBoundingClientRect();
    const containerRect = interactionSurfaceRef.current.getBoundingClientRect();
    setImageBounds({
      width: imageRect.width,
      height: imageRect.height,
      offsetX: imageRect.left - containerRect.left,
      offsetY: imageRect.top - containerRect.top,
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      updateImageBounds();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateImageBounds]);

  useEffect(() => {
    if (!interactionSurfaceRef.current) return;
    const observer = new ResizeObserver(() => {
      updateImageBounds();
    });
    observer.observe(interactionSurfaceRef.current);
    return () => {
      observer.disconnect();
    };
  }, [updateImageBounds]);

  useEffect(() => {
    updateImageBounds();
  }, [imageStatus, memoEntries, updateImageBounds]);

  useEffect(() => {
    if (!selectionMode) {
      resetSelection();
      clearCompletedSelection();
    }
  }, [selectionMode, resetSelection, clearCompletedSelection]);

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
        console.error('[ImageMemoView] Failed to load original image path', error);
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
        console.error('[ImageMemoView] Failed to load file detail', error);
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
    if (!selectionMode || !completedSelection || !imageRef.current) return;
    if (sourceWidth == null || sourceHeight == null) {
      toast.error('이미지 크기를 확인할 수 없습니다.');
      clearCompletedSelection();
      resetSelection();
      setSelectionMode(false);
      return;
    }

    const bounds = imageRef.current.getBoundingClientRect();
    const data = computeSelectionData(completedSelection, bounds, sourceWidth, sourceHeight);
    if (!data) {
      toast.error('선택 영역이 유효하지 않습니다.');
      clearCompletedSelection();
      resetSelection();
      setSelectionMode(false);
      return;
    }

    const { absolute, normalized } = data;

    const isFullImage =
      approx(normalized.startX, 0) &&
      approx(normalized.startY, 0) &&
      approx(normalized.width, 1) &&
      approx(normalized.height, 1);

    if (isFullImage) {
      toast.warn(
        '이미지 전체는 영역 메모로 생성할 수 없습니다. 상단의 "새 메모" 버튼을 사용하세요.',
      );
      clearCompletedSelection();
      resetSelection();
      setSelectionMode(false);
      return;
    }

    const referenceWidth = detail?.file.width ?? Math.round(sourceWidth);
    const referenceHeight = detail?.file.height ?? Math.round(sourceHeight);

    setActiveMemoState({
      mode: 'create',
      crop: {
        absolute: absolute,
        normalized,
        referenceWidth,
        referenceHeight,
      },
    });
    setDraftText('');
    setModalPreview('crop');
    setSelectionMode(false);
    clearCompletedSelection();
    resetSelection();
  }, [
    clearCompletedSelection,
    completedSelection,
    detail?.file.height,
    detail?.file.width,
    resetSelection,
    selectionMode,
    sourceHeight,
    sourceWidth,
  ]);

  const memoOverlays = useMemo(() => {
    if (!imageBounds) return [] as { item: MemoListItem; style: CSSProperties }[];
    return memoList
      .filter(item => item.attachmentType === 'crop' && item.crop)
      .map(item => {
        const normalized = toNormalizedCropRect(item.crop);
        if (!normalized) return null;
        return {
          item,
          style: {
            left: imageBounds.offsetX + normalized.startX * imageBounds.width,
            top: imageBounds.offsetY + normalized.startY * imageBounds.height,
            width: normalized.width * imageBounds.width,
            height: normalized.height * imageBounds.height,
          } as CSSProperties,
        };
      })
      .filter(Boolean) as { item: MemoListItem; style: CSSProperties }[];
  }, [imageBounds, memoList]);

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
        // ignore
      }
    },
    [basePointerDown, selectionEnabled],
  );

  const handleImageLoad = useCallback(() => {
    if (!imageRef.current) return;
    setNaturalSize({
      width: imageRef.current.naturalWidth,
      height: imageRef.current.naturalHeight,
    });
    setImageStatus('ready');
    updateImageBounds();
  }, [updateImageBounds]);

  const handleImageError = useCallback(() => {
    setImageStatus('error');
    setImageSrc(null);
    toast.error('이미지를 표시할 수 없습니다.');
  }, []);

  const handleOpenMemo = useCallback((item: MemoListItem) => {
    setActiveMemoState({ mode: 'existing', entry: item });
    setDraftText(item.memo.text);
    setModalPreview(item.attachmentType === 'crop' && item.crop ? 'crop' : 'original');
  }, []);

  const handleStartCreate = useCallback(() => {
    setActiveMemoState({ mode: 'create', crop: null });
    setDraftText('');
    setModalPreview('original');
  }, []);

  const handleCloseModal = useCallback(() => {
    if (isSaving) return;
    setActiveMemoState(null);
    setDraftText('');
    setModalPreview('original');
  }, [isSaving]);

  const modalCropRect = useMemo(() => {
    if (!activeMemoState) return null;
    if (activeMemoState.mode === 'existing') {
      const crop = activeMemoState.entry.crop;
      if (!crop) return null;
      return toAbsoluteCropRect(crop, sourceWidth, sourceHeight);
    }
    const cropData = activeMemoState.crop;
    if (!cropData) return null;
    return cropData.absolute;
  }, [activeMemoState, sourceHeight, sourceWidth]);

  const previewOptions = useMemo(() => {
    if (!activeMemoState) return [] as { name: string; value: 'original' | 'crop' }[];
    const options: { name: string; value: 'original' | 'crop' }[] = [];
    if (modalCropRect) {
      options.push({ name: '크롭 이미지', value: 'crop' });
    }
    if (imageSrc) {
      options.push({ name: '원본 이미지', value: 'original' });
    }
    return options;
  }, [activeMemoState, imageSrc, modalCropRect]);

  useEffect(() => {
    if (previewOptions.length === 0) {
      setModalPreview('original');
      return;
    }
    if (!previewOptions.some(option => option.value === modalPreview)) {
      setModalPreview(previewOptions[0]?.value ?? 'original');
    }
  }, [modalPreview, previewOptions]);

  const selectedMemoId =
    activeMemoState && activeMemoState.mode === 'existing'
      ? activeMemoState.entry.memo.nodeId
      : null;

  const canSave = useMemo(() => {
    if (!activeMemoState) return false;
    const trimmed = draftText.trim();
    if (activeMemoState.mode === 'existing') {
      return trimmed !== activeMemoState.entry.memo.text.trim();
    }
    return trimmed.length > 0;
  }, [activeMemoState, draftText]);

  const handleSave = useCallback(async () => {
    if (!activeMemoState || !canSave) return;
    setIsSaving(true);
    try {
      if (activeMemoState.mode === 'existing') {
        await ipc.memo.updateMemoText(moaId, {
          nodeId: activeMemoState.entry.memo.nodeId,
          text: draftText,
        });
        toast.success('메모를 저장했습니다.');
      } else {
        const payload: CreateMemoPayload = {
          targetNodeId: file.nodeId,
          text: draftText,
        };
        if (activeMemoState.crop) {
          const { absolute, referenceWidth, referenceHeight } = activeMemoState.crop;
          payload.crop = {
            rect: absolute,
            referenceWidth,
            referenceHeight,
            isRelative: false,
          };
          payload.originHash = file.xxh364;
        }
        await ipc.memo.createMemo(moaId, payload);
        toast.success('메모를 생성했습니다.');
      }
      await onRefresh();
      setActiveMemoState(null);
      setDraftText('');
      setModalPreview('original');
    } catch (error) {
      console.error('[ImageMemoView] Failed to save memo', error);
      toast.error('메모를 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [activeMemoState, canSave, draftText, file.nodeId, file.xxh364, moaId, onRefresh]);

  const renderMemoListItem = useCallback(
    (item: MemoListItem) => {
      const description = item.attachmentType === 'crop' ? '영역 연결' : '원본 연결';
      return (
        <button
          key={item.memo.nodeId}
          type="button"
          onClick={() => {
            handleOpenMemo(item);
          }}
          className={cn(
            'flex flex-col gap-1 rounded-lg border border-border bg-surface-muted p-3 text-left shadow-sm transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            selectedMemoId === item.memo.nodeId && 'border-accent',
          )}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold">#{item.marker}</span>
            <span>{description}</span>
          </div>
          <p className="line-clamp-2 text-sm text-foreground">
            {item.memo.text.trim() ? item.memo.text : '내용이 없습니다.'}
          </p>
        </button>
      );
    },
    [handleOpenMemo, selectedMemoId],
  );

  const memoInstructions = selectionMode
    ? '영역을 드래그하여 메모를 생성하세요.'
    : '메모를 선택하거나 추가하세요.';

  const selectionToggleDisabled = imageStatus !== 'ready' || isSaving || !!activeMemoState;

  const modalTitle = activeMemoState
    ? activeMemoState.mode === 'existing'
      ? `메모 #${String(activeMemoState.entry.marker)}`
      : '새 메모'
    : '메모';

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <Split position="horizontal" className="h-full w-full">
        {({ Panel: SplitPanel }) => (
          <SplitPanel key="memo-view" minSize={360}>
            <div className="flex h-full min-h-0 w-full flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <h2 className="text-lg font-semibold">{file.fileName}</h2>
                  <p className="text-sm text-muted-foreground">{memoInstructions}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleStartCreate}
                    disabled={isSaving || imageStatus === 'loading' || !!activeMemoState}
                  >
                    새 메모
                  </Button>
                  <Button
                    type="button"
                    variant="toggle"
                    active={selectionMode}
                    onClick={() => {
                      setSelectionMode(prev => !prev);
                    }}
                    disabled={selectionToggleDisabled}
                  >
                    영역 선택
                  </Button>
                </div>
              </div>
              <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
                <div
                  ref={interactionSurfaceRef}
                  className={cn(
                    'relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted',
                    selectionMode && 'cursor-crosshair',
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
                    <img
                      ref={imageRef}
                      src={imageSrc}
                      alt={file.fileName}
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : imageStatus === 'loading' ? (
                    <span className="text-sm text-muted-foreground">이미지를 불러오는 중...</span>
                  ) : (
                    <span className="text-sm text-destructive">이미지를 표시할 수 없습니다.</span>
                  )}

                  {displaySelection ? (
                    <div
                      className="pointer-events-none absolute border-2 border-accent/80 bg-accent/10"
                      style={{
                        left: displaySelection.x + (imageBounds?.offsetX ?? 0),
                        top: displaySelection.y + (imageBounds?.offsetY ?? 0),
                        width: displaySelection.width,
                        height: displaySelection.height,
                      }}
                    />
                  ) : null}

                  {memoOverlays.map(({ item, style }) => (
                    <button
                      key={item.memo.nodeId}
                      type="button"
                      className={cn(
                        'group absolute border-2 border-accent/80 bg-accent/10 text-left text-xs font-semibold text-foreground shadow-sm transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        selectedMemoId === item.memo.nodeId && 'border-accent bg-accent/15',
                      )}
                      style={style}
                      onClick={() => {
                        handleOpenMemo(item);
                      }}
                    >
                      <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shadow">
                        {item.marker}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex w-72 flex-col gap-3 overflow-y-auto pr-1">
                  <h3 className="text-sm font-semibold">메모 목록</h3>
                  {memoList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">아직 생성된 메모가 없습니다.</p>
                  ) : (
                    <div className="flex flex-col gap-3">{memoList.map(renderMemoListItem)}</div>
                  )}
                </div>
              </div>
            </div>
          </SplitPanel>
        )}
      </Split>

      {activeMemoState ? (
        <Modal onClose={handleCloseModal} className="max-h-[90vh] max-w-[80vw]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">{modalTitle}</h3>
              {previewOptions.length > 1 ? (
                <Switch
                  current={modalPreview}
                  onChanged={value => {
                    setModalPreview(value);
                  }}
                  options={previewOptions}
                />
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {previewOptions.map(option => (
                  <span
                    key={option.value}
                    className={cn(
                      'rounded-full border border-border bg-surface-muted px-2 py-1',
                      modalPreview === option.value && 'border-accent text-accent',
                    )}
                  >
                    {option.name}
                  </span>
                ))}
              </div>
              <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted p-4">
                {modalPreview === 'crop' ? (
                  modalCropRect && imageSrc && sourceWidth != null && sourceHeight != null ? (
                    <CropPreview
                      imageSrc={imageSrc}
                      rect={modalCropRect}
                      sourceWidth={sourceWidth}
                      sourceHeight={sourceHeight}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      크롭 이미지를 표시할 수 없습니다.
                    </span>
                  )
                ) : imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={file.fileName}
                    className="max-h-[360px] max-w-full object-contain"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">이미지를 불러오는 중...</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="memo-text">
                메모 내용
              </label>
              <textarea
                id="memo-text"
                value={draftText}
                onChange={event => {
                  setDraftText(event.target.value);
                }}
                placeholder="메모를 입력하세요"
                className="h-32 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCloseModal}
                disabled={isSaving}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleSave()}
                disabled={!canSave || isSaving}
              >
                {activeMemoState.mode === 'existing' ? '저장' : '생성'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

export default ImageMemoView;
