import { Button } from '@tgim/ui';
import { ipc } from '../../../lib/ipc';

const TitleBar: React.FC = () => {
  return (
    <div
      className="flex items-center justify-between bg-transparent "
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="text-sm font-semibold text-text">Eolgae</div>
      <div className="h-8 flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button variant="titlebar" onClick={() => ipc.windowController.minimize()}>
          🗕
        </Button>
        <Button variant="titlebar" onClick={() => ipc.windowController.maximize()}>
          🗖
        </Button>
        <Button variant="titlebar" onClick={() => ipc.windowController.close()}>
          ✕
        </Button>
      </div>
    </div>
  );
};

export default TitleBar;
