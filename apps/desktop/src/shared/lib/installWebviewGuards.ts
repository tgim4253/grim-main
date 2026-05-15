let webviewGuardsInstalled = false;

function hasFileDragData(dataTransfer: DataTransfer | null) {
  return Array.from(dataTransfer?.types ?? []).includes('Files');
}

function preventBrowserDropNavigation(event: DragEvent) {
  event.preventDefault();

  if (!hasFileDragData(event.dataTransfer) && event.dataTransfer) {
    event.dataTransfer.dropEffect = 'none';
  }
}

function preventNativeContextMenu(event: MouseEvent) {
  event.preventDefault();
}

export function installWebviewGuards() {
  if (webviewGuardsInstalled) {
    return;
  }

  webviewGuardsInstalled = true;

  window.addEventListener('dragenter', preventBrowserDropNavigation, true);
  window.addEventListener('dragover', preventBrowserDropNavigation, true);
  window.addEventListener('drop', preventBrowserDropNavigation, true);
  window.addEventListener('contextmenu', preventNativeContextMenu, true);
}
