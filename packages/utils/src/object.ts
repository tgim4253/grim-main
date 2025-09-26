export const snakeToCamel = (str: string): string => {
  return str.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
};

export function convertKeysToCamel<T>(obj: T): any {
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToCamel(item));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, any>).map(([key, value]) => [
        snakeToCamel(key),
        convertKeysToCamel(value),
      ]),
    );
  }
  return obj;
}
