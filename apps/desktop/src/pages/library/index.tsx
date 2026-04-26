import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cx } from '../../shared/lib/cx';
import { ExplorerPanel } from '../../features/library-explorer';
import { ReferencesDummyView } from '../../features/library-workspace';
import { AppTopBar } from '../../ui/Header/AppTopBar';
import {
  MiniSidebarRail,
  type PrimaryRailAction,
  type PrimaryRailItem,
} from '../../ui/Sidebar/MiniSidebarRail';
import { SidebarPanel } from '../../ui/Sidebar/SidebarPanel';
import './library-page.css';

const SIDEBAR_COLLAPSED_WIDTH = 48;
const SIDEBAR_DEFAULT_WIDTH = 343;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_RESIZE_STEP = 24;
const MAIN_CONTAINER_MIN_WIDTH = 320;

function getSidebarMaxWidth() {
  if (typeof window === 'undefined') {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - MAIN_CONTAINER_MIN_WIDTH);
}

function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), getSidebarMaxWidth());
}

export function LibraryPage() {
  const [isSidebarPanelOpen, setIsSidebarPanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const resizeSessionRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  );

  const primaryItems: readonly PrimaryRailItem[] = [
    {
      icon: 'folder-open',
      label: 'Library',
      action: 'toggle-sidebar-panel',
      active: isSidebarPanelOpen,
    },
    {
      icon: 'search',
      label: 'Search',
      action: 'open-search',
    },
    {
      icon: 'grid',
      label: 'Grid',
      action: 'open-grid',
    },
    {
      icon: 'star',
      label: 'Favorites',
      action: 'open-favorites',
    },
  ];

  const handlePrimaryAction = (action: PrimaryRailAction) => {
    if (action === 'toggle-sidebar-panel') {
      setIsSidebarPanelOpen(open => !open);
    }
  };

  const handleSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const handleSplitterPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const nextWidth = clampSidebarWidth(session.startWidth + (event.clientX - session.startX));
    setSidebarWidth(nextWidth);
    event.preventDefault();
  }, []);

  const handleSplitterPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeSessionRef.current = null;
    setIsResizingSidebar(false);
  }, []);

  const handleSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
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

  return (
    <div className="app-shell library-page">
      <AppTopBar />

      <div className="app-horizontal library-page__layout">
        <div
          className={cx(
            'app-sidebar',
            'library-page__sidebar',
            !isSidebarPanelOpen && 'library-page__sidebar--collapsed',
          )}
          style={sidebarStyle}
        >
          <SidebarPanel
            rail={
              <MiniSidebarRail primaryItems={primaryItems} onPrimaryAction={handlePrimaryAction} />
            }
            title="Explorer"
            collapsed={!isSidebarPanelOpen}
          >
            <ExplorerPanel />
          </SidebarPanel>
        </div>

        {isSidebarPanelOpen ? (
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize sidebar panel"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={sidebarMaxWidth}
            aria-valuenow={Math.round(resolvedSidebarWidth)}
            className="library-page__splitter"
            data-dragging={isResizingSidebar ? 'true' : undefined}
            onPointerDown={handleSplitterPointerDown}
            onPointerMove={handleSplitterPointerMove}
            onPointerUp={handleSplitterPointerEnd}
            onPointerCancel={handleSplitterPointerEnd}
            onKeyDown={handleSplitterKeyDown}
          />
        ) : null}

        <main className="app-workspace library-page__workspace library-page__main-container">
          <ReferencesDummyView />
        </main>
      </div>
    </div>
  );
}
