import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppUpdate } from '../../app-update';
import { formatBytes } from '../../../lib/format';
import { Button, Modal, ModalFooter, Select, type SelectOption } from '../../../shared/ui';
import './settings-modal.css';

type LanguageCode = 'en' | 'ko' | 'jp';

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const FALLBACK_APP_VERSION = '0.1.0';
const CHECKING_PROGRESS_TARGET = 64;
const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'jp', label: '日本語' },
];

function resolveLanguageCode(language?: string): LanguageCode {
  if (language?.startsWith('ko')) {
    return 'ko';
  }

  if (language?.startsWith('jp') || language?.startsWith('ja')) {
    return 'jp';
  }

  return 'en';
}

function formatVersion(version: string) {
  return `Grim ${version}`;
}

function getDownloadProgress(downloadedBytes: number, contentLength: number | null) {
  if (!contentLength || contentLength <= 0) {
    return CHECKING_PROGRESS_TARGET;
  }

  return Math.min(Math.round((downloadedBytes / contentLength) * 100), 100);
}

function looksLikeTranslationKey(message: string) {
  return /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/i.test(message);
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { i18n, t } = useTranslation('common');
  const appUpdate = useAppUpdate(open);
  const languageValue = resolveLanguageCode(i18n.resolvedLanguage ?? i18n.language);
  const displayedVersion = appUpdate.currentVersion ?? FALLBACK_APP_VERSION;
  const updateProgress =
    appUpdate.status === 'downloading'
      ? getDownloadProgress(appUpdate.downloadedBytes, appUpdate.contentLength)
      : appUpdate.status === 'installing' || appUpdate.status === 'restarting'
        ? 100
        : CHECKING_PROGRESS_TARGET;
  const showUpdateProgress =
    appUpdate.status === 'checking' ||
    appUpdate.status === 'downloading' ||
    appUpdate.status === 'installing' ||
    appUpdate.status === 'restarting';

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      const language = resolveLanguageCode(nextLanguage);
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  const updateStatusLabel = useMemo(() => {
    switch (appUpdate.status) {
      case 'unsupported':
        return t('settings.update_status.unsupported', {
          defaultValue: 'Update checks are available in the desktop app.',
        });
      case 'checking':
        return t('settings.checking_for_updates', {
          defaultValue: 'Checking for updates… {{progress}}%',
          progress: updateProgress,
        });
      case 'upToDate':
        return t('settings.update_status.up_to_date', {
          defaultValue: 'You are already on the latest version.',
        });
      case 'downloading': {
        if (appUpdate.contentLength) {
          return t('settings.update_status.downloading_with_progress', {
            defaultValue: 'Downloading update… {{progress}}%',
            progress: updateProgress,
          });
        }

        return t('settings.update_status.downloading', {
          defaultValue: 'Downloading update…',
        });
      }
      case 'installing':
        return t('settings.update_status.installing', {
          defaultValue: 'Installing update…',
        });
      case 'restarting':
        return t('settings.update_status.restarting', {
          defaultValue: 'Restarting app…',
        });
      case 'error': {
        if (appUpdate.error && looksLikeTranslationKey(appUpdate.error)) {
          return t(appUpdate.error, { defaultValue: appUpdate.error });
        }

        return (
          appUpdate.error ?? t('settings.update_status.error', { defaultValue: 'Update failed.' })
        );
      }
      case 'idle':
      default:
        return null;
    }
  }, [appUpdate.contentLength, appUpdate.error, appUpdate.status, t, updateProgress]);

  const downloadMeta = useMemo(() => {
    if (appUpdate.status !== 'downloading' || appUpdate.downloadedBytes <= 0) {
      return null;
    }

    const downloaded = formatBytes(appUpdate.downloadedBytes);
    if (!appUpdate.contentLength) {
      return downloaded;
    }

    return `${downloaded} / ${formatBytes(appUpdate.contentLength)}`;
  }, [appUpdate.contentLength, appUpdate.downloadedBytes, appUpdate.status]);

  return (
    <Modal
      open={open}
      size="lg"
      title={t('settings.title', { defaultValue: 'Settings' })}
      onClose={onClose}
      closeButtonLabel={t('settings.close', { defaultValue: 'Close settings' })}
      dialogClassName="settings-modal"
      bodyClassName="settings-modal__body"
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" onClick={onClose}>
            {t('settings.done', { defaultValue: 'Done' })}
          </Button>
        </ModalFooter>
      }
    >
      <section className="settings-modal__row settings-modal__version-row">
        <div className="settings-modal__copy">
          <p className="settings-modal__label">
            {t('settings.current_version', { defaultValue: 'Current version' })}
          </p>
          <p className="settings-modal__value">{formatVersion(displayedVersion)}</p>
        </div>

        {appUpdate.status === 'idle' ? (
          <Button
            size="sm"
            variant="secondary"
            className="settings-modal__update-button"
            disabled={!appUpdate.supported || appUpdate.busy}
            onClick={() => void appUpdate.checkForUpdates()}
          >
            {t('settings.check_for_updates', { defaultValue: 'Check for updates' })}
          </Button>
        ) : (
          <div
            className="settings-modal__update-progress"
            data-state={appUpdate.status === 'error' ? 'error' : undefined}
          >
            <p className="settings-modal__progress-copy" aria-live="polite">
              {updateStatusLabel}
            </p>
            {showUpdateProgress ? (
              <div
                className="settings-modal__progress-track"
                role="progressbar"
                aria-label={updateStatusLabel ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={updateProgress}
              >
                <span
                  className="settings-modal__progress-value"
                  style={{ width: `${String(updateProgress)}%` }}
                />
              </div>
            ) : null}
            {downloadMeta ? <p className="settings-modal__progress-meta">{downloadMeta}</p> : null}
          </div>
        )}
      </section>

      <section className="settings-modal__row settings-modal__language-row">
        <div className="settings-modal__copy">
          <p className="settings-modal__label">
            {t('settings.language', { defaultValue: 'Language' })}
          </p>
          <p className="settings-modal__supporting">
            {t('settings.language_help', { defaultValue: 'Choose the display language.' })}
          </p>
        </div>

        <Select
          aria-label={t('settings.language', { defaultValue: 'Language' })}
          className="settings-modal__language-select"
          options={LANGUAGE_OPTIONS}
          value={languageValue}
          onValueChange={handleLanguageChange}
        />
      </section>
    </Modal>
  );
}
