import { useEffect } from 'react';

export type CroquisQuickAction = {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

type CroquisQuickActionMenuProps = {
  actions: CroquisQuickAction[];
  ariaLabel: string;
  x: number;
  y: number;
  onClose: () => void;
};

export function CroquisQuickActionMenu({
  actions,
  ariaLabel,
  x,
  y,
  onClose,
}: CroquisQuickActionMenuProps) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-croquis-quick-action-menu="true"]')) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div
      className="croquis-page__quick-action-menu"
      data-croquis-quick-action-menu="true"
      role="menu"
      aria-label={ariaLabel}
      style={{ left: x, top: y }}
      onContextMenu={event => {
        event.preventDefault();
      }}
    >
      {actions.map(action => (
        <button
          key={action.id}
          type="button"
          className="croquis-page__quick-action-item"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            if (action.disabled) {
              return;
            }

            action.onSelect();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
