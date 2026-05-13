import type { AnalyticsContributionLevel } from '../types';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const padDatePart = (value: number) => String(value).padStart(2, '0');

export const formatLocalDateKey = (date: Date) =>
  `${String(date.getFullYear())}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

export const parseLocalDate = (value: string | Date) => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (DATE_KEY_PATTERN.test(value)) {
    const [year = '0', month = '1', day = '1'] = value.split('-');

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

export const addLocalDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
};

export const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const toContributionLevel = (count: number): AnalyticsContributionLevel => {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;

  return 4;
};

export const formatCompactNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
};

export const formatValueWithUnit = (value: number, unit?: string) =>
  `${formatCompactNumber(value)}${unit ?? ''}`;
