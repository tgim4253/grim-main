import { evaluateKeybindingWhen, type GrimKeybindingContext } from './context';
import { grimKeybindingScopePriority, grimKeybindings, type GrimKeybinding } from './keybindings';
import { normalizeKeyEvent } from './normalizeKeyEvent';
import { getCurrentGrimPlatform, type GrimPlatform } from '../platform';

export type ResolvedKeybinding = {
  command: GrimKeybinding['command'];
  binding: GrimKeybinding;
  key: string;
  preventDefault: boolean;
};

export type GrimCommandHandler = (
  event: KeyboardEvent,
  resolvedKeybinding: ResolvedKeybinding,
) => void;

export type GrimCommandHandlerMap = Partial<
  Record<ResolvedKeybinding['command'], GrimCommandHandler>
>;

export type ResolveKeybindingOptions = {
  context?: GrimKeybindingContext;
  keybindings?: readonly GrimKeybinding[];
  platform?: GrimPlatform;
};

type KeybindingCandidate = {
  binding: GrimKeybinding;
  index: number;
};

export function resolveKeybinding(
  event: KeyboardEvent,
  {
    context = {},
    keybindings = grimKeybindings,
    platform = getCurrentGrimPlatform(),
  }: ResolveKeybindingOptions = {},
): ResolvedKeybinding | null {
  if (event.isComposing) {
    return null;
  }

  const normalizedKey = normalizeKeyEvent(event);
  const editableTarget = isEditableKeybindingTarget(event.target);
  const candidates: KeybindingCandidate[] = [];

  keybindings.forEach((binding, index) => {
    if (binding.key[platform] !== normalizedKey) {
      return;
    }

    if (editableTarget && !binding.allowInEditable) {
      return;
    }

    if (!evaluateKeybindingWhen(binding.when, context)) {
      return;
    }

    candidates.push({ binding, index });
  });

  if (candidates.length === 0) {
    return null;
  }

  const [selectedCandidate] = candidates.sort((left, right) => {
    const priorityDifference =
      grimKeybindingScopePriority[right.binding.scope] -
      grimKeybindingScopePriority[left.binding.scope];

    return priorityDifference === 0 ? left.index - right.index : priorityDifference;
  });

  return {
    binding: selectedCandidate.binding,
    command: selectedCandidate.binding.command,
    key: normalizedKey,
    preventDefault: selectedCandidate.binding.preventDefault !== false,
  };
}

export function isEditableKeybindingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const editableElement = target.closest('input, textarea, select, [contenteditable]');

  if (!editableElement) {
    return false;
  }

  if (editableElement instanceof HTMLElement && editableElement.isContentEditable) {
    return true;
  }

  return (
    editableElement instanceof HTMLInputElement ||
    editableElement instanceof HTMLTextAreaElement ||
    editableElement instanceof HTMLSelectElement ||
    editableElement.getAttribute('contenteditable') === 'true' ||
    editableElement.getAttribute('contenteditable') === 'plaintext-only'
  );
}
