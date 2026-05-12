import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  const countMessage =
    countIsExact && itemCount !== undefined
      ? t('import.drop_warning.exact_count', {
          count: itemCount,
          formattedCount: itemCount.toLocaleString(),
          defaultValue: 'You dropped {{formattedCount}} items.',
        })
      : t('import.drop_warning.threshold_count', {
          threshold,
          formattedThreshold: threshold.toLocaleString(),
          defaultValue: 'You dropped more than {{formattedThreshold}} items.',
        });

  return (
    <Modal
      open={open}
      size="sm"
      title={t('import.drop_warning.title', { defaultValue: 'Large Drop Detected' })}
      onClose={onCancel}
      closeOnOverlayClick={false}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--warning">
          <p className="library-import-modal__warning-copy">
            {t('import.drop_warning.processing_hint', {
              countMessage,
              threshold,
              formattedThreshold: threshold.toLocaleString(),
              defaultValue:
                '{{countMessage}} Processing more than {{formattedThreshold}} items can take a while and may temporarily slow the app.',
            })}
          </p>
          <p className="library-import-modal__warning-copy">
            {t('import.drop_warning.continue_hint', {
              defaultValue: 'Continue to process this drop, or cancel before any import starts.',
            })}
          </p>
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="lg" onClick={onContinue}>
            {t('common.continue', { defaultValue: 'Continue' })}
          </Button>
        </ModalFooter>
      }
    />
  );
}
