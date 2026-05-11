import { Button, Modal, ModalBody, ModalFooter } from '../../../shared/ui';
import './library-import-modal.css';

export type DropImportWarningModalProps = {
  open: boolean;
  itemCount?: number;
  countIsExact?: boolean;
  threshold: number;
  onCancel: () => void;
  onContinue: () => void;
};

export function DropImportWarningModal({
  open,
  itemCount,
  countIsExact = false,
  threshold,
  onCancel,
  onContinue,
}: DropImportWarningModalProps) {
  const countMessage =
    countIsExact && itemCount !== undefined
      ? `You dropped ${itemCount.toLocaleString()} items.`
      : `You dropped more than ${threshold.toLocaleString()} items.`;

  return (
    <Modal
      open={open}
      size="sm"
      title="Large Drop Detected"
      onClose={onCancel}
      closeOnOverlayClick={false}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--warning">
          <p className="library-import-modal__warning-copy">
            {countMessage} Processing more than {threshold.toLocaleString()} items can take a while
            and may temporarily slow the app.
          </p>
          <p className="library-import-modal__warning-copy">
            Continue to process this drop, or cancel before any import starts.
          </p>
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="lg" onClick={onContinue}>
            Continue
          </Button>
        </ModalFooter>
      }
    />
  );
}
