import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_OPTIONS,
  resolveLanguageCode,
  type LanguageCode,
} from '../../../shared/lib/language';
import { Button, CheckboxRow, Modal, ModalFooter, Select } from '../../../shared/ui';
import './template-start-modal.css';

export type TemplateStartOptions = {
  templateStartEnabled: boolean;
  language: LanguageCode;
};

export type TemplateStartModalProps = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onStart: (options: TemplateStartOptions) => void;
};

export function TemplateStartModal({
  open,
  busy = false,
  error = null,
  onStart,
}: TemplateStartModalProps) {
  const { i18n, t } = useTranslation('common');
  const resolvedLanguage = resolveLanguageCode(i18n.resolvedLanguage ?? i18n.language);
  const [templateStartEnabled, setTemplateStartEnabled] = useState(true);
  const [languageValue, setLanguageValue] = useState<LanguageCode>(resolvedLanguage);

  useEffect(() => {
    if (open) {
      setLanguageValue(resolvedLanguage);
    }
  }, [open, resolvedLanguage]);

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      const language = resolveLanguageCode(nextLanguage);
      setLanguageValue(language);
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  const handleStart = useCallback(() => {
    onStart({ language: languageValue, templateStartEnabled });
  }, [languageValue, onStart, templateStartEnabled]);

  return (
    <Modal
      open={open}
      size="lg"
      title={t('template_start.title', { defaultValue: 'Start' })}
      closeOnEscape={false}
      closeOnOverlayClick={false}
      hideCloseButton
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
            defaultValue: 'Create starter folders, tags, and a quick Croquis preset.',
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
