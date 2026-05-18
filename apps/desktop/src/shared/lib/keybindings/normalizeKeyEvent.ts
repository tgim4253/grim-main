const keyAliases: Readonly<Record<string, string>> = {
  ' ': 'space',
  Spacebar: 'space',
  Esc: 'escape',
  Escape: 'escape',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  Del: 'delete',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  Control: 'ctrl',
  Meta: 'meta',
  Alt: 'alt',
  Option: 'alt',
  Shift: 'shift',
};

export function normalizeKeyEvent(event: KeyboardEvent): string {
  const baseKey = normalizeKeyboardKey(event.key);
  const keyParts = [
    event.ctrlKey ? 'ctrl' : null,
    event.metaKey ? 'meta' : null,
    event.altKey ? 'alt' : null,
    event.shiftKey ? 'shift' : null,
    baseKey,
  ];

  return Array.from(new Set(keyParts.filter((part): part is string => Boolean(part)))).join('+');
}

function normalizeKeyboardKey(key: string): string {
  return keyAliases[key] ?? key.toLowerCase();
}
