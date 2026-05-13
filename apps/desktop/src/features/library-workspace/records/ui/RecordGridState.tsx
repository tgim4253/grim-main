import type { ReactNode } from 'react';

type RecordGridStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function RecordGridState({ title, description, action }: RecordGridStateProps) {
  return (
    <div className="masonry-grid__empty">
      <div className="record-grid-state">
        <p className="record-grid-state__title">{title}</p>
        {description ? <p className="record-grid-state__description">{description}</p> : null}
        {action ? <div className="record-grid-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
