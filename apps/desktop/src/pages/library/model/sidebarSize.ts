export const SIDEBAR_COLLAPSED_WIDTH = 48;
export const SIDEBAR_DEFAULT_WIDTH = 343;
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_RESIZE_STEP = 24;
export const MAIN_CONTAINER_MIN_WIDTH = 320;

export function getSidebarMaxWidth() {
  if (typeof window === 'undefined') {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - MAIN_CONTAINER_MIN_WIDTH);
}

export function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), getSidebarMaxWidth());
}
