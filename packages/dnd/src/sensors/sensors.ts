import { useSensor, useSensors } from '@dnd-kit/core';

import { EditorSafePointerSensor } from './editorSafePointerSensor';

const clampNonNegative = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);

/**
 * @param {number} distance - px
 */
export function useStandardSensors(distance: number = 4) {
  const safeDistance = clampNonNegative(distance);

  return useSensors(
    useSensor(EditorSafePointerSensor, {
      activationConstraint: { distance: safeDistance },
    }),
  );
}

/**
 * @param {number} distance - px
 * @param {number} delay - ms
 */
export function useDelaySensors(distance: number = 4, delay: number = 200) {
  const safeDistance = clampNonNegative(distance);
  const safeDelay = clampNonNegative(delay);
  return useSensors(
    useSensor(EditorSafePointerSensor, {
      activationConstraint: {
        distance: safeDistance,
        delay: safeDelay,
      },
    }),
  );
}
