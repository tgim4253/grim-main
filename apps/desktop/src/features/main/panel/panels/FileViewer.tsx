import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileType } from '@tgim/types/file';
import {
  Connection,
  GraphResponse,
  Node,
  NodeCrop,
  NodeFile,
  NodeMemo,
  RelationType,
} from '@tgim/types/graph';
import { ipc } from '../../../../lib/ipc';
import { FileText } from 'lucide-react';
import { cn } from '@tgim/utils/index';
import { Split } from '@tgim/ui/Splitter';
import Button from '@tgim/ui/Button';
import FileDetailSidebar from './FileDetailSidebar';
import { ImageItem } from '@tgim/types/grid';

type NormalizedCropRect = {
  startX: number;
  startY: number;
  width: number;
  height: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toNormalizedCropRect = (crop?: NodeCrop | null): NormalizedCropRect | null => {
  if (!crop) return null;

  const normalizedFromPayload = (crop as unknown as { normalizedRect?: NormalizedCropRect }).normalizedRect;
  if (normalizedFromPayload) {
    const { startX, startY, width, height } = normalizedFromPayload;
    if ([startX, startY, width, height].every(isFiniteNumber)) {
      const startXClamped = clamp01(startX);
      const startYClamped = clamp01(startY);
      const endXClamped = clamp01(startX + width);
      const endYClamped = clamp01(startY + height);
      const normalizedWidth = endXClamped - startXClamped;
      const normalizedHeight = endYClamped - startYClamped;
      if (normalizedWidth > 0 && normalizedHeight > 0) {
        return {
          startX: startXClamped,
          startY: startYClamped,
          width: normalizedWidth,
          height: normalizedHeight,
        };
      }
    }
  }

  const values = [crop.startX, crop.startY, crop.width, crop.height];
  if (!values.every(isFiniteNumber)) {
    return null;
  }

  let startX = crop.startX;
  let startY = crop.startY;
  let width = crop.width;
  let height = crop.height;

  if (!crop.isRelative) {
    const referenceWidth = crop.referenceWidth ?? null;
    const referenceHeight = crop.referenceHeight ?? null;
    if (
      isFiniteNumber(referenceWidth) &&
      referenceWidth > 0 &&
      isFiniteNumber(referenceHeight) &&
      referenceHeight > 0
    ) {
      startX = startX / referenceWidth;
      startY = startY / referenceHeight;
      width = width / referenceWidth;
      height = height / referenceHeight;
    } else {
      const alreadyNormalized = values.every(value => value >= 0 && value <= 1);
      if (!alreadyNormalized) {
        return null;
      }
    }
  }

  const startXClamped = clamp01(startX);
  const startYClamped = clamp01(startY);
  const endXClamped = clamp01(startX + width);
  const endYClamped = clamp01(startY + height);
  const normalizedWidth = endXClamped - startXClamped;
  const normalizedHeight = endYClamped - startYClamped;

  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return null;
  }

  return {
    startX: startXClamped,
    startY: startYClamped,
    width: normalizedWidth,
    height: normalizedHeight,
  };
};

interface FileViewerProps {
  file: NodeFile;
  moaId: string | null;
  className?: string;
  crop?: NodeCrop | null;
  nodesById?: Record<string, Node>;
  connections?: Connection[];
  onGraphUpdate?: (graph: GraphResponse) => void;
}

type MemoAttachmentType = 'file' | 'crop';

type MemoEntry = {
  memo: NodeMemo;
  attachmentNodeId: string;
  attachmentType: MemoAttachmentType;
  crop?: NodeCrop | null;
  marker?: number;
};

const FileViewer: React.FC<FileViewerProps> = ({
  file,
  moaId,
  className,
  crop,
  nodesById,
  connections,
  onGraphUpdate,
}) => {
  const [viewerSidebarVisible, setViewerSidebarVisible] = useState(false);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    file.kind === FileType.Image ? 'loading' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const imageWrapperRef = useRef<HTMLDivElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [imageMetrics, setImageMetrics] = useState<
    { width: number; height: number; offsetX: number; offsetY: number } | null
  >(null);
  const normalizedCropRect = useMemo(() => toNormalizedCropRect(crop), [crop]);
  const [memoItems, setMemoItems] = useState<MemoEntry[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isCreatingMemo, setIsCreatingMemo] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<NormalizedCropRect | null>(null);

  useEffect(() => {
    if (file.kind !== FileType.Image) {
      setImageSrc(null);
      setStatus('idle');
      setErrorMessage(null);
      return;
    }
    if (!moaId) {
      setStatus('error');
      setErrorMessage('이미지를 불러오지 못했습니다.');
      return;
    }

    let isCancelled = false;
    setStatus('loading');
    setErrorMessage(null);

    const fetchImage = async () => {
      try {
        const path = await ipc.file.getFilePath(moaId, file.xxh364);
        if (isCancelled) return;
        setImageSrc(convertFileSrc(path));
        setStatus('ready');
      } catch (error) {
        console.error('[FileViewer] Failed to load original image', error);
        if (isCancelled) return;
        setStatus('error');
        setErrorMessage('이미지를 불러오지 못했습니다.');
      }
    };

    void fetchImage();

    return () => {
      isCancelled = true;
    };
  }, [file.kind, file.xxh364, moaId]);

  useEffect(() => {
    if (status !== 'ready') {
      setImageMetrics(null);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }

    const updateMetrics = () => {
      const wrapper = imageWrapperRef.current;
      const img = imageElementRef.current;
      if (!wrapper || !img) return;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (!(naturalWidth > 0 && naturalHeight > 0)) return;

      const wrapperRect = wrapper.getBoundingClientRect();
      const wrapperWidth = wrapperRect.width;
      const wrapperHeight = wrapperRect.height;
      if (!(wrapperWidth > 0 && wrapperHeight > 0)) return;

      const imageAspect = naturalWidth / naturalHeight;
      const wrapperAspect = wrapperWidth / wrapperHeight;
      let displayWidth = wrapperWidth;
      let displayHeight = wrapperHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (imageAspect > wrapperAspect) {
        displayWidth = wrapperWidth;
        displayHeight = wrapperWidth / Math.max(imageAspect, 1e-6);
        offsetY = (wrapperHeight - displayHeight) / 2;
      } else {
        displayHeight = wrapperHeight;
        displayWidth = wrapperHeight * imageAspect;
        offsetX = (wrapperWidth - displayWidth) / 2;
      }

      setImageMetrics({ width: displayWidth, height: displayHeight, offsetX, offsetY });
    };

    const resizeObserver = new ResizeObserver(() => updateMetrics());
    const wrapper = imageWrapperRef.current;
    if (wrapper) {
      resizeObserver.observe(wrapper);
    }

    const img = imageElementRef.current;
    if (img) {
      img.addEventListener('load', updateMetrics);
      if (img.complete) {
        updateMetrics();
      }
    }

    updateMetrics();

    return () => {
      resizeObserver.disconnect();
      if (img) {
        img.removeEventListener('load', updateMetrics);
      }
    };
  }, [imageSrc, status]);

  const fileDescription = useMemo(() => {
    switch (file.kind) {
      case FileType.Image:
        return '이미지 파일';
      case FileType.Video:
        return '비디오 파일';
      case FileType.Document:
        return '문서 파일';
      case FileType.Audio:
        return '오디오 파일';
      case FileType.Archive:
        return '압축 파일';
      case FileType.GraphicTool:
        return '그래픽 툴 파일';
      default:
        return '파일';
    }
  }, [file.kind]);

  const image: ImageItem | null = useMemo(() => {
    if (file.kind == FileType.Image && file.xxh364) {
      return {
        id: file.xxh364,
        name: file.fileName,
        type: file.kind,
        hash: file.xxh364,
        size: file.size,
        nodeId: file.nodeId,
      };
    } else {
      return null;
    }
  }, [file]);
  useEffect(() => {
    if (!nodesById || !connections) {
      setMemoItems([]);
      return;
    }

    const directMemoEntries: MemoEntry[] = [];

    connections
      .filter(connection => connection.srcNodeId === file.nodeId && connection.kind === RelationType.Memo)
      .forEach(connection => {
        const memoNode = nodesById[connection.dstNodeId];
        const memoData = memoNode?.data?.['Memo'];
        if (memoData) {
          directMemoEntries.push({
            memo: memoData,
            attachmentNodeId: file.nodeId,
            attachmentType: 'file',
          });
        }
      });

    const cropMemoEntries: MemoEntry[] = [];
    let marker = 1;

    connections
      .filter(connection => connection.srcNodeId === file.nodeId && connection.kind === RelationType.Cropped)
      .forEach(connection => {
        const cropNodeId = connection.dstNodeId;
        const cropNode = nodesById[cropNodeId];
        const cropData = cropNode?.data?.['Crop'] as NodeCrop | undefined;
        if (!cropData) {
          return;
        }

        const relatedMemos = connections.filter(
          candidate => candidate.srcNodeId === cropNodeId && candidate.kind === RelationType.Memo,
        );

        if (relatedMemos.length === 0) {
          return;
        }

        relatedMemos.forEach(memoConnection => {
          const memoNode = nodesById[memoConnection.dstNodeId];
          const memoData = memoNode?.data?.['Memo'];
          if (memoData) {
            cropMemoEntries.push({
              memo: memoData,
              attachmentNodeId: cropNodeId,
              attachmentType: 'crop',
              crop: cropData,
              marker,
            });
          }
        });

        marker += 1;
      });

    const merged = [...directMemoEntries, ...cropMemoEntries];
    setMemoItems(merged);
  }, [connections, file.nodeId, nodesById]);

  useEffect(() => {
    if (memoItems.length === 0) {
      setSelectedMemoId(null);
      setDraftText('');
      return;
    }

    setSelectedMemoId(prev => {
      if (prev && memoItems.some(entry => entry.memo.nodeId === prev)) {
        return prev;
      }
      return memoItems[0]?.memo.nodeId ?? null;
    });
  }, [memoItems]);

  useEffect(() => {
    if (!selectedMemoId) {
      setDraftText('');
      return;
    }

    const entry = memoItems.find(item => item.memo.nodeId === selectedMemoId);
    setDraftText(entry?.memo.text ?? '');
  }, [memoItems, selectedMemoId]);

  const handleSaveMemo = useCallback(async () => {
    if (!moaId || !selectedMemoId) return;
    setIsSavingMemo(true);
    try {
      const updated = await ipc.memo.updateMemoText(moaId, {
        nodeId: selectedMemoId,
        text: draftText,
      });

      setMemoItems(prev =>
        prev.map(entry =>
          entry.memo.nodeId === updated.nodeId
            ? { ...entry, memo: { ...entry.memo, text: updated.text, updatedAt: updated.updatedAt } }
            : entry,
        ),
      );
    } catch (error) {
      console.error('[FileViewer] Failed to update memo text', error);
    } finally {
      setIsSavingMemo(false);
    }
  }, [draftText, moaId, selectedMemoId]);

  const handleCreateMemo = useCallback(async () => {
    if (!moaId) return;
    setIsCreatingMemo(true);
    try {
      const result = await ipc.memo.createMemo(moaId, {
        targetNodeId: file.nodeId,
        text: '',
      });
      onGraphUpdate?.(result.graph);
      setSelectedMemoId(result.memo.nodeId);
    } catch (error) {
      console.error('[FileViewer] Failed to create memo', error);
    } finally {
      setIsCreatingMemo(false);
    }
  }, [file.nodeId, moaId, onGraphUpdate]);

  const finalizeSelection = useCallback(
    async (rect: NormalizedCropRect) => {
      if (!moaId || !file.xxh364) return;
      setIsCreatingMemo(true);
      try {
        const result = await ipc.memo.createMemo(moaId, {
          targetNodeId: file.nodeId,
          text: '',
          crop: {
            rect: {
              startX: rect.startX,
              startY: rect.startY,
              width: rect.width,
              height: rect.height,
            },
            isRelative: true,
            referenceHeight: null,
            referenceWidth: null,
          },
          originHash: file.xxh364,
        });
        onGraphUpdate?.(result.graph);
        setSelectedMemoId(result.memo.nodeId);
      } catch (error) {
        console.error('[FileViewer] Failed to create memo with crop', error);
      } finally {
        setIsCreatingMemo(false);
      }
    },
    [file.nodeId, file.xxh364, moaId, onGraphUpdate],
  );

  const handlePointerDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionMode || status !== 'ready' || !imageWrapperRef.current || !imageMetrics) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();

      const bounds = imageWrapperRef.current.getBoundingClientRect();
      const relativeX = clamp01((event.clientX - bounds.left - imageMetrics.offsetX) / imageMetrics.width);
      const relativeY = clamp01((event.clientY - bounds.top - imageMetrics.offsetY) / imageMetrics.height);

      dragStartRef.current = { x: relativeX, y: relativeY };
      setSelectionRect({ startX: relativeX, startY: relativeY, width: 0, height: 0 });
    },
    [imageMetrics, selectionMode, status],
  );

  const handlePointerMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionMode || !dragStartRef.current || !imageWrapperRef.current || !imageMetrics) {
        return;
      }
      event.preventDefault();

      const bounds = imageWrapperRef.current.getBoundingClientRect();
      const currentX = clamp01((event.clientX - bounds.left - imageMetrics.offsetX) / imageMetrics.width);
      const currentY = clamp01((event.clientY - bounds.top - imageMetrics.offsetY) / imageMetrics.height);

      const start = dragStartRef.current;
      const startX = Math.min(start.x, currentX);
      const startY = Math.min(start.y, currentY);
      const width = Math.abs(currentX - start.x);
      const height = Math.abs(currentY - start.y);

      setSelectionRect({ startX, startY, width, height });
    },
    [imageMetrics, selectionMode],
  );

  const clearSelectionRect = useCallback(() => {
    dragStartRef.current = null;
    setSelectionRect(null);
  }, []);

  const handlePointerUp = useCallback(async () => {
    if (!selectionMode || !dragStartRef.current || !selectionRect) {
      clearSelectionRect();
      setSelectionMode(false);
      return;
    }

    dragStartRef.current = null;

    if (selectionRect.width < 0.01 || selectionRect.height < 0.01) {
      clearSelectionRect();
      setSelectionMode(false);
      return;
    }

    const rect = selectionRect;
    clearSelectionRect();
    setSelectionMode(false);
    await finalizeSelection(rect);
  }, [clearSelectionRect, finalizeSelection, selectionMode, selectionRect]);

  const handlePointerLeave = useCallback(() => {
    if (!selectionMode || !dragStartRef.current) {
      return;
    }
    clearSelectionRect();
  }, [clearSelectionRect, selectionMode]);

  const selectedMemo = useMemo(
    () => memoItems.find(entry => entry.memo.nodeId === selectedMemoId) ?? null,
    [memoItems, selectedMemoId],
  );

  const isImageFile = file.kind === FileType.Image;

  return (
    <div
      className={cn(
        // Root must be able to shrink; min-h-0 prevents overflow in nested flex
        'flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-6 text-foreground',
        className,
      )}
    >
      <Split position="horizontal" className="h-full w-full">
        {({ Panel: SplitPanel }) => (
          <>
            {/* VIEWER */}
            <SplitPanel key="viewer" minSize={320}>
              {/* Make this column fill the panel and allow inner scrolling */}
              <div className="flex h-full min-h-0 w-full flex-col gap-3 relative">
                {/* Toggle button pinned to the top-right over the viewer */}
                {file ? (
                  <Button
                    type="button"
                    variant="icon"
                    aria-label={viewerSidebarVisible ? '사이드바 닫기' : '사이드바 열기'}
                    title={viewerSidebarVisible ? '사이드바 닫기' : '사이드바 열기'}
                    onClick={() => setViewerSidebarVisible(prev => !prev)}
                    className="absolute right-0 top-0 h-8 w-8"
                    aria-controls="viewer-sidebar"
                    aria-expanded={viewerSidebarVisible}
                  >
                    {/* Keep it simple — use chevrons as text fallback */}
                    {viewerSidebarVisible ? '>' : '<'}
                  </Button>
                ) : null}

                {/* Header (non-scrolling) */}
                <div className="flex flex-shrink-0 flex-col items-center gap-1 text-center px-8 pt-1">
                  {/* Guard against file being null/undefined */}
                  <p className="max-w-full truncate text-lg font-semibold">
                    {file?.fileName ?? '파일 없음'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {fileDescription ?? '파일 설명이 없습니다.'}
                  </p>
                </div>

                {/* Content area (scrolling) */}
                <div className="flex-1 min-h-0">
                  {isImageFile ? (
                    <div
                      ref={imageWrapperRef}
                      className="relative flex h-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted"
                      onMouseDown={handlePointerDown}
                      onMouseMove={handlePointerMove}
                      onMouseUp={handlePointerUp}
                      onMouseLeave={handlePointerLeave}
                    >
                      {status === 'ready' && imageSrc ? (
                        <>
                          <img
                            ref={imageElementRef}
                            src={imageSrc}
                            alt={file?.fileName ?? 'image'}
                            className="h-full w-full max-h-full max-w-full object-contain"
                          />
                          {normalizedCropRect && imageMetrics ? (
                            <div
                              className="pointer-events-none absolute rounded-md border-2 border-primary/80 bg-primary/15 shadow-[0_0_0_1px_rgba(15,23,42,0.15)]"
                              style={{
                                left:
                                  imageMetrics.offsetX +
                                  normalizedCropRect.startX * imageMetrics.width,
                                top:
                                  imageMetrics.offsetY +
                                  normalizedCropRect.startY * imageMetrics.height,
                                width: normalizedCropRect.width * imageMetrics.width,
                                height: normalizedCropRect.height * imageMetrics.height,
                              }}
                            />
                          ) : null}
                          {selectionMode ? (
                            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/70 px-3 py-1 text-xs font-medium text-foreground shadow">
                              드래그하여 메모 영역을 선택하세요.
                            </div>
                          ) : null}
                          {selectionRect && imageMetrics ? (
                            <div
                              className="pointer-events-none absolute rounded-md border-2 border-accent/80 bg-accent/20"
                              style={{
                                left:
                                  imageMetrics.offsetX + selectionRect.startX * imageMetrics.width,
                                top:
                                  imageMetrics.offsetY + selectionRect.startY * imageMetrics.height,
                                width: selectionRect.width * imageMetrics.width,
                                height: selectionRect.height * imageMetrics.height,
                              }}
                            />
                          ) : null}
                          {memoItems
                            .filter(item => item.attachmentType === 'crop' && item.marker && imageMetrics && item.crop)
                            .map(item => {
                              const rect = toNormalizedCropRect(item.crop);
                              if (!rect) return null;
                              return (
                                <div
                                  key={item.memo.nodeId}
                                  className="pointer-events-none absolute flex items-center justify-center rounded-md border border-primary bg-primary/40 text-xs font-bold text-primary-foreground"
                                  style={{
                                    left:
                                      imageMetrics.offsetX + rect.startX * imageMetrics.width,
                                    top: imageMetrics.offsetY + rect.startY * imageMetrics.height,
                                    width: rect.width * imageMetrics.width,
                                    height: rect.height * imageMetrics.height,
                                  }}
                                >
                                  {item.marker}
                                </div>
                              );
                            })}
                        </>
                      ) : status === 'loading' ? (
                        <p className="text-sm text-muted-foreground">이미지를 불러오는 중...</p>
                      ) : (
                        <p className="text-sm text-destructive">
                          {errorMessage ?? '이미지를 불러오지 못했습니다.'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface-muted px-6">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                      <div className="flex flex-col items-center gap-1 text-center">
                        <p className="text-sm text-muted-foreground">
                          미리보기를 지원하지 않는 파일입니다.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          그래프 보기에서 다른 관계를 탐색해 보세요.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {isImageFile ? (
                  <div className="mt-4 flex h-[260px] min-h-[220px] flex-col overflow-hidden rounded-lg border border-border bg-surface-muted/40">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                      <h3 className="text-sm font-medium">메모</h3>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={selectionMode ? 'primary' : 'secondary'}
                          disabled={isCreatingMemo || status !== 'ready'}
                          onClick={() => {
                            if (selectionMode) {
                              setSelectionMode(false);
                              setSelectionRect(null);
                              dragStartRef.current = null;
                              return;
                            }
                            setSelectionMode(true);
                            setSelectionRect(null);
                            dragStartRef.current = null;
                          }}
                        >
                          {selectionMode ? '선택 취소' : '영역 선택'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isCreatingMemo}
                          onClick={handleCreateMemo}
                        >
                          원본에 메모 추가
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-1 min-h-0 divide-x divide-border">
                      <div className="w-48 flex-shrink-0 overflow-y-auto">
                        {memoItems.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-muted-foreground">등록된 메모가 없습니다.</p>
                        ) : (
                          <ul className="divide-y divide-border/60">
                            {memoItems.map(entry => {
                              const isSelected = entry.memo.nodeId === selectedMemoId;
                              return (
                                <li key={entry.memo.nodeId}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMemoId(entry.memo.nodeId)}
                                    className={cn(
                                      'flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm transition-colors',
                                      isSelected
                                        ? 'bg-primary/10 text-foreground'
                                        : 'hover:bg-muted text-muted-foreground',
                                    )}
                                  >
                                    <span className="font-medium text-xs uppercase text-muted-foreground">
                                      {entry.attachmentType === 'file'
                                        ? '원본'
                                        : `크롭 #${entry.marker ?? ''}`}
                                    </span>
                                    <span className="line-clamp-2 text-sm">
                                      {entry.memo.text.trim() ? entry.memo.text : '새 메모'}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                          {selectedMemo ? (
                            <span>
                              {selectedMemo.attachmentType === 'file'
                                ? '원본 이미지 메모'
                                : `크롭 #${selectedMemo.marker ?? ''} 메모`}
                            </span>
                          ) : (
                            <span>메모를 선택하세요.</span>
                          )}
                          <span className="text-xs">
                            {selectedMemo ? `최근 수정: ${selectedMemo.memo.updatedAt}` : ''}
                          </span>
                        </div>
                        <div className="flex-1 min-h-0 px-4 pb-4">
                          <textarea
                            value={draftText}
                            onChange={event => setDraftText(event.target.value)}
                            className="h-full w-full resize-none rounded-md border border-border bg-background p-3 text-sm shadow-inner focus:border-primary focus:outline-none"
                            placeholder={selectedMemo ? '메모 내용을 입력하세요.' : '메모를 선택하면 내용을 편집할 수 있습니다.'}
                            disabled={!selectedMemo || isSavingMemo}
                          />
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={!selectedMemo || isSavingMemo}
                            onClick={handleSaveMemo}
                          >
                            {isSavingMemo ? '저장 중...' : '메모 저장'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </SplitPanel>

            {/* SIDEBAR (can be hidden) */}
            {image ? (
              <SplitPanel
                key="viewer-sidebar"
                canHidden
                hidden={!viewerSidebarVisible}
                onHidden={hidden => hidden && setViewerSidebarVisible(false)}
                hiddenSize={200}
                minSize={280}
                initialSize={360}
              >
                {/* Add id for aria-controls */}
                <div id="viewer-sidebar" className="h-full min-h-0">
                  <FileDetailSidebar image={image} onClose={() => setViewerSidebarVisible(false)} />
                </div>
              </SplitPanel>
            ) : null}
          </>
        )}
      </Split>
    </div>
  );
};

export default FileViewer;
