import { Button } from '@tgim/ui';
import { Minus, Square, X } from 'lucide-react';
import { ipc } from '../../../lib/ipc';

const TitleBar: React.FC = () => {
  return (
    <div
      className="flex h-8 items-center justify-between border-b border-border bg-shell-base/80 px-3 text-text backdrop-blur shadow-sm"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="text-sm font-semibold uppercase tracking-wide text-text-soft">Eolgae</div>
      <div className="flex h-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button
          variant="titlebar"
          onClick={() => ipc.windowController.minimize()}
          aria-label="Minimize window"
          className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
        >
          <Minus className="size-4" />
        </Button>
        <Button
          variant="titlebar"
          onClick={() => ipc.windowController.maximize()}
          aria-label="Maximize window"
          className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
        >
          <Square className="size-4" />
        </Button>
        <Button
          variant="titlebar"
          onClick={() => ipc.windowController.close()}
          aria-label="Close window"
          className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};

export default TitleBar;
