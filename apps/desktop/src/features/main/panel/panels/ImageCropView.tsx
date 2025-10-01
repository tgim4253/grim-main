import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PointerSelectionMode, PointerSelectionRect, usePointerSelection } from '@tgim/hooks';
import { NodeCrop, NodeFile } from '@tgim/types/graph';
import { FileDetail } from '@tgim/types/file';
import { ipc } from '../../../../lib/ipc';
import { Split } from '@tgim/ui/Splitter';
import Button from '@tgim/ui/Button';
import Modal from '@tgim/ui/Modal';
import { cn } from '@tgim/utils/index';
import { toast } from 'react-toastify';
import { toAbsoluteCropRect } from '@tgim/utils/crop';
import { CropPreview } from '@tgim/ui';

interface CropEntry {
  nodeId: string;
  crop: NodeCrop;
}

interface ImageCropViewProps {
  file: NodeFile;
  moaId: string;
  crops: CropEntry[];
  onRefresh: () => Promise<void>;
}

type SelectionData = {
  display: { x: number; y: number; width: number; height: number };
  absolute: { startX: number; startY: number; width: number; height: number };
  normalized: { startX: number; startY: number; width: number; height: number };
};

const FULL_IMAGE_TOLERANCE = 1e-3;
const PREVIEW_MAX_EDGE = 220;
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

  const normalized = {
    startX: absolute.startX / sourceWidth,
    startY: absolute.startY / sourceHeight,
    width: absolute.width / sourceWidth,
    height: absolute.height / sourceHeight,
  };

  return { display, absolute, normalized };
};

const approx = (value: number, expected: number, tolerance = FULL_IMAGE_TOLERANCE) =>
  Math.abs(value - expected) <= tolerance;

const formatDimensions = (width: number, height: number) =>
  `${Math.round(width)} × ${Math.round(height)}`;

const ImageCropView: React.FC<ImageCropViewProps> = ({ file, moaId, crops, onRefresh }) => {
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [mode, setMode] = useState<PointerSelectionMode>('freeform');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [activeCrop, setActiveCrop] = useState<CropEntry | null>(null);
  const [creatingCrop, setCreatingCrop] = useState(false);

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
        console.error('[ImageCropView] Failed to load original image path', error);
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
        console.error('[ImageCropView] Failed to load file detail', error);
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
    setActiveCrop(null);
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
    imageStatus === 'ready' && !creatingCrop && sourceWidth != null && sourceHeight != null;

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

    const createCrop = async () => {
      setCreatingCrop(true);
      try {
        await ipc.graph.createImageCrop(moaId, {
          originNodeId: file.nodeId,
          originHash: file.xxh364,
          rect: {
            startX: absolute.startX,
            startY: absolute.startY,
            width: absolute.width,
            height: absolute.height,
          },
          referenceWidth,
          referenceHeight,
          isRelative: false,
          normalizedRect: {
            startX: normalized.startX,
            startY: normalized.startY,
            width: normalized.width,
            height: normalized.height,
          },
        });
        await onRefresh();
      } catch (error) {
        console.error('[ImageCropView] Failed to create crop node', error);
        toast.error('크롭을 생성하지 못했습니다.');
      } finally {
        setCreatingCrop(false);
        clearCompletedSelection();
        resetSelection();
      }
    };

    void createCrop();
  }, [
    clearCompletedSelection,
    completedSelection,
    detail?.file.height,
    detail?.file.width,
    file.nodeId,
    file.xxh364,
    moaId,
    onRefresh,
    resetSelection,
    sourceHeight,
    sourceWidth,
  ]);

  const sortedCrops = useMemo(() => {
    return [...crops].sort((a, b) => {
      const aTime = new Date(a.crop.createdAt).getTime();
      const bTime = new Date(b.crop.createdAt).getTime();
      return bTime - aTime;
    });
  }, [crops]);

  const renderCropPreview = useCallback(
    (entry: CropEntry) => {
      if (!imageSrc || sourceWidth == null || sourceHeight == null) return null;
      const rect = toAbsoluteCropRect(entry.crop, sourceWidth, sourceHeight);
      if (!rect) return null;

      return (
        <button
          key={entry.nodeId}
          type="button"
          onClick={() => setActiveCrop(entry)}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-2 text-left shadow-sm transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CropPreview
            imageSrc={imageSrc}
            rect={rect}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            maxEdge={PREVIEW_MAX_EDGE}
            className="flex items-center justify-center"
          />
          <div className="flex flex-col text-xs text-muted-foreground">
            <span>크기: {formatDimensions(rect.width, rect.height)}</span>
            <span>
              위치: {Math.round(rect.startX)}, {Math.round(rect.startY)}
            </span>
          </div>
        </button>
      );
    },
    [imageSrc, sourceHeight, sourceWidth],
  );

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <Split position="horizontal" className="h-full w-full">
        {({ Panel: SplitPanel }) => (
          <>
            <SplitPanel key="crop-view" minSize={360}>
              <div className="flex h-full min-h-0 w-full flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <h2 className="text-lg font-semibold">{file.fileName}</h2>
                    <p className="text-sm text-muted-foreground">
                      드래그하여 새로운 크롭을 생성하세요.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="icon"
                    className="h-8 w-8"
                    onClick={() => setSidebarVisible(prev => !prev)}
                    aria-label={sidebarVisible ? '옵션 숨기기' : '옵션 보기'}
                    aria-controls="image-crop-options"
                    aria-expanded={sidebarVisible}
                  >
                    {sidebarVisible ? '>' : '<'}
                  </Button>
                </div>
                <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
                  <div
                    ref={interactionSurfaceRef}
                    className={cn(
                      'relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted',
                      creatingCrop && 'opacity-75',
                    )}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={event => {
                      handlePointerUp(event);
                      try {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      } catch {
                        // ignore release failure
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
                  </div>
                  <div className="flex w-64 flex-col gap-3 overflow-y-auto pr-1">
                    <h3 className="text-sm font-semibold">생성된 크롭</h3>
                    {sortedCrops.length === 0 ? (
                      <p className="text-sm text-muted-foreground">아직 생성된 크롭이 없습니다.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {sortedCrops.map(entry => renderCropPreview(entry))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SplitPanel>
            <SplitPanel
              key="crop-options"
              canHidden
              hidden={!sidebarVisible}
              onHidden={hidden => hidden && setSidebarVisible(false)}
              hiddenSize={200}
              minSize={240}
              initialSize={280}
            >
              <div
                id="image-crop-options"
                className="flex h-full w-full flex-col gap-4 border-l border-border bg-surface-muted p-4"
              >
                <h3 className="text-base font-semibold">크롭 옵션</h3>
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">선택 모드</span>
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
                <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                  이미지 위를 드래그하여 영역을 선택하면 새로운 크롭이 생성됩니다. 전체 이미지를
                  선택하는 것은 허용되지 않습니다.
                </div>
              </div>
            </SplitPanel>
          </>
        )}
      </Split>

      {activeCrop && imageSrc && sourceWidth != null && sourceHeight != null ? (
        <Modal onClose={() => setActiveCrop(null)} className="max-h-[90vh] max-w-[90vw]">
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">크롭 상세 보기</h3>
            {(() => {
              const rect = toAbsoluteCropRect(activeCrop.crop, sourceWidth, sourceHeight);
              if (!rect) {
                return (
                  <p className="text-sm text-muted-foreground">크롭 정보를 불러올 수 없습니다.</p>
                );
              }

              return (
                <div className="flex flex-col gap-3">
                  <CropPreview
                    imageSrc={imageSrc}
                    rect={rect}
                    sourceWidth={sourceWidth}
                    sourceHeight={sourceHeight}
                    maxEdge={600}
                    className="self-start rounded-xl border border-border bg-background shadow"
                  />
                  <div className="text-sm text-muted-foreground">
                    <p>크기: {formatDimensions(rect.width, rect.height)}</p>
                    <p>
                      위치: {Math.round(rect.startX)}, {Math.round(rect.startY)}
                    </p>
                    <p>생성일: {new Date(activeCrop.crop.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

export default ImageCropView;
