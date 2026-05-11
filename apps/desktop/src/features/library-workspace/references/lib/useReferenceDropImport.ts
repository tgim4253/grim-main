import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../../shared/lib/error';
import { ipc } from '../../../../shared/lib/ipc';
import type { AssetListSource, ImportFailure, ImportResult } from '../../../../shared/types';
import {
  collectSupportedDroppedImageFiles,
  fileToDataImageSource,
  formatDroppedImageFileWarnings,
  hasFileDropData,
} from '../../import/dropFileData';

type UseReferenceDropImportParams = {
  source: AssetListSource;
  onAssetsRefresh: () => Promise<void>;
  onExplorerRefresh?: () => Promise<void> | void;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const REMOTE_DROP_TYPES = [
  'text/html',
  'text/uri-list',
  'text/plain',
  'text/x-moz-url',
  'text/x-moz-url-data',
  'text/x-url',
  'URL',
  'public.html',
  'public.text',
  'public.url',
];

function getImportTargetFolderIds(source: AssetListSource) {
  if (source.kind === 'folder' || source.kind === 'folderDescendants') {
    return [source.folderId];
  }

  return [];
}

function getDropData(dataTransfer: DataTransfer, type: string) {
  try {
    return dataTransfer.getData(type).trim();
  } catch {
    return '';
  }
}

function addUniqueSource(sources: string[], value: string) {
  const normalized = value.trim();
  if (normalized && !sources.includes(normalized)) {
    sources.push(normalized);
  }
}

function isRemoteImageSource(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('data:image/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  );
}

function parseSrcsetCandidateScore(candidate: string) {
  const [url, ...descriptors] = candidate.trim().split(/\s+/);
  if (!url) {
    return null;
  }

  const score = descriptors.reduce((maxScore, descriptor) => {
    const value = Number.parseFloat(descriptor.slice(0, -1));
    if (!Number.isFinite(value)) {
      return maxScore;
    }

    if (descriptor.endsWith('w') || descriptor.endsWith('x')) {
      return Math.max(maxScore, value);
    }

    return maxScore;
  }, 1);

  return { url, score };
}

function selectSrcsetCandidate(srcset: string) {
  return srcset
    .split(',')
    .map(parseSrcsetCandidateScore)
    .filter((candidate): candidate is { url: string; score: number } => candidate !== null)
    .sort((left, right) => right.score - left.score)[0]?.url;
}

function collectHtmlImageSources(payload: string) {
  const sources: string[] = [];
  if (!payload.toLowerCase().includes('<img')) {
    return sources;
  }

  const document = new DOMParser().parseFromString(payload, 'text/html');
  for (const image of Array.from(document.querySelectorAll('img'))) {
    const candidates = [
      image.getAttribute('src'),
      image.getAttribute('data-src'),
      image.currentSrc,
      image.src,
      image.getAttribute('srcset')
        ? selectSrcsetCandidate(image.getAttribute('srcset') ?? '')
        : null,
    ];

    for (const candidate of candidates) {
      if (candidate && isRemoteImageSource(candidate)) {
        addUniqueSource(sources, candidate);
        break;
      }
    }
  }

  return sources;
}

function collectUrlLikeSources(payload: string, sources: string[]) {
  for (const line of payload.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) {
      continue;
    }

    if (isRemoteImageSource(value)) {
      addUniqueSource(sources, value);
    }
  }
}

function collectRemoteDropSources(dataTransfer: DataTransfer) {
  const htmlSources: string[] = [];
  for (const type of ['text/html', 'public.html']) {
    const value = getDropData(dataTransfer, type);
    if (value) {
      for (const source of collectHtmlImageSources(value)) {
        addUniqueSource(htmlSources, source);
      }
    }
  }

  if (htmlSources.length > 0) {
    return htmlSources;
  }

  const sources: string[] = [];
  for (const type of [...REMOTE_DROP_TYPES, ...Array.from(dataTransfer.types)]) {
    if (type === 'Files' || type === 'text/html' || type === 'public.html') {
      continue;
    }

    const value = getDropData(dataTransfer, type);
    if (!value) {
      continue;
    }

    collectUrlLikeSources(value, sources);
  }

  return sources;
}

function hasDroppableData(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types);
  return hasFileDropData(dataTransfer) || types.some(type => REMOTE_DROP_TYPES.includes(type));
}

function createEmptyImportResult(failed: ImportFailure[] = []): ImportResult {
  return {
    imported: 0,
    reused: 0,
    failed,
    assets: [],
  };
}

function mergeImportResult(target: ImportResult, source: ImportResult) {
  target.imported += source.imported;
  target.reused += source.reused;
  target.failed.push(...source.failed);
  target.assets.push(...source.assets);
}

function formatDropImportFailureMessage(failed: readonly ImportFailure[], t: Translate) {
  if (failed.length === 0) {
    return null;
  }

  if (failed.length === 1) {
    return failed[0].error;
  }

  return t('references.drop_import.failure_message', {
    count: failed.length,
    formattedCount: failed.length.toLocaleString(),
    error: failed[0].error,
    defaultValue: '{{formattedCount}} assets failed to import. {{error}}',
  });
}

function formatProcessedImportMessage(result: ImportResult, t: Translate) {
  const processedCount = result.imported + result.reused;
  if (result.failed.length === 0) {
    return null;
  }

  return t('references.drop_import.processed_message', {
    processedCount,
    failedCount: result.failed.length,
    formattedProcessedCount: processedCount.toLocaleString(),
    formattedFailedCount: result.failed.length.toLocaleString(),
    defaultValue: '{{formattedProcessedCount}} assets imported, {{formattedFailedCount}} failed.',
  });
}

export function useReferenceDropImport({
  source,
  onAssetsRefresh,
  onExplorerRefresh,
}: UseReferenceDropImportParams) {
  const { t } = useTranslation('common');
  const [dropImportActive, setDropImportActive] = useState(false);
  const [dropImportBusy, setDropImportBusy] = useState(false);
  const [dropImportError, setDropImportError] = useState<string | null>(null);
  const dropImportInFlightRef = useRef(false);
  const domDragDepthRef = useRef(0);
  const dropShellRef = useRef<HTMLDivElement | null>(null);

  const dropImportFolderIds = useMemo(() => getImportTargetFolderIds(source), [source]);
  const dropImportTargetLabel =
    dropImportFolderIds.length > 0
      ? t('references.drop_import.current_folder_target', {
          defaultValue: 'Assets will be saved to the current folder.',
        })
      : t('references.drop_import.no_folder_target', {
          defaultValue: 'Assets will be imported without a folder.',
        });

  const refreshAfterDropImport = useCallback(async () => {
    await onAssetsRefresh();
    try {
      await onExplorerRefresh?.();
    } catch (refreshError) {
      setDropImportError(
        getErrorMessage(
          refreshError,
          t('explorer.error.refresh', { defaultValue: 'Failed to refresh explorer.' }),
        ),
      );
    }
  }, [onAssetsRefresh, onExplorerRefresh, t]);

  const importRemoteSourceBatch = useCallback(
    (sources: readonly string[]) =>
      ipc.import.importRemoteImages({
        sources: [...sources],
        virtualFolderIds: dropImportFolderIds,
      }),
    [dropImportFolderIds],
  );

  const completeImport = useCallback(
    async (result: ImportResult, noSupportedMessage: string, warningMessage: string | null) => {
      const processedCount = result.imported + result.reused;
      if (processedCount === 0) {
        const failureMessage = formatDropImportFailureMessage(result.failed, t);
        setDropImportError(failureMessage ?? warningMessage ?? noSupportedMessage);
        return;
      }

      const processedMessage = formatProcessedImportMessage(result, t);
      const statusMessage = [processedMessage, warningMessage].filter(Boolean).join(' ');
      if (statusMessage) {
        setDropImportError(statusMessage);
      }

      await refreshAfterDropImport();
    },
    [refreshAfterDropImport, t],
  );

  const importDroppedDomData = useCallback(
    (dataTransfer: DataTransfer) => {
      if (dropImportInFlightRef.current) {
        return;
      }

      const remoteSources = collectRemoteDropSources(dataTransfer);
      const imageCollectionPromise = hasFileDropData(dataTransfer)
        ? collectSupportedDroppedImageFiles(dataTransfer)
        : Promise.resolve({
            files: [],
            oversizedCount: 0,
            skippedCount: 0,
            truncated: false,
            unsupportedCount: 0,
          });

      dropImportInFlightRef.current = true;
      setDropImportBusy(true);
      setDropImportActive(false);
      setDropImportError(null);

      void (async () => {
        const aggregateResult = createEmptyImportResult();

        try {
          const imageCollection = await imageCollectionPromise;
          const warningMessage = formatDroppedImageFileWarnings(imageCollection);

          for (const file of imageCollection.files) {
            try {
              const source = await fileToDataImageSource(file);
              if (!source) {
                aggregateResult.failed.push({
                  filePath: file.name,
                  error: t('import.error.dropped_file_unsupported', {
                    defaultValue: 'Dropped file is not a supported image.',
                  }),
                });
                continue;
              }

              mergeImportResult(aggregateResult, await importRemoteSourceBatch([source]));
            } catch (nextError) {
              aggregateResult.failed.push({
                filePath: file.name,
                error: getErrorMessage(
                  nextError,
                  t('references.drop_import.error.read_dropped_image', {
                    defaultValue: 'Failed to read dropped image.',
                  }),
                ),
              });
            }
          }

          if (remoteSources.length > 0) {
            mergeImportResult(aggregateResult, await importRemoteSourceBatch(remoteSources));
          }

          await completeImport(
            aggregateResult,
            t('references.drop_import.error.no_supported_web_image', {
              defaultValue: 'No supported web image data was found in the drop.',
            }),
            warningMessage,
          );
        } catch (nextError) {
          setDropImportError(
            getErrorMessage(
              nextError,
              t('references.drop_import.error.read_dropped_images', {
                defaultValue: 'Failed to read dropped images.',
              }),
            ),
          );
        } finally {
          dropImportInFlightRef.current = false;
          setDropImportBusy(false);
        }
      })();
    },
    [completeImport, importRemoteSourceBatch, t],
  );

  useEffect(() => {
    setDropImportActive(false);
    setDropImportError(null);
    domDragDepthRef.current = 0;
  }, [source]);

  useEffect(() => {
    const isInsideDropShell = (event: DragEvent) => {
      const target = event.target;
      return target instanceof Node && dropShellRef.current?.contains(target);
    };

    const handleDocumentDragEnter = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !isInsideDropShell(event) || !hasDroppableData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      domDragDepthRef.current += 1;
      setDropImportActive(true);
    };

    const handleDocumentDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !isInsideDropShell(event) || !hasDroppableData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dataTransfer.dropEffect = 'copy';
      setDropImportActive(true);
    };

    const handleDocumentDragLeave = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !isInsideDropShell(event) || !hasDroppableData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      domDragDepthRef.current = Math.max(0, domDragDepthRef.current - 1);
      if (domDragDepthRef.current === 0) {
        setDropImportActive(false);
      }
    };

    const handleDocumentDrop = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !isInsideDropShell(event) || !hasDroppableData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      domDragDepthRef.current = 0;
      setDropImportActive(false);
      importDroppedDomData(dataTransfer);
    };

    document.addEventListener('dragenter', handleDocumentDragEnter, true);
    document.addEventListener('dragover', handleDocumentDragOver, true);
    document.addEventListener('dragleave', handleDocumentDragLeave, true);
    document.addEventListener('drop', handleDocumentDrop, true);

    return () => {
      document.removeEventListener('dragenter', handleDocumentDragEnter, true);
      document.removeEventListener('dragover', handleDocumentDragOver, true);
      document.removeEventListener('dragleave', handleDocumentDragLeave, true);
      document.removeEventListener('drop', handleDocumentDrop, true);
    };
  }, [importDroppedDomData]);

  const dropOverlayVisible = dropImportActive || dropImportBusy;

  return {
    dropImportBusy,
    dropImportError,
    dropImportTargetLabel,
    dropOverlayVisible,
    dropShellProps: {
      ref: dropShellRef,
      'data-drop-active': dropOverlayVisible ? 'true' : 'false',
    },
  };
}
