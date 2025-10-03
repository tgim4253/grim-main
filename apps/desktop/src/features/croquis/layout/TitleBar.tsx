import { Button } from '@tgim/ui';
import { Minus, X } from 'lucide-react';
import { ipc } from '../../../lib/ipc';

const TitleBar: React.FC = () => {
  return (
    <div
      className="flex h-8 text-text justify-end"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex h-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button
          variant="titlebar"
          onClick={() => void ipc.windowController.minimize()}
          aria-label="Minimize window"
          className="flex items-center justify-center text-icon-main"
        >
          <Minus className="size-3" />
        </Button>
        <Button
          variant="titlebar"
          onClick={() => void ipc.windowController.close()}
          aria-label="Close window"
          className="flex items-center justify-center text-icon-main"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
};

export default TitleBar;
