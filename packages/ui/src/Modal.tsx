import React, { useCallback, useMemo } from 'react';
import cn from '@tgim/utils/cn';
import { createPortal } from 'react-dom';
import Button from './Button';

interface Props {
  onClose: () => void;
  className?: string;
  children?: React.ReactNode;
  rootId?: string;
}

const Modal: React.FC<Props> = ({ onClose, children, className, rootId }) => {
  const targetId = rootId ?? 'modal_root';

  const modalRoot = useMemo(() => {
    const existing = document.getElementById(targetId);
    if (existing) return existing;

    const element = document.createElement('div');
    element.id = targetId;
    document.body.appendChild(element);
    return element;
  }, [targetId]);

  const handleInnerClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  // Render inside a detached root so modals can escape stacking context issues.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className={cn('modal', className)} onClick={handleInnerClick}>
        <Button
          variant="icon"
          className="modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </Button>
        {children}
      </div>
    </div>,
    modalRoot,
  );
};

export default Modal;
