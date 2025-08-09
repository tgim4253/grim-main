import { Button } from '@tgim/ui';
import { ipc } from '../../../lib/ipc';

const ManageMoaTitleBar: React.FC = () => {
  return (
    <div
      className="w-full flex justify-end h-8"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Button
          className="text-red-500"
          variant="titlebar"
          onClick={() => ipc.windowController.minimize()}
        >
          🗕
        </Button>
        <Button variant="titlebar" onClick={() => ipc.windowController.close()}>
          ✕
        </Button>
      </div>
    </div>
  );
};

export default ManageMoaTitleBar;
