import { PointerSensor } from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';

const EDITOR_ROOT_SELECTOR = '.grim-editor';

export class EditorSafePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown',
      handler: (
        { nativeEvent: event }: { nativeEvent: ReactPointerEvent['nativeEvent'] },
        _sensorOptions: unknown,
        {
          onActivation,
        }: { onActivation?: ({ event }: { event: ReactPointerEvent['nativeEvent'] }) => void },
      ) => {
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }

        const target = event.target as Element | null;
        if (target && target.closest(EDITOR_ROOT_SELECTOR)) {
          return false;
        }

        onActivation?.({ event });
        return true;
      },
    },
  ];
}
