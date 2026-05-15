import type { ReactNode } from 'react';

export type ReferenceGridStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function ReferenceGridState({ title, description, action }: ReferenceGridStateProps) {
  return (
    <div className="masonry-grid__empty">
      <div className="reference-grid-state">
        <p className="reference-grid-state__title">{title}</p>
        {description ? <p className="reference-grid-state__description">{description}</p> : null}
        {action ? <div className="reference-grid-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
