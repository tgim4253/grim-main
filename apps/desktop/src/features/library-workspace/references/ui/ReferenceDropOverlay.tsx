import { useTranslation } from 'react-i18next';

export type ReferenceDropOverlayProps = {
  visible: boolean;
  busy: boolean;
  preparing: boolean;
  targetLabel: string;
};

export function ReferenceDropOverlay({
  visible,
  busy,
  preparing,
  targetLabel,
}: ReferenceDropOverlayProps) {
  const { t } = useTranslation('common');

  if (!visible) {
    return null;
  }

  return (
    <div className="reference-drop-overlay" aria-live="polite">
      <div className="reference-drop-overlay__card">
        <span className="reference-drop-overlay__title">
          {busy
            ? t('import.importing_assets', { defaultValue: 'Importing assets...' })
            : preparing
              ? t('references.drop_import.reviewing_assets', {
                  defaultValue: 'Reviewing dropped assets...',
                })
              : t('references.drop_to_import', { defaultValue: 'Drop to import references' })}
        </span>
        <span className="reference-drop-overlay__copy">
          {busy
            ? t('references.saving_dropped_assets', {
                defaultValue: 'Saving local files and web images to the library.',
              })
            : preparing
              ? t('references.drop_import.counting_assets', {
                  defaultValue: 'Counting supported image files before import starts.',
                })
              : t('references.drop_supported_hint', {
                  target: targetLabel,
                  defaultValue: 'Local image files and web images are supported. {{target}}',
                })}
        </span>
      </div>
    </div>
  );
}
