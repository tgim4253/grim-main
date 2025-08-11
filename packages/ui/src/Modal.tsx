import cn from '@tgim/utils/cn';
import Button from './Button';
import { ClosedCaptionIcon } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Props {
  onClose: () => void;
  className?: string;
  children?: React.ReactNode;
  rootId?: string;
}

const Modal: React.FC<Props> = ({ onClose, children, className, rootId }) => {
  let rootEl = null;
  if (rootId) {
    rootEl = document.getElementById(rootId);
  }
  if (!rootEl) {
    rootEl = document.getElementById('modal_root');
    if (!rootEl) {
      const el = document.createElement('div');
      el.id = 'modal_root';
      document.body.appendChild(el);
      rootEl = el;
    }
  }
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className={cn('modal', className)} onClick={e => e.stopPropagation()}>
        <Button variant="icon" className="modal-close" onClick={onClose}>
          X
        </Button>
        {children}
      </div>
    </div>,
    rootEl,
  );
};

export default Modal;
