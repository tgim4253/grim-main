import { Button } from '@tgim/ui';
import { Minus, X } from 'lucide-react';
import { ipc } from '../../../lib/ipc';

const ManageMoaTitleBar: React.FC = () => {
  return (
    <div
      className="flex h-8 w-full items-center justify-between border-b border-border bg-shell-base/80 px-3 text-text backdrop-blur shadow-sm"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="text-sm font-semibold uppercase tracking-wide text-text-soft">
        Manage Vault
      </div>
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button
          variant="titlebar"
          onClick={() => void ipc.windowController.minimize()}
          aria-label="Minimize window"
          className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
        >
          <Minus className="size-4" />
        </Button>
        <Button
          variant="titlebar"
          onClick={() => void ipc.windowController.close()}
          aria-label="Close window"
          className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};

export default ManageMoaTitleBar;
