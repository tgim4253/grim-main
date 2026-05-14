import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type SetStateAction,
} from 'react';
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_RESIZE_STEP,
  clampSidebarWidth,
  getSidebarMaxWidth,
} from './sidebarSize';

export type LibrarySidebarSplitterProps = {
  role: 'separator';
  tabIndex: 0;
  'aria-orientation': 'vertical';
  'aria-valuemin': number;
  'aria-valuemax': number;
  'aria-valuenow': number;
  'data-dragging'?: 'true';
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
};

export type LibrarySidebarResizeState = {
  isSidebarPanelOpen: boolean;
  isResizingSidebar: boolean;
  resolvedSidebarWidth: number;
  sidebarMaxWidth: number;
  sidebarStyle: CSSProperties;
  setIsSidebarPanelOpen: Dispatch<SetStateAction<boolean>>;
  splitterProps: LibrarySidebarSplitterProps;
};

export function useLibrarySidebarResize(): LibrarySidebarResizeState {
  const [isSidebarPanelOpen, setIsSidebarPanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const resizeSessionRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  );

  const handleSplitterPointerDown = useCallback(
    (event: Parameters<PointerEventHandler<HTMLDivElement>>[0]) => {
      if (!isSidebarPanelOpen) {
        return;
      }

      resizeSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizingSidebar(true);
      event.preventDefault();
    },
    [isSidebarPanelOpen, sidebarWidth],
  );

  const handleSplitterPointerMove = useCallback(
    (event: Parameters<PointerEventHandler<HTMLDivElement>>[0]) => {
      const session = resizeSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      const nextWidth = clampSidebarWidth(session.startWidth + (event.clientX - session.startX));
      setSidebarWidth(nextWidth);
      event.preventDefault();
    },
    [],
  );

  const handleSplitterPointerEnd = useCallback(
    (event: Parameters<PointerEventHandler<HTMLDivElement>>[0]) => {
      const session = resizeSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      resizeSessionRef.current = null;
      setIsResizingSidebar(false);
    },
    [],
  );

  const handleSplitterKeyDown = useCallback(
    (event: Parameters<KeyboardEventHandler<HTMLDivElement>>[0]) => {
      if (!isSidebarPanelOpen) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSidebarWidth(current => clampSidebarWidth(current - SIDEBAR_RESIZE_STEP));
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSidebarWidth(current => clampSidebarWidth(current + SIDEBAR_RESIZE_STEP));
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setSidebarWidth(SIDEBAR_MIN_WIDTH);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        setSidebarWidth(getSidebarMaxWidth());
      }
    },
    [isSidebarPanelOpen],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !isSidebarPanelOpen) {
      return;
    }

    const handleResize = () => {
      setSidebarWidth(current => clampSidebarWidth(current));
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isSidebarPanelOpen]);

  useEffect(() => {
    if (!isResizingSidebar) {
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
  }, [isResizingSidebar]);

  const resolvedSidebarWidth = isSidebarPanelOpen
    ? clampSidebarWidth(sidebarWidth)
    : SIDEBAR_COLLAPSED_WIDTH;
  const sidebarMaxWidth = getSidebarMaxWidth();
  const sidebarStyle = {
    width: `${String(resolvedSidebarWidth)}px`,
    minWidth: `${String(resolvedSidebarWidth)}px`,
  };

  return {
    isSidebarPanelOpen,
    isResizingSidebar,
    resolvedSidebarWidth,
    sidebarMaxWidth,
    sidebarStyle,
    setIsSidebarPanelOpen,
    splitterProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'vertical',
      'aria-valuemin': SIDEBAR_MIN_WIDTH,
      'aria-valuemax': sidebarMaxWidth,
      'aria-valuenow': Math.round(resolvedSidebarWidth),
      'data-dragging': isResizingSidebar ? 'true' : undefined,
      onPointerDown: handleSplitterPointerDown,
      onPointerMove: handleSplitterPointerMove,
      onPointerUp: handleSplitterPointerEnd,
      onPointerCancel: handleSplitterPointerEnd,
      onKeyDown: handleSplitterKeyDown,
    },
  };
}
