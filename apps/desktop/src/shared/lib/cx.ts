export const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');
