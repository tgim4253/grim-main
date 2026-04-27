import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Icon } from '../../shared/ui';

type ExplorerTreeDraftRowProps = {
  level: number;
  pending?: boolean;
  error?: string | null;
  onCommit: (name: string) => void;
  onCancel: () => void;
};

export function ExplorerTreeDraftRow({
  level,
  pending = false,
  error = null,
  onCommit,
  onCancel,
}: ExplorerTreeDraftRowProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const finalizingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!pending && error) {
      finalizingRef.current = false;
      inputRef.current?.focus();
    }
  }, [error, pending]);

  const finish = () => {
    if (finalizingRef.current || pending) {
      return;
    }

    const folderName = name.trim();
    finalizingRef.current = true;

    if (!folderName) {
      onCancel();
      return;
    }

    onCommit(folderName);
  };

  const cancel = () => {
    if (finalizingRef.current || pending) {
      return;
    }

    finalizingRef.current = true;
    onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (event.nativeEvent.isComposing) {
        return;
      }

      event.preventDefault();
      finish();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  const handleBlur = (_event: FocusEvent<HTMLInputElement>) => {
    finish();
  };

  return (
    <div className="explorer-tree-row explorer-tree-row--draft">
      <div
        role="treeitem"
        aria-level={level}
        aria-busy={pending}
        className="explorer-tree-row__main explorer-tree-row__draft-main"
      >
        <span className="explorer-tree-row__leading" aria-hidden="true">
          <span className="explorer-tree-row__arrow-slot" />
          <Icon name="folder" size="xs" hierarchy="tertiary" color="brand" />
        </span>

        <span className="explorer-tree-row__draft-content">
          <input
            ref={inputRef}
            className="explorer-tree-row__draft-input"
            value={name}
            disabled={pending}
            aria-label="New folder name"
            aria-invalid={Boolean(error) || undefined}
            onChange={event => {
              setName(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          {error ? <span className="explorer-tree-row__draft-error">{error}</span> : null}
        </span>
      </div>
    </div>
  );
}
