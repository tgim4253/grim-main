import type { ReactNode } from 'react';
import { cx } from '../../../shared/lib/cx';
import { Icon, IconButton, type IconName } from '../../../shared/ui';
import './analytics.css';

export type AnalyticsGraphRatio = '1:1' | '1:2' | 'wide';

const RATIO_CLASS_NAMES: Record<AnalyticsGraphRatio, string> = {
  '1:1': 'analytics-graph-wrapper--square',
  '1:2': 'analytics-graph-wrapper--wide',
  wide: 'analytics-graph-wrapper--wide',
};

export type AnalyticsGraphWrapperProps = {
  title: string;
  children: ReactNode;
  className?: string;
  icon?: IconName;
  ratio?: AnalyticsGraphRatio;
  description?: string;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

export function AnalyticsGraphWrapper({
  title,
  children,
  className,
  icon,
  ratio,
  description,
  action,
  actionLabel = 'Graph options',
  onAction,
}: AnalyticsGraphWrapperProps) {
  return (
    <section
      className={cx(
        'analytics-graph-wrapper',
        ratio ? RATIO_CLASS_NAMES[ratio] : undefined,
        className,
      )}
    >
      <header className="analytics-graph-wrapper__header">
        <div className="analytics-graph-wrapper__title-row">
          {icon ? <Icon name={icon} size="md" color="brand" aria-hidden /> : null}
          <h3 className="analytics-graph-wrapper__title">{title}</h3>
        </div>
        {action ? <div className="analytics-graph-wrapper__action">{action}</div> : null}
        {!action && onAction ? (
          <IconButton
            icon="more-horizontal"
            size="sm"
            aria-label={actionLabel}
            onClick={onAction}
          />
        ) : null}
      </header>
      {description ? <p className="analytics-graph-wrapper__description">{description}</p> : null}
      <div className="analytics-graph-wrapper__body">{children}</div>
    </section>
  );
}
