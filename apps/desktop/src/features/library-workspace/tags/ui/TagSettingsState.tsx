import type { ReactNode } from 'react';

type TagSettingsStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function TagSettingsState({ title, description, action }: TagSettingsStateProps) {
  return (
    <div className="tag-settings-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="tag-settings-state__action">{action}</div> : null}
    </div>
  );
}
