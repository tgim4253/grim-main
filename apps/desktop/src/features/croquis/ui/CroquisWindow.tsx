import { useSearchParams } from 'react-router-dom';
import { CroquisSessionHeader } from './CroquisSessionHeader';
import { CroquisSessionSidebar } from './CroquisSessionSidebar';
import { useCroquisSessionController } from '../lib/useCroquisSessionController';
import './croquis.css';

export function CroquisWindow() {
  const [params] = useSearchParams();
  const controller = useCroquisSessionController({
    sessionId: params.get('session_id'),
  });

  if (!controller.session || !controller.currentItem) {
    return (
      <div className="croquis-page__empty">{controller.status ?? 'Loading croquis session...'}</div>
    );
  }

  return (
    <div className="croquis-page">
      <CroquisSessionHeader
        currentIndex={controller.currentIndex}
        currentStepName={controller.currentItem.stepName}
        hasNext={controller.hasNext}
        hasPrevious={controller.hasPrevious}
        isCaptureEnabled={controller.session.option.isCapture && controller.isRecordSaveEnabled}
        isCurrentSaved={controller.isCurrentSaved}
        isPlaying={controller.isPlaying}
        isRecordSaveEnabled={controller.isRecordSaveEnabled}
        queueLength={controller.queue.length}
        session={controller.session}
        onCapture={controller.handleCapture}
        onSave={controller.handleSave}
        onMoveNext={() => {
          controller.moveToIndex(controller.currentIndex + 1);
        }}
        onMovePrevious={() => {
          controller.moveToIndex(controller.currentIndex - 1);
        }}
        onTogglePlayback={() => {
          controller.setIsPlaying(value => !value);
        }}
      />

      <div className="croquis-page__body">
        <div className="croquis-page__stage">
          {controller.currentImageSrc ? (
            <img
              src={controller.currentImageSrc}
              alt={controller.currentItem.fileName}
              className="croquis-page__image"
              style={{
                filter: controller.session.option.isGray ? 'grayscale(1)' : undefined,
              }}
            />
          ) : (
            <div className="croquis-page__empty">Image preview unavailable.</div>
          )}
        </div>

        <CroquisSessionSidebar
          currentItem={controller.currentItem}
          currentTargetSeconds={controller.currentTargetSeconds}
          elapsedSeconds={controller.elapsedSeconds}
          formatSeconds={controller.formatSeconds}
          session={controller.session}
          status={controller.status}
        />
      </div>
    </div>
  );
}
