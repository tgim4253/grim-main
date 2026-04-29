import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import { IconButton } from '../icon-button/IconButton';
import './preview-panel.css';

const PREVIEW_PANEL_DEFAULT_WIDTH = 320;
const PREVIEW_PANEL_MIN_WIDTH = 280;
const PREVIEW_PANEL_MAX_WIDTH = 560;
const PREVIEW_PANEL_RESIZE_STEP = 24;
const PREVIEW_PANEL_CONTAINER_REMAINDER = 320;

function clampPreviewPanelWidth(width: number, maxWidth: number) {
  return Math.min(Math.max(width, PREVIEW_PANEL_MIN_WIDTH), maxWidth);
}

export type PreviewPanelProps = {
  title: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
};

export function PreviewPanel({
  title,
  ariaLabel,
  children,
  className,
  onClose,
}: PreviewPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const resizeSessionRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  );
  const [panelWidth, setPanelWidth] = useState(PREVIEW_PANEL_DEFAULT_WIDTH);
  const [maxPanelWidth, setMaxPanelWidth] = useState(PREVIEW_PANEL_MAX_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const getAvailableMaxWidth = useCallback(() => {
    const panelElement = panelRef.current;
    const containerElement =
      panelElement?.parentElement?.parentElement ?? panelElement?.parentElement;
    const containerWidth = containerElement?.getBoundingClientRect().width;
    const availableWidth =
      typeof containerWidth === 'number' && containerWidth > 0
        ? containerWidth - PREVIEW_PANEL_CONTAINER_REMAINDER
        : PREVIEW_PANEL_MAX_WIDTH;

    return Math.max(PREVIEW_PANEL_MIN_WIDTH, Math.min(PREVIEW_PANEL_MAX_WIDTH, availableWidth));
  }, []);

  const syncMaxWidth = useCallback(() => {
    const nextMaxWidth = getAvailableMaxWidth();
    setMaxPanelWidth(nextMaxWidth);
    setPanelWidth(current => clampPreviewPanelWidth(current, nextMaxWidth));
    return nextMaxWidth;
  }, [getAvailableMaxWidth]);

  const clampPanelWidth = useCallback(
    (width: number) => clampPreviewPanelWidth(width, maxPanelWidth),
    [maxPanelWidth],
  );

  const handleSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nextMaxWidth = syncMaxWidth();
      resizeSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: clampPreviewPanelWidth(panelWidth, nextMaxWidth),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizing(true);
      event.preventDefault();
    },
    [panelWidth, syncMaxWidth],
  );

  const handleSplitterPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = resizeSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      setPanelWidth(clampPanelWidth(session.startWidth + (session.startX - event.clientX)));
      event.preventDefault();
    },
    [clampPanelWidth],
  );

  const handleSplitterPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeSessionRef.current = null;
    setIsResizing(false);
  }, []);

  const handleSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPanelWidth(current => clampPanelWidth(current + PREVIEW_PANEL_RESIZE_STEP));
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPanelWidth(current => clampPanelWidth(current - PREVIEW_PANEL_RESIZE_STEP));
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setPanelWidth(PREVIEW_PANEL_MIN_WIDTH);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        setPanelWidth(syncMaxWidth());
      }
    },
    [clampPanelWidth, syncMaxWidth],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      syncMaxWidth();
    };

    syncMaxWidth();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [syncMaxWidth]);

  useEffect(() => {
    if (!isResizing || typeof document === 'undefined') {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing]);

  const resolvedPanelWidth = clampPanelWidth(panelWidth);
  const panelStyle = {
    '--preview-panel-width': `${String(resolvedPanelWidth)}px`,
  } as CSSProperties;

  return (
    <aside
      ref={panelRef}
      className={cx('preview-panel', className)}
      style={panelStyle}
      aria-label={ariaLabel}
    >
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize preview panel"
        aria-orientation="vertical"
        aria-valuemin={PREVIEW_PANEL_MIN_WIDTH}
        aria-valuemax={Math.round(maxPanelWidth)}
        aria-valuenow={Math.round(resolvedPanelWidth)}
        className="preview-panel__splitter"
        data-dragging={isResizing ? 'true' : undefined}
        onPointerDown={handleSplitterPointerDown}
        onPointerMove={handleSplitterPointerMove}
        onPointerUp={handleSplitterPointerEnd}
        onPointerCancel={handleSplitterPointerEnd}
        onKeyDown={handleSplitterKeyDown}
      />
      <header className="preview-panel__header">
        <h2>{title}</h2>
        {onClose ? (
          <IconButton icon="close" size="sm" aria-label={`Close ${title}`} onClick={onClose} />
        ) : null}
      </header>
      <div className="preview-panel__content">{children}</div>
    </aside>
  );
}
