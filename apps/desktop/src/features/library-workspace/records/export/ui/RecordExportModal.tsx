import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type {
  AssetSummary,
  CroquisRecordDetail,
  ExportCroquisRecordsResult,
  RecordExportGridLayoutConfig,
  RecordExportImageConfig as RecordExportImagePayloadConfig,
  RecordExportPairLayoutConfig as RecordExportPairLayoutPayloadConfig,
} from '@/shared/types';
import { Button, CheckboxRow, Chip, Input, Modal, ModalFooter, Select } from '@/shared/ui';
import { resolveImageBoxSize } from '../model/layout';
import {
  isExportableRecord,
  type RecordExportImageDraftConfig,
  type RecordExportPairLayoutDraftConfig,
  type RecordExportRatioMode,
  type RecordExportStep,
} from '../model/types';
import { loadRecordExportSettings, saveRecordExportSettings } from '../model/preferences';
import { RecordExportMasonryPreview, RecordExportPairPreview } from './RecordExportPreview';
import './record-export.css';

type RecordExportModalProps = {
  open: boolean;
  records: readonly CroquisRecordDetail[];
  onClose: () => void;
};

type NumberFieldProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  controlClassName?: string;
  onChange: (value: number) => void;
};

function getDialogStringSelection(selection: unknown) {
  if (typeof selection === 'string') {
    return selection;
  }

  if (Array.isArray(selection)) {
    const [firstSelection] = selection as unknown[];
    return typeof firstSelection === 'string' ? firstSelection : null;
  }

  return null;
}

function clampInteger(value: number, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), min), max);
}

function normalizeImageConfig(config: RecordExportImageDraftConfig): RecordExportImageDraftConfig {
  return {
    ...config,
    width: clampInteger(config.width, 1, 1, 10_000),
    height: clampInteger(config.height, 1, 1, 10_000),
    customRatioWidth: config.customRatioWidth
      ? clampInteger(config.customRatioWidth, 1, 1, 10_000)
      : undefined,
    customRatioHeight: config.customRatioHeight
      ? clampInteger(config.customRatioHeight, 1, 1, 10_000)
      : undefined,
  };
}

function normalizePairLayout(
  layout: RecordExportPairLayoutDraftConfig,
): RecordExportPairLayoutDraftConfig {
  return {
    source: normalizeImageConfig(layout.source),
    result: normalizeImageConfig(layout.result),
    gap: clampInteger(layout.gap, 0, 0, 10_000),
    padding: clampInteger(layout.padding, 0, 0, 10_000),
    horizontal: layout.horizontal,
  };
}

function normalizeGridLayout(layout: RecordExportGridLayoutConfig): RecordExportGridLayoutConfig {
  return {
    hGap: clampInteger(layout.hGap, 0, 0, 10_000),
    vGap: clampInteger(layout.vGap, 0, 0, 10_000),
    padding: clampInteger(layout.padding, 0, 0, 10_000),
    limitPerLine: clampInteger(layout.limitPerLine, 1, 1, 100),
  };
}

function resolveRatioValue(config: RecordExportImageDraftConfig) {
  if (!config.useRatio) {
    return null;
  }

  switch (config.ratioMode) {
    case 'original':
      return null;
    case '1:1':
      return 1;
    case '1:1.6':
      return 1 / 1.6;
    case '1.6:1':
      return 1.6;
    case 'custom': {
      const ratioWidth = config.customRatioWidth ?? 1;
      const ratioHeight = config.customRatioHeight ?? 1;
      return ratioWidth > 0 && ratioHeight > 0
        ? ratioWidth / ratioHeight
        : config.width / config.height;
    }
    default:
      return null;
  }
}

function buildImagePayload(config: RecordExportImageDraftConfig): RecordExportImagePayloadConfig {
  return {
    width: config.width,
    height: config.height,
    useRatio: config.useRatio,
    ratio: resolveRatioValue(config),
  };
}

function buildPairLayoutPayload(
  layout: RecordExportPairLayoutDraftConfig,
): RecordExportPairLayoutPayloadConfig {
  return {
    source: buildImagePayload(layout.source),
    result: buildImagePayload(layout.result),
    gap: layout.gap,
    padding: layout.padding,
    horizontal: layout.horizontal,
  };
}

function getFileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function getRoleAsset(
  record: CroquisRecordDetail | undefined,
  role: 'source' | 'result',
): AssetSummary | null | undefined {
  return role === 'source' ? record?.sourceAsset : record?.resultAsset;
}

function NumberField({
  label,
  value,
  min = 0,
  max = 10_000,
  disabled,
  controlClassName,
  onChange,
}: NumberFieldProps) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={1}
      label={label}
      value={Number.isFinite(value) ? value : min}
      disabled={disabled}
      controlClassName={controlClassName}
      onChange={event => {
        onChange(clampInteger(Number(event.target.value), min, min, max));
      }}
    />
  );
}

export function RecordExportModal({ open: modalOpen, records, onClose }: RecordExportModalProps) {
  const { t } = useTranslation('common');
  const [savedSettings] = useState(() => loadRecordExportSettings());
  const [step, setStep] = useState<RecordExportStep>('pair');
  const [pairLayout, setPairLayout] = useState<RecordExportPairLayoutDraftConfig>(
    savedSettings.pairLayout,
  );
  const [gridLayout, setGridLayout] = useState<RecordExportGridLayoutConfig>(
    savedSettings.gridLayout,
  );
  const [outputDirectory, setOutputDirectory] = useState(savedSettings.outputDirectory);
  const [skipIncomplete, setSkipIncomplete] = useState(savedSettings.skipIncomplete);
  const [exportBusy, setExportBusy] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportCroquisRecordsResult | null>(null);

  const exportableRecords = useMemo(() => records.filter(isExportableRecord), [records]);
  const skippedRecords = useMemo(
    () => records.filter(record => !isExportableRecord(record)),
    [records],
  );
  const normalizedPairLayout = useMemo(() => normalizePairLayout(pairLayout), [pairLayout]);
  const normalizedGridLayout = useMemo(() => normalizeGridLayout(gridLayout), [gridLayout]);
  const previewRecord = exportableRecords[0];
  const ratioOptions = useMemo(
    () => [
      { value: 'original', label: t('record_export.ratio.original', { defaultValue: 'Original' }) },
      { value: '1:1', label: '1:1' },
      { value: '1:1.6', label: '1:1.6' },
      { value: '1.6:1', label: '1.6:1' },
      { value: 'custom', label: t('record_export.ratio.custom', { defaultValue: 'Custom' }) },
    ],
    [t],
  );
  const isBusy = exportBusy || pickerBusy;
  const canExport = exportableRecords.length > 0 && outputDirectory.trim().length > 0;
  const outputFileLabel = exportResult
    ? getFileNameFromPath(exportResult.filePath)
    : t('record_export.default_file_name', {
        defaultValue: 'grim-record-export-<timestamp>.png',
      });
  const summaryExportedCount = exportResult?.exportedCount ?? exportableRecords.length;
  const summarySkippedCount = exportResult?.skippedRecordIds.length ?? skippedRecords.length;

  useEffect(() => {
    if (modalOpen) {
      setStep('pair');
      setExportError(null);
      setExportResult(null);
    }
  }, [modalOpen]);

  useEffect(() => {
    saveRecordExportSettings({
      outputDirectory,
      skipIncomplete,
      pairLayout: normalizedPairLayout,
      gridLayout: normalizedGridLayout,
    });
  }, [normalizedGridLayout, normalizedPairLayout, outputDirectory, skipIncomplete]);

  const updateImageConfig = (
    role: 'source' | 'result',
    patch: Partial<RecordExportImageDraftConfig>,
  ) => {
    setPairLayout(current => ({
      ...current,
      [role]: {
        ...current[role],
        ...patch,
      },
    }));
    setExportResult(null);
  };

  const updatePairLayout = (patch: Partial<RecordExportPairLayoutDraftConfig>) => {
    setPairLayout(current => ({ ...current, ...patch }));
    setExportResult(null);
  };

  const updateGridLayout = (patch: Partial<RecordExportGridLayoutConfig>) => {
    setGridLayout(current => ({ ...current, ...patch }));
    setExportResult(null);
  };

  const handlePickOutputDirectory = () => {
    if (isBusy) {
      return;
    }

    setPickerBusy(true);
    setExportError(null);

    void (async () => {
      try {
        const selection = await open({ multiple: false, directory: true });
        const selectedPath = getDialogStringSelection(selection);
        if (selectedPath?.trim()) {
          setOutputDirectory(selectedPath);
          setExportResult(null);
        }
      } catch (error) {
        setExportError(
          getErrorMessage(
            error,
            t('record_export.error.open_directory', {
              defaultValue: 'Failed to open output folder picker.',
            }),
          ),
        );
      } finally {
        setPickerBusy(false);
      }
    })();
  };

  const handleExport = () => {
    if (!canExport || exportBusy) {
      return;
    }

    setExportBusy(true);
    setExportError(null);
    setExportResult(null);

    void ipc.record
      .exportRecords({
        recordIds: records.map(record => record.id),
        outputDirectory: outputDirectory.trim(),
        pairLayout: buildPairLayoutPayload(normalizedPairLayout),
        gridLayout: normalizedGridLayout,
        skipIncomplete,
      })
      .then(result => {
        setExportResult(result);
      })
      .catch((error: unknown) => {
        setExportError(
          getErrorMessage(
            error,
            t('record_export.error.export_failed', {
              defaultValue: 'Failed to export selected records.',
            }),
          ),
        );
      })
      .finally(() => {
        setExportBusy(false);
      });
  };

  const handleClose = () => {
    if (isBusy) {
      return;
    }

    onClose();
  };

  const renderImageSettings = (role: 'source' | 'result', title: string, description: string) => {
    const config = pairLayout[role];
    const ratioMode = config.ratioMode;
    const normalizedConfig = normalizedPairLayout[role];
    const asset = getRoleAsset(previewRecord, role);
    const displayHeight = config.useRatio
      ? resolveImageBoxSize(normalizedConfig, asset?.width, asset?.height).height
      : config.height;
    const customRatioDisabled = isBusy || !config.useRatio || ratioMode !== 'custom';

    return (
      <section className="record-export-card record-export-image-card">
        <div className="record-export-card__header">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="record-export-image-card__size-row">
          <NumberField
            label={t('record_export.width', { defaultValue: 'Width' })}
            min={1}
            value={config.width}
            disabled={isBusy}
            onChange={value => {
              updateImageConfig(role, { width: value });
            }}
          />
          <NumberField
            label={t('record_export.height', { defaultValue: 'Height' })}
            min={1}
            value={displayHeight}
            disabled={isBusy || config.useRatio}
            controlClassName={
              config.useRatio ? 'record-export-image-card__derived-control' : undefined
            }
            onChange={value => {
              updateImageConfig(role, { height: value });
            }}
          />
        </div>
        <CheckboxRow
          width="full"
          label={t('record_export.use_ratio', { defaultValue: 'Use ratio' })}
          checked={config.useRatio}
          disabled={isBusy}
          onCheckedChange={checked => {
            updateImageConfig(role, { useRatio: checked });
          }}
        />
        <Select
          label={t('record_export.ratio_mode', { defaultValue: 'Ratio mode' })}
          value={ratioMode}
          options={ratioOptions}
          disabled={isBusy || !config.useRatio}
          onValueChange={value => {
            updateImageConfig(role, { ratioMode: value as RecordExportRatioMode });
          }}
        />
        <div className="record-export-image-card__ratio-row">
          <NumberField
            label="W"
            min={1}
            value={config.customRatioWidth ?? 1}
            disabled={customRatioDisabled}
            onChange={value => {
              updateImageConfig(role, { customRatioWidth: value });
            }}
          />
          <span className="record-export-image-card__ratio-separator" aria-hidden="true">
            :
          </span>
          <NumberField
            label="H"
            min={1}
            value={config.customRatioHeight ?? 1}
            disabled={customRatioDisabled}
            onChange={value => {
              updateImageConfig(role, { customRatioHeight: value });
            }}
          />
        </div>
      </section>
    );
  };

  const footerLeading = exportError ? (
    <span className="record-export-modal__status record-export-modal__status--error" role="status">
      {exportError}
    </span>
  ) : exportBusy ? (
    <span className="record-export-modal__status" role="status">
      {t('record_export.exporting', { defaultValue: 'Exporting...' })}
    </span>
  ) : exportResult ? (
    <span className="record-export-modal__status" role="status">
      {t('record_export.saved_to', {
        path: exportResult.filePath,
        defaultValue: 'Saved to {{path}}',
      })}
    </span>
  ) : null;

  return (
    <Modal
      open={modalOpen}
      size="lg"
      title={t('record_export.title', { defaultValue: 'Export Records' })}
      onClose={handleClose}
      closeOnEscape={!isBusy}
      closeOnOverlayClick={!isBusy}
      dialogClassName="record-export-modal"
      bodyClassName="record-export-modal__body"
      footer={
        <ModalFooter alignment="end" leading={footerLeading}>
          {step === 'grid' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={isBusy}
              onClick={() => {
                setStep('pair');
              }}
            >
              {t('back', { defaultValue: 'Back' })}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={isBusy} onClick={handleClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          )}
          {step === 'pair' ? (
            <Button
              size="sm"
              disabled={isBusy || exportableRecords.length === 0}
              onClick={() => {
                setStep('grid');
              }}
            >
              {t('common.next', { defaultValue: 'Next' })}
            </Button>
          ) : (
            <Button size="sm" disabled={!canExport || isBusy} onClick={handleExport}>
              {exportBusy
                ? t('record_export.exporting', { defaultValue: 'Exporting...' })
                : t('record_export.export_png', { defaultValue: 'Export PNG' })}
            </Button>
          )}
        </ModalFooter>
      }
    >
      {exportableRecords.length === 0 ? (
        <p className="record-export-modal__empty">
          {t('record_export.no_exportable_records', {
            defaultValue: 'Select records that have both source and result images.',
          })}
        </p>
      ) : null}

      {step === 'pair' ? (
        <div className="record-export-step">
          <div className="record-export-step-heading">
            <h2>{t('record_export.step_pair_title', { defaultValue: 'Step 1 · Pair layout' })}</h2>
            <p>
              {t('record_export.step_pair_hint', {
                defaultValue:
                  'Configure how source and result images are placed in one record block.',
              })}
            </p>
          </div>
          <div className="record-export-image-card-row">
            {renderImageSettings(
              'source',
              t('record_export.source_image', { defaultValue: 'Source image' }),
              t('record_export.source_image_hint', {
                defaultValue: 'Original image box settings',
              }),
            )}
            {renderImageSettings(
              'result',
              t('record_export.result_image', { defaultValue: 'Result image' }),
              t('record_export.result_image_hint', {
                defaultValue: 'Captured result box settings',
              }),
            )}
          </div>
          <section className="record-export-card record-export-pair-options-card">
            <div className="record-export-pair-options-card__fields">
              <NumberField
                label={t('record_export.pair_gap', { defaultValue: 'Pair gap' })}
                value={pairLayout.gap}
                disabled={isBusy}
                onChange={value => {
                  updatePairLayout({ gap: value });
                }}
              />
              <NumberField
                label={t('record_export.pair_padding', { defaultValue: 'Pair padding' })}
                value={pairLayout.padding}
                disabled={isBusy}
                onChange={value => {
                  updatePairLayout({ padding: value });
                }}
              />
            </div>
            <CheckboxRow
              width="full"
              label={t('record_export.horizontal_alignment', {
                defaultValue: 'Horizontal alignment',
              })}
              checked={pairLayout.horizontal}
              disabled={isBusy}
              onCheckedChange={checked => {
                updatePairLayout({ horizontal: checked });
              }}
            />
          </section>
          <section className="record-export-card record-export-preview-card">
            <div className="record-export-card__header">
              <h3>{t('record_export.pair_preview', { defaultValue: 'Pair preview' })}</h3>
              <p>
                {t('record_export.pair_preview_hint', {
                  defaultValue: 'One record block original and result inside padded export canvas',
                })}
              </p>
            </div>
            <RecordExportPairPreview
              record={previewRecord}
              pairLayout={normalizedPairLayout}
              sourceLabel={t('record_export.source_label', { defaultValue: 'Source' })}
              resultLabel={t('record_export.result_label', { defaultValue: 'Result' })}
              emptyLabel={t('record_export.no_preview', { defaultValue: 'No preview available' })}
            />
            <div className="record-export-preview-meta">
              <Chip shape="pill" variant="selected">
                {pairLayout.horizontal
                  ? t('record_export.horizontal_short', { defaultValue: 'Horizontal' })
                  : t('record_export.vertical_short', { defaultValue: 'Vertical' })}
              </Chip>
              <span>
                {t('record_export.gap_value', {
                  value: normalizedPairLayout.gap,
                  defaultValue: 'Gap {{value}}px',
                })}
              </span>
              <span>
                {t('record_export.padding_value', {
                  value: normalizedPairLayout.padding,
                  defaultValue: 'Padding {{value}}px',
                })}
              </span>
            </div>
          </section>
        </div>
      ) : (
        <div className="record-export-step">
          <div className="record-export-step-heading">
            <h2>{t('record_export.step_grid_title', { defaultValue: 'Step 2 · Export grid' })}</h2>
            <p>
              {t('record_export.step_grid_hint', {
                defaultValue:
                  'Choose output location and arrange all selected record blocks into one PNG.',
              })}
            </p>
          </div>
          <section className="record-export-card record-export-grid-card">
            <div className="record-export-card__header">
              <h3>{t('record_export.final_export_grid', { defaultValue: 'Final export grid' })}</h3>
              <p>
                {t('record_export.final_export_grid_hint', {
                  defaultValue: 'Masonry placement options for record blocks and output folder',
                })}
              </p>
            </div>
            <div className="record-export-grid-card__controls">
              <NumberField
                label={t('record_export.columns', { defaultValue: 'Columns' })}
                min={1}
                max={100}
                value={gridLayout.limitPerLine}
                disabled={isBusy}
                onChange={value => {
                  updateGridLayout({ limitPerLine: value });
                }}
              />
              <NumberField
                label={t('record_export.horizontal_gap', { defaultValue: 'Horizontal gap' })}
                value={gridLayout.hGap}
                disabled={isBusy}
                onChange={value => {
                  updateGridLayout({ hGap: value });
                }}
              />
              <NumberField
                label={t('record_export.vertical_gap', { defaultValue: 'Vertical gap' })}
                value={gridLayout.vGap}
                disabled={isBusy}
                onChange={value => {
                  updateGridLayout({ vGap: value });
                }}
              />
              <NumberField
                label={t('record_export.canvas_padding', { defaultValue: 'Canvas padding' })}
                value={gridLayout.padding}
                disabled={isBusy}
                onChange={value => {
                  updateGridLayout({ padding: value });
                }}
              />
            </div>
            <div className="record-export-grid-card__output-row">
              <Input
                label={t('record_export.output_folder', { defaultValue: 'Output folder' })}
                value={outputDirectory}
                readOnly
                placeholder={t('record_export.output_folder_placeholder', {
                  defaultValue: 'Choose a folder',
                })}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={isBusy}
                className="record-export-grid-card__browse"
                onClick={handlePickOutputDirectory}
              >
                {pickerBusy
                  ? t('common.loading', { defaultValue: 'Loading...' })
                  : t('common.browse', { defaultValue: 'Browse' })}
              </Button>
            </div>
            <CheckboxRow
              width="full"
              label={t('record_export.skip_incomplete', {
                defaultValue: 'Skip records missing source or result image',
              })}
              checked={skipIncomplete}
              disabled={isBusy}
              onCheckedChange={checked => {
                setSkipIncomplete(checked);
                setExportResult(null);
              }}
            />
          </section>
          <section className="record-export-card record-export-summary-card">
            <div className="record-export-card__header">
              <h3>{t('record_export.export_summary', { defaultValue: 'Export summary' })}</h3>
              <p>
                {t('record_export.export_summary_hint', {
                  defaultValue: 'Only complete records are included in the PNG merge',
                })}
              </p>
            </div>
            <div className="record-export-summary-card__metrics">
              <Chip shape="pill" variant="outline">
                {t('record_export.selected_count', {
                  count: records.length,
                  defaultValue: '{{count}} selected',
                })}
              </Chip>
              <Chip shape="pill" variant="selected">
                {exportResult
                  ? t('record_export.exported_count', {
                      count: summaryExportedCount,
                      defaultValue: '{{count}} exported',
                    })
                  : t('record_export.exportable_count', {
                      count: summaryExportedCount,
                      defaultValue: '{{count}} exportable',
                    })}
              </Chip>
              <Chip shape="pill" variant="outline">
                {t('record_export.skipped_count', {
                  count: summarySkippedCount,
                  defaultValue: '{{count}} skipped',
                })}
              </Chip>
              <span className="record-export-summary-card__output-label">
                {t('record_export.output', { defaultValue: 'Output' })}
              </span>
              <span className="record-export-summary-card__output-name">{outputFileLabel}</span>
            </div>
          </section>
          <section className="record-export-card record-export-preview-card">
            <div className="record-export-card__header">
              <h3>
                {t('record_export.merged_png_preview', { defaultValue: 'Merged PNG preview' })}
              </h3>
              <p>
                {t('record_export.merged_png_preview_hint', {
                  defaultValue: 'Masonry columns place each record block in the shortest column',
                })}
              </p>
            </div>
            <RecordExportMasonryPreview
              records={exportableRecords}
              pairLayout={normalizedPairLayout}
              gridLayout={normalizedGridLayout}
            />
          </section>
        </div>
      )}
    </Modal>
  );
}
