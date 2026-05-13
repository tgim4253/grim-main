import { cx } from '../../../shared/lib/cx';
import type { AnalyticsTagBarDatum } from '../types';
import { formatValueWithUnit } from './analyticsUtils';

export type TagBarProps = {
  data: AnalyticsTagBarDatum[];
  className?: string;
  maxValue?: number;
  ariaLabel?: string;
};

export function TagBar({ data, className, maxValue, ariaLabel = 'Tag values' }: TagBarProps) {
  const resolvedMaxValue = Math.max(maxValue ?? 0, ...data.map(item => item.value), 1);

  return (
    <div className={cx('analytics-tag-bar', className)} role="list" aria-label={ariaLabel}>
      {data.map((item, index) => {
        const color = item.color ?? 'var(--analytics-accent-primary)';
        const percent = Math.max(0, Math.min((item.value / resolvedMaxValue) * 100, 100));

        return (
          <div key={item.id} className="analytics-tag-bar__item" role="listitem">
            <div className="analytics-tag-bar__item-head">
              <span
                className="analytics-tag-bar__dot"
                style={{
                  backgroundColor: color,
                  opacity: Math.max(1 - index * 0.14, 0.46),
                }}
                aria-hidden
              />
              <span className="analytics-tag-bar__label">{item.label}</span>
              <strong className="analytics-tag-bar__value">
                {formatValueWithUnit(item.value, item.unit)}
              </strong>
            </div>
            <div className="analytics-tag-bar__track" aria-hidden>
              <span
                className="analytics-tag-bar__fill"
                style={{
                  width: `${String(percent)}%`,
                  backgroundColor: color,
                  opacity: Math.max(1 - index * 0.12, 0.48),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
