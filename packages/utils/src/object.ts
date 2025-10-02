export const snakeToCamel = (str: string): string => {
  return str.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
};

export function convertKeysToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToCamel(item));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        snakeToCamel(key),
        convertKeysToCamel(value),
      ]),
    );
  }
  return obj;
}
export function omitKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  const { [key]: _, ...rest } = obj;
  return rest as T;
}
