import { useEffect, useRef } from 'react';
import {
  getCurrentGrimPlatform,
  grimKeybindings,
  resolveKeybinding,
  type GrimCommandHandlerMap,
  type GrimKeybinding,
  type GrimKeybindingContext,
  type GrimPlatform,
} from '@/shared/lib/keybindings';

export type KeybindingEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export type UseKeybindingsOptions = {
  context?: GrimKeybindingContext;
  handlers: GrimCommandHandlerMap;
  keybindings?: readonly GrimKeybinding[];
  platform?: GrimPlatform;
  enabled?: boolean;
  target?: KeybindingEventTarget | null;
};

export function useKeybindings({
  context = {},
  enabled = true,
  handlers,
  keybindings = grimKeybindings,
  platform = getCurrentGrimPlatform(),
  target,
}: UseKeybindingsOptions): void {
  const contextRef = useRef(context);
  const handlersRef = useRef(handlers);
  const keybindingsRef = useRef(keybindings);
  const platformRef = useRef(platform);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    keybindingsRef.current = keybindings;
  }, [keybindings]);

  useEffect(() => {
    platformRef.current = platform;
  }, [platform]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const resolvedTarget = target ?? (typeof window === 'undefined' ? null : window);

    if (!resolvedTarget) {
      return undefined;
    }

    const handleKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      const resolvedKeybinding = resolveKeybinding(event, {
        context: contextRef.current,
        keybindings: keybindingsRef.current,
        platform: platformRef.current,
      });

      if (!resolvedKeybinding) {
        return;
      }

      const handler = handlersRef.current[resolvedKeybinding.command];

      if (!handler) {
        return;
      }

      if (resolvedKeybinding.preventDefault) {
        event.preventDefault();
      }

      handler(event, resolvedKeybinding);
    };

    resolvedTarget.addEventListener('keydown', handleKeyDown);

    return () => {
      resolvedTarget.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, target]);
}
