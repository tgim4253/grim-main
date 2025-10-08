import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEventHandler } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileType } from '@tgim/types/file';
import { NodeCrop, NodeFile } from '@tgim/types/graph';
import { ipc } from '../../../../lib/ipc';
import { FileText, Pipette } from 'lucide-react';
import { cn } from '@tgim/utils/index';
import { Split } from '@tgim/ui/Splitter';
import Button from '@tgim/ui/Button';
import FileDetailSidebar from './FileDetailSidebar';
import { ImageItem } from '@tgim/types/grid';
import { useNormalizedCropRect } from '@tgim/hooks/useCropRect';

interface FileViewerProps {
  file: NodeFile;
  moaId: string | null;
  className?: string;
  crop?: NodeCrop | null;
}

const FileViewer: React.FC<FileViewerProps> = ({ file, moaId, className, crop }) => {
  const [viewerSidebarVisible, setViewerSidebarVisible] = useState(false);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    file.kind === FileType.Image ? 'loading' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const imageWrapperRef = useRef<HTMLDivElement | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [imageMetrics, setImageMetrics] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const normalizedCropRect = useNormalizedCropRect(crop);
  type RgbColor = { r: number; g: number; b: number };

  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [hoverColor, setHoverColor] = useState<RgbColor | null>(null);
  const [hoverTooltipPosition, setHoverTooltipPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [selectedColor, setSelectedColor] = useState<RgbColor | null>(null);

  const formatRgb = (color: RgbColor) =>
    `rgb(${color.r.toString()}, ${color.g.toString()}, ${color.b.toString()})`;

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
      canvasRef.current = null;
      canvasContextRef.current = null;
      return;
    }

    const img = imageElementRef.current;
    if (!img) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    const drawImage = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvasRef.current = canvas;
      canvasContextRef.current = context;
    };

    let cleanup: (() => void) | undefined;
    if (img.complete && img.naturalWidth && img.naturalHeight) {
      drawImage();
    } else {
      const handleLoad = () => {
        drawImage();
      };
      img.addEventListener('load', handleLoad, { once: true });
      cleanup = () => {
        img.removeEventListener('load', handleLoad);
      };
    }

    return () => {
      cleanup?.();
      canvasRef.current = null;
      canvasContextRef.current = null;
    };
  }, [status, imageSrc]);

  useEffect(() => {
    setSelectedColor(null);
    setEyedropperActive(false);
    setHoverColor(null);
    setHoverTooltipPosition(null);
  }, [file.xxh364]);

  const handleToggleEyedropper = () => {
    setEyedropperActive(prev => {
      const next = !prev;
      if (!next) {
        setHoverColor(null);
        setHoverTooltipPosition(null);
      }
      return next;
    });
  };

  const handlePointerMove: MouseEventHandler<HTMLDivElement> = event => {
    if (!eyedropperActive) return;
    const wrapper = imageWrapperRef.current;
    const img = imageElementRef.current;
    const metrics = imageMetrics;
    const context = canvasContextRef.current;
    if (!wrapper || !img || !metrics || !context) return;

    const rect = wrapper.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const relativeY = event.clientY - rect.top;

    const imageX = relativeX - metrics.offsetX;
    const imageY = relativeY - metrics.offsetY;

    if (imageX < 0 || imageY < 0 || imageX > metrics.width || imageY > metrics.height) {
      setHoverColor(null);
      setHoverTooltipPosition(null);
      return;
    }

    const naturalX = Math.floor((imageX / Math.max(metrics.width, 1e-6)) * img.naturalWidth);
    const naturalY = Math.floor((imageY / Math.max(metrics.height, 1e-6)) * img.naturalHeight);

    if (
      naturalX < 0 ||
      naturalY < 0 ||
      naturalX >= img.naturalWidth ||
      naturalY >= img.naturalHeight
    ) {
      setHoverColor(null);
      setHoverTooltipPosition(null);
      return;
    }

    try {
      const pixel = context.getImageData(naturalX, naturalY, 1, 1).data;
      const color = { r: pixel[0], g: pixel[1], b: pixel[2] };
      setHoverColor(color);

      const tooltipPadding = 16;
      const tooltipWidth = 120;
      const tooltipHeight = 48;
      const clampedX = Math.min(
        Math.max(relativeX + tooltipPadding, 0),
        Math.max(rect.width - tooltipWidth, 0),
      );
      const clampedY = Math.min(
        Math.max(relativeY + tooltipPadding, 0),
        Math.max(rect.height - tooltipHeight, 0),
      );
      setHoverTooltipPosition({ x: clampedX, y: clampedY });
    } catch (error) {
      console.error('[FileViewer] Failed to read pixel data', error);
    }
  };

  const handleMouseLeave: MouseEventHandler<HTMLDivElement> = () => {
    setHoverColor(null);
    setHoverTooltipPosition(null);
  };

  const handleImageClick: MouseEventHandler<HTMLDivElement> = event => {
    if (!eyedropperActive) return;
    event.preventDefault();
    if (!hoverColor) return;
    setSelectedColor(hoverColor);
    setEyedropperActive(false);
    setHoverColor(null);
    setHoverTooltipPosition(null);
  };

  useEffect(() => {
    if (!normalizedCropRect) {
      setImageMetrics(null);
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

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });
    if (imageWrapperRef.current) {
      resizeObserver.observe(imageWrapperRef.current);
    }

    const img = imageElementRef.current;
    if (img) {
      img.addEventListener('load', updateMetrics);
    }

    updateMetrics();

    return () => {
      resizeObserver.disconnect();
      if (img) {
        img.removeEventListener('load', updateMetrics);
      }
    };
  }, [imageSrc, normalizedCropRect]);

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
                {
                  <div className="absolute right-0 top-0 flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="icon"
                        aria-label={eyedropperActive ? '스포이드 비활성화' : '스포이드 활성화'}
                        title={eyedropperActive ? '스포이드 비활성화' : '스포이드 활성화'}
                        onClick={handleToggleEyedropper}
                        className={cn(
                          'h-8 w-8',
                          eyedropperActive &&
                            'bg-primary text-primary-foreground hover:bg-primary/90',
                        )}
                      >
                        <Pipette className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="icon"
                        aria-label={viewerSidebarVisible ? '사이드바 닫기' : '사이드바 열기'}
                        title={viewerSidebarVisible ? '사이드바 닫기' : '사이드바 열기'}
                        onClick={() => {
                          setViewerSidebarVisible(prev => !prev);
                        }}
                        className="h-8 w-8"
                        aria-controls="viewer-sidebar"
                        aria-expanded={viewerSidebarVisible}
                      >
                        {/* Keep it simple — use chevrons as text fallback */}
                        {viewerSidebarVisible ? '>' : '<'}
                      </Button>
                    </div>
                    {selectedColor ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-mono shadow">
                        <span
                          className="h-3 w-3 rounded-sm border border-border"
                          style={{
                            backgroundColor: formatRgb(selectedColor),
                          }}
                          aria-hidden
                        />
                        <span>{formatRgb(selectedColor)}</span>
                      </div>
                    ) : null}
                  </div>
                }

                {/* Header (non-scrolling) */}
                <div className="flex flex-shrink-0 flex-col items-center gap-1 text-center px-8 pt-1">
                  {/* Guard against file being null/undefined */}
                  <p className="max-w-full truncate text-lg font-semibold">{file.fileName}</p>
                  <p className="text-sm text-muted-foreground">{fileDescription}</p>
                </div>

                {/* Content area (scrolling) */}
                <div className="flex-1 min-h-0">
                  {file.kind === FileType.Image ? (
                    <div
                      ref={imageWrapperRef}
                      className={cn(
                        'relative flex h-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted',
                        eyedropperActive && 'cursor-crosshair',
                      )}
                      onMouseMove={handlePointerMove}
                      onMouseLeave={handleMouseLeave}
                      onClick={handleImageClick}
                    >
                      {status === 'ready' && imageSrc ? (
                        <>
                          <img
                            ref={imageElementRef}
                            src={imageSrc}
                            alt={file.fileName}
                            className="h-full w-full max-h-full max-w-full object-contain"
                          />
                          {eyedropperActive && hoverColor && hoverTooltipPosition ? (
                            <div
                              className="pointer-events-none absolute z-10 flex flex-col items-center gap-1"
                              style={{
                                left: hoverTooltipPosition.x,
                                top: hoverTooltipPosition.y,
                              }}
                            >
                              <div className="rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-mono shadow">
                                {formatRgb(hoverColor)}
                              </div>
                              <div
                                className="h-4 w-4 rounded-sm border border-border"
                                style={{
                                  backgroundColor: formatRgb(hoverColor),
                                }}
                              />
                            </div>
                          ) : null}
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
              </div>
            </SplitPanel>

            {/* SIDEBAR (can be hidden) */}
            {image ? (
              <SplitPanel
                key="viewer-sidebar"
                canHidden
                hidden={!viewerSidebarVisible}
                onHidden={hidden => {
                  if (hidden) setViewerSidebarVisible(false);
                }}
                hiddenSize={200}
                minSize={280}
                initialSize={360}
              >
                {/* Add id for aria-controls */}
                <div id="viewer-sidebar" className="h-full min-h-0">
                  <FileDetailSidebar
                    image={image}
                    onClose={() => {
                      setViewerSidebarVisible(false);
                    }}
                  />
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
