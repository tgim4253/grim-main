import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_OPTIONS, resolveLanguageCode } from '../../../shared/lib/language';
import { Button, CheckboxRow, Modal, ModalFooter, Select } from '../../../shared/ui';
import './template-start-modal.css';

export type TemplateStartOptions = {
  templateStartEnabled: boolean;
};

export type TemplateStartModalProps = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onStart: (options: TemplateStartOptions) => void;
};

export function TemplateStartModal({
  open,
  busy = false,
  error = null,
  onClose,
  onStart,
}: TemplateStartModalProps) {
  const { i18n, t } = useTranslation('common');
  const [templateStartEnabled, setTemplateStartEnabled] = useState(false);
  const languageValue = resolveLanguageCode(i18n.resolvedLanguage ?? i18n.language);

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      const language = resolveLanguageCode(nextLanguage);
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  const handleStart = useCallback(() => {
    onStart({ templateStartEnabled });
  }, [onStart, templateStartEnabled]);

  return (
    <Modal
      open={open}
      size="lg"
      title={t('template_start.title', { defaultValue: 'Start' })}
      onClose={busy ? undefined : onClose}
      closeOnEscape={!busy}
      closeOnOverlayClick={!busy}
      closeButtonLabel={t('template_start.close', { defaultValue: 'Close template start' })}
      dialogClassName="template-start-modal"
      bodyClassName="template-start-modal__body"
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" disabled={busy} onClick={handleStart}>
            {busy
              ? t('template_start.starting', { defaultValue: 'Starting…' })
              : t('template_start.start', { defaultValue: 'Start' })}
          </Button>
        </ModalFooter>
      }
    >
      <section className="template-start-modal__row template-start-modal__language-row">
        <div className="template-start-modal__copy">
          <p className="template-start-modal__label">
            {t('template_start.language', { defaultValue: 'Language' })}
          </p>
        </div>

        <Select
          aria-label={t('template_start.language', { defaultValue: 'Language' })}
          className="template-start-modal__language-select"
          options={LANGUAGE_OPTIONS}
          value={languageValue}
          disabled={busy}
          onValueChange={handleLanguageChange}
        />
      </section>

      <section className="template-start-modal__template-section">
        <CheckboxRow
          size="md"
          width="full"
          checked={templateStartEnabled}
          disabled={busy}
          label={t('template_start.template_checkbox', { defaultValue: 'Start with template' })}
          onCheckedChange={setTemplateStartEnabled}
          className="template-start-modal__checkbox-row"
        />
        <p className="template-start-modal__supporting">
          {t('template_start.template_supporting', {
            defaultValue: 'Turn this on to start from a guided template later.',
          })}
        </p>
      </section>

      {error ? (
        <p className="template-start-modal__error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
