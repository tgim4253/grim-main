export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
