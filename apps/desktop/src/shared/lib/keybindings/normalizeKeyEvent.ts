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

const codeAliases: Readonly<Record<string, string>> = {
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'backspace',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Delete: 'delete',
  End: 'end',
  Enter: 'enter',
  Equal: '=',
  Escape: 'escape',
  Home: 'home',
  Insert: 'insert',
  Minus: '-',
  PageDown: 'pagedown',
  PageUp: 'pageup',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'space',
  Tab: 'tab',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  ArrowUp: 'arrowup',
};

const MODIFIER_ORDER = ['ctrl', 'meta', 'alt', 'shift'] as const;

type ModifierKey = (typeof MODIFIER_ORDER)[number];

const modifierEventKey: Readonly<
  Record<ModifierKey, keyof Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>>
> = {
  ctrl: 'ctrlKey',
  meta: 'metaKey',
  alt: 'altKey',
  shift: 'shiftKey',
};

export function normalizeKeyEvent(event: KeyboardEvent): string {
  const baseKey = normalizeKeyboardEventBaseKey(event);
  const keyParts: string[] = [
    ...MODIFIER_ORDER.filter(modifier => event[modifierEventKey[modifier]]),
    baseKey,
  ];

  return Array.from(new Set(keyParts)).join('+');
}

function normalizeKeyboardEventBaseKey(event: KeyboardEvent): string {
  if (event.code.startsWith('Key')) {
    return event.code.slice('Key'.length).toLowerCase();
  }

  if (event.code.startsWith('Digit')) {
    return event.code.slice('Digit'.length);
  }

  if (event.code.startsWith('Numpad')) {
    return normalizeNumpadCode(event.code);
  }

  return codeAliases[event.code] ?? normalizeKeyboardKey(event.key);
}

function normalizeNumpadCode(code: string): string {
  const value = code.slice('Numpad'.length);
  if (/^\d$/.test(value)) {
    return value;
  }

  const aliases: Readonly<Record<string, string>> = {
    Add: '+',
    Decimal: '.',
    Divide: '/',
    Enter: 'enter',
    Equal: '=',
    Multiply: '*',
    Subtract: '-',
  };

  return aliases[value] ?? value.toLowerCase();
}

function normalizeKeyboardKey(key: string): string {
  return keyAliases[key] ?? key.toLowerCase();
}
