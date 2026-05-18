import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppUpdate } from '@/features/app-update';
import { formatBytes } from '../../../lib/format';
import { useTheme, type Theme } from '../../../shared/hooks';
import { LANGUAGE_OPTIONS, resolveLanguageCode } from '../../../shared/lib/language';
import { Button, Modal, ModalFooter, Select, type SelectOption } from '../../../shared/ui';
import {
  createSettingsShortcutSections,
  getSettingsShortcutPlatform,
  type SettingsTab,
} from '../lib/settings-shortcuts';
import './settings-modal.css';

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const FALLBACK_APP_VERSION = '0.1.0';
const CHECKING_PROGRESS_TARGET = 64;
function resolveThemePreference(theme?: string): Theme {
  if (theme === 'system' || theme === 'light' || theme === 'dark') {
    return theme;
  }

  return 'dark';
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const appUpdate = useAppUpdate(open);
  const { setTheme, theme } = useTheme();
  const shortcutPlatform = useMemo(() => getSettingsShortcutPlatform(), []);
  const languageValue = resolveLanguageCode(i18n.resolvedLanguage ?? i18n.language);
  const themeOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: 'system',
        label: t('settings.theme_option.system', { defaultValue: 'System' }),
      },
      {
        value: 'light',
        label: t('settings.theme_option.light', { defaultValue: 'Light' }),
      },
      {
        value: 'dark',
        label: t('settings.theme_option.dark', { defaultValue: 'Dark' }),
      },
    ],
    [t],
  );
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
  const shortcutSections = createSettingsShortcutSections(t, shortcutPlatform);

  useEffect(() => {
    if (!open) {
      setActiveTab('general');
    }
  }, [open]);

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      const language = resolveLanguageCode(nextLanguage);
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  const handleThemeChange = useCallback(
    (nextTheme: string) => {
      setTheme(resolveThemePreference(nextTheme));
    },
    [setTheme],
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
      <div className="settings-modal__layout">
        <nav
          className="settings-modal__tabs"
          aria-label={t('settings.tabs.aria_label', { defaultValue: 'Settings sections' })}
          role="tablist"
        >
          <button
            id="settings-tab-general"
            className="settings-modal__tab"
            type="button"
            role="tab"
            aria-controls="settings-panel-general"
            aria-selected={activeTab === 'general'}
            data-active={activeTab === 'general'}
            onClick={() => {
              setActiveTab('general');
            }}
          >
            {t('settings.tabs.general', { defaultValue: 'General' })}
          </button>
          <button
            id="settings-tab-shortcuts"
            className="settings-modal__tab"
            type="button"
            role="tab"
            aria-controls="settings-panel-shortcuts"
            aria-selected={activeTab === 'shortcuts'}
            data-active={activeTab === 'shortcuts'}
            onClick={() => {
              setActiveTab('shortcuts');
            }}
          >
            {t('settings.tabs.shortcuts', { defaultValue: 'Shortcuts' })}
          </button>
        </nav>

        <span className="settings-modal__divider" aria-hidden="true" />

        <div className="settings-modal__panel">
          {activeTab === 'general' ? (
            <div
              id="settings-panel-general"
              className="settings-modal__general-panel"
              role="tabpanel"
              aria-labelledby="settings-tab-general"
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
                    {downloadMeta ? (
                      <p className="settings-modal__progress-meta">{downloadMeta}</p>
                    ) : null}
                  </div>
                )}
              </section>

              <section className="settings-modal__row settings-modal__language-row">
                <div className="settings-modal__copy">
                  <p className="settings-modal__label">
                    {t('settings.language', { defaultValue: 'Language' })}
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

              <section className="settings-modal__row settings-modal__theme-row">
                <div className="settings-modal__copy">
                  <p className="settings-modal__label">
                    {t('settings.theme', { defaultValue: 'Theme' })}
                  </p>
                </div>

                <Select
                  aria-label={t('settings.theme', { defaultValue: 'Theme' })}
                  className="settings-modal__theme-select"
                  options={themeOptions}
                  value={theme}
                  onValueChange={handleThemeChange}
                />
              </section>
            </div>
          ) : (
            <div
              id="settings-panel-shortcuts"
              className="settings-modal__shortcuts-panel"
              role="tabpanel"
              aria-labelledby="settings-tab-shortcuts"
            >
              <div className="settings-modal__shortcuts-header">
                <h3 className="settings-modal__shortcuts-title">
                  {t('settings.shortcuts.title', { defaultValue: 'Keyboard shortcuts' })}
                </h3>
                <p className="settings-modal__shortcuts-description">
                  {t('settings.shortcuts.description', {
                    defaultValue: 'Review and learn the shortcuts available in Grim.',
                  })}
                </p>
              </div>

              {shortcutSections.map(section => (
                <section className="settings-modal__shortcut-section" key={section.id}>
                  <h4 className="settings-modal__shortcut-section-title">{section.title}</h4>
                  <div className="settings-modal__shortcut-list">
                    {section.items.map(item => (
                      <div className="settings-modal__shortcut-row" key={item.command}>
                        <div className="settings-modal__shortcut-copy">
                          <p className="settings-modal__shortcut-label">{item.name}</p>
                          <p className="settings-modal__shortcut-description">{item.description}</p>
                        </div>
                        <div
                          className="settings-modal__shortcut-keys"
                          aria-label={`${item.name}: ${item.keyParts.join(' + ')}`}
                        >
                          {item.keyParts.map((keyPart, index) => (
                            <Fragment key={`${item.command}-${keyPart}-${String(index)}`}>
                              {index > 0 ? (
                                <span className="settings-modal__shortcut-plus" aria-hidden="true">
                                  +
                                </span>
                              ) : null}
                              <kbd className="settings-modal__shortcut-key">{keyPart}</kbd>
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
