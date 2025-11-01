import { type PointerSensorOptions, PointerSensor } from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';

const EDITOR_ROOT_SELECTOR = '.grim-editor';

export class EditorSafePointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators = [
    {
      eventName: 'onPointerDown',
      handler: (
        { nativeEvent }: ReactPointerEvent<Element>,
        { onActivation }: PointerSensorOptions,
      ) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0) {
          return false;
        }

        const target = nativeEvent.target as Element | null;
        if (target && target.closest(EDITOR_ROOT_SELECTOR)) {
          return false;
        }

        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}
