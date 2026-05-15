import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../shared/lib/error';
import { ipc } from '../../../shared/lib/ipc';
import type {
  CroquisRecordDetail,
  CroquisRecordSummary,
  Tag,
  TagIndex,
} from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { RecordExplorerHeader } from './RecordExplorerHeader';
import { RecordResultPreviewPanel } from './RecordResultPreviewPanel';
import { RecordResultTile } from './RecordResultTile';
import { RecordSelectionToolbar } from './RecordSelectionToolbar';
import { isExportableRecord } from './export/model/types';
import { RecordExportModal } from './export/ui/RecordExportModal';
import { RecordTagAddModal } from './RecordTagAddModal';
import {
  EMPTY_TAG_INDEX,
  createRecordFilterGroups,
  hasActiveSelectedRecordFilters,
  pruneSelectedRecordFilters,
  recordMatchesSelectedFilters,
  type SelectedRecordFilters,
} from './model/recordFilters';
import {
  createDetailMap,
  getTagIds,
  isDefined,
  recordSummaryFromDetail,
} from './model/recordDetails';
import { createRecordsBySourceAssetId, getRelatedRecords } from './model/recordRelations';
import { RecordGridState } from './ui/RecordGridState';
import { createRecordResultItem } from './recordResultItems';
import './record-workspace.css';

type RecordsViewProps = {
  refreshKey?: number;
  onExplorerRefresh?: () => Promise<void> | void;
};

type RecordTagAddTarget =
  | {
      kind: 'selection';
    }
  | {
      kind: 'record';
      recordId: string;
    };

export function RecordsView({ refreshKey = 0, onExplorerRefresh }: RecordsViewProps) {
  const { t } = useTranslation('common');
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [records, setRecords] = useState<CroquisRecordSummary[]>([]);
  const [recordDetailsById, setRecordDetailsById] = useState(
    () => new Map<string, CroquisRecordDetail>(),
  );
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [selectedRecordFilters, setSelectedRecordFilters] = useState<SelectedRecordFilters>({});
  const [recordExportOpen, setRecordExportOpen] = useState(false);
  const [tagAddTarget, setTagAddTarget] = useState<RecordTagAddTarget | null>(null);
  const [tagIndex, setTagIndex] = useState<TagIndex>(EMPTY_TAG_INDEX);
  const [tagGroupNamesById, setTagGroupNamesById] = useState(() => new Map<string, string>());
  const loadSequenceRef = useRef(0);
  const selectedRecordIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedRecordIdRef.current = selectedRecordId;
  }, [selectedRecordId]);

  const loadRecords = useCallback(async () => {
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setIsLoading(true);
    setError(null);

    try {
      const snapshot = await ipc.record.listResults();
      const nextRecords = snapshot.records;

      if (loadSequenceRef.current !== loadSequence) {
        return;
      }

      const selectedRecordStillExists = nextRecords.some(
        record => record.id === selectedRecordIdRef.current,
      );

      setRecords(nextRecords);
      setRecordDetailsById(createDetailMap(snapshot.details));
      if (!selectedRecordStillExists) {
        setSelectedRecordId(null);
        setPreviewOpen(false);
      }
      setIsLoading(false);
    } catch (nextError) {
      if (loadSequenceRef.current !== loadSequence) {
        return;
      }

      setRecords([]);
      setRecordDetailsById(new Map());
      setSelectedRecordId(null);
      setSelectedRecordIds([]);
      setPreviewOpen(false);
      setError(
        getErrorMessage(
          nextError,
          t('records.error.load', { defaultValue: 'Failed to load records.' }),
        ),
      );
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    void ipc.tag
      .loadIndex()
      .then(tagIndex => {
        if (cancelled) {
          return;
        }

        setTagIndex(tagIndex);
        setTagGroupNamesById(new Map(tagIndex.groups.map(group => [group.id, group.name])));
      })
      .catch(() => {
        if (!cancelled) {
          setTagIndex(EMPTY_TAG_INDEX);
          setTagGroupNamesById(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const recordIds = new Set(records.map(record => record.id));
    setSelectedRecordIds(current => current.filter(recordId => recordIds.has(recordId)));
  }, [records]);

  const items = useMemo(
    () => records.map(record => createRecordResultItem(record, recordDetailsById.get(record.id))),
    [recordDetailsById, records],
  );

  const recordFilterGroups = useMemo(() => createRecordFilterGroups(tagIndex), [tagIndex]);

  useEffect(() => {
    setSelectedRecordFilters(current => pruneSelectedRecordFilters(current, recordFilterGroups));
  }, [recordFilterGroups]);

  const filteredItems = useMemo(
    () => items.filter(item => recordMatchesSelectedFilters(item, selectedRecordFilters)),
    [items, selectedRecordFilters],
  );
  const hasActiveFilters = hasActiveSelectedRecordFilters(selectedRecordFilters);
  const recordsBySourceAssetId = useMemo(() => createRecordsBySourceAssetId(items), [items]);
  const selectedRecordItems = useMemo(
    () => selectedRecordIds.map(recordId => recordDetailsById.get(recordId)).filter(isDefined),
    [recordDetailsById, selectedRecordIds],
  );
  const exportableSelectedRecordCount = useMemo(
    () => selectedRecordItems.filter(isExportableRecord).length,
    [selectedRecordItems],
  );
  const selectableTagsForSelectedRecords = useMemo(() => {
    if (selectedRecordItems.length === 0) {
      return [];
    }

    return tagIndex.tags.filter(tag =>
      selectedRecordItems.some(detail => !detail.tags.some(recordTag => recordTag.id === tag.id)),
    );
  }, [selectedRecordItems, tagIndex.tags]);
  const tagAddModalRecordDetail =
    tagAddTarget?.kind === 'record' ? recordDetailsById.get(tagAddTarget.recordId) : undefined;
  const tagAddModalTags = useMemo(() => {
    if (tagAddTarget?.kind === 'selection') {
      return selectableTagsForSelectedRecords;
    }

    if (tagAddTarget?.kind === 'record' && tagAddModalRecordDetail) {
      return tagIndex.tags.filter(
        tag => !tagAddModalRecordDetail.tags.some(recordTag => recordTag.id === tag.id),
      );
    }

    return [];
  }, [selectableTagsForSelectedRecords, tagAddModalRecordDetail, tagAddTarget, tagIndex.tags]);
  const tagAddModalEmptyMessage =
    tagIndex.tags.length > 0 && tagAddModalTags.length === 0
      ? t('croquis.auto_tags.all_linked', { defaultValue: 'All tags are linked' })
      : t('tags.no_tags_found', { defaultValue: 'No tags found' });

  const applyUpdatedRecordDetails = useCallback(
    (updatedDetails: readonly CroquisRecordDetail[]) => {
      if (updatedDetails.length === 0) {
        return;
      }

      setRecords(currentRecords =>
        currentRecords.map(record => {
          const updatedDetail = updatedDetails.find(detail => detail.id === record.id);
          return updatedDetail ? recordSummaryFromDetail(updatedDetail) : record;
        }),
      );
      setRecordDetailsById(currentDetailsById => {
        const nextDetailsById = new Map(currentDetailsById);
        updatedDetails.forEach(detail => {
          nextDetailsById.set(detail.id, detail);
        });
        return nextDetailsById;
      });
    },
    [],
  );

  const loadDetailForTagUpdate = useCallback(
    async (recordId: string) => recordDetailsById.get(recordId) ?? ipc.record.getDetail(recordId),
    [recordDetailsById],
  );

  const handleRecordTagAdd = useCallback(
    async (recordId: string, tag: Tag) => {
      if (isActionBusy) {
        return;
      }

      setIsActionBusy(true);
      setActionError(null);

      try {
        const detail = await loadDetailForTagUpdate(recordId);
        const tagIds = getTagIds(detail.tags);
        if (tagIds.includes(tag.id)) {
          return;
        }

        const updatedDetail = await ipc.record.updateTags({
          recordId,
          tagIds: [...tagIds, tag.id],
        });
        applyUpdatedRecordDetails([updatedDetail]);
      } catch (nextError) {
        setActionError(
          getErrorMessage(
            nextError,
            t('records.error.update_tags', { defaultValue: 'Failed to update record tags.' }),
          ),
        );
        throw nextError;
      } finally {
        setIsActionBusy(false);
      }
    },
    [applyUpdatedRecordDetails, isActionBusy, loadDetailForTagUpdate, t],
  );

  const handleRecordTagRemove = useCallback(
    async (recordId: string, tagId: string) => {
      if (isActionBusy) {
        return;
      }

      setIsActionBusy(true);
      setActionError(null);

      try {
        const detail = await loadDetailForTagUpdate(recordId);
        const tagIds = getTagIds(detail.tags);
        const nextTagIds = tagIds.filter(currentTagId => currentTagId !== tagId);
        if (nextTagIds.length === tagIds.length) {
          return;
        }

        const updatedDetail = await ipc.record.updateTags({ recordId, tagIds: nextTagIds });
        applyUpdatedRecordDetails([updatedDetail]);
      } catch (nextError) {
        setActionError(
          getErrorMessage(
            nextError,
            t('records.error.update_tags', { defaultValue: 'Failed to update record tags.' }),
          ),
        );
        throw nextError;
      } finally {
        setIsActionBusy(false);
      }
    },
    [applyUpdatedRecordDetails, isActionBusy, loadDetailForTagUpdate, t],
  );

  const handleSelectedRecordsTagAdd = useCallback(
    async (tag: Tag) => {
      if (selectedRecordIds.length === 0 || isActionBusy) {
        return;
      }

      setIsActionBusy(true);
      setActionError(null);

      try {
        const updateResults = await Promise.allSettled(
          selectedRecordIds.map(async recordId => {
            const detail = await loadDetailForTagUpdate(recordId);
            const tagIds = getTagIds(detail.tags);
            if (tagIds.includes(tag.id)) {
              return null;
            }

            return ipc.record.updateTags({
              recordId,
              tagIds: [...tagIds, tag.id],
            });
          }),
        );
        const updatedDetails = updateResults
          .filter(
            (result): result is PromiseFulfilledResult<CroquisRecordDetail | null> =>
              result.status === 'fulfilled',
          )
          .map(result => result.value)
          .filter(isDefined);

        applyUpdatedRecordDetails(updatedDetails);

        const failedUpdate = updateResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failedUpdate) {
          const errorMessage = getErrorMessage(
            failedUpdate.reason,
            t('records.error.update_tags', { defaultValue: 'Failed to update record tags.' }),
          );
          setActionError(errorMessage);
          throw new Error(errorMessage);
        }
      } finally {
        setIsActionBusy(false);
      }
    },
    [applyUpdatedRecordDetails, isActionBusy, loadDetailForTagUpdate, selectedRecordIds, t],
  );

  const handleTagAddModalAdd = useCallback(
    async (tag: Tag) => {
      if (tagAddTarget?.kind === 'selection') {
        await handleSelectedRecordsTagAdd(tag);
        return;
      }

      if (tagAddTarget?.kind === 'record') {
        await handleRecordTagAdd(tagAddTarget.recordId, tag);
      }
    },
    [handleRecordTagAdd, handleSelectedRecordsTagAdd, tagAddTarget],
  );

  const gridEmptyState = isLoading ? (
    <RecordGridState title={t('records.loading', { defaultValue: 'Loading records...' })} />
  ) : error ? (
    <RecordGridState
      title={t('records.failed_to_load', { defaultValue: 'Failed to load records' })}
      description={error}
      action={
        <Button size="sm" onClick={() => void loadRecords()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      }
    />
  ) : hasActiveFilters ? (
    <RecordGridState
      title={t('records.filters.no_matches', {
        defaultValue: 'No records match these filters',
      })}
      description={t('records.filters.clear_tag_hint', {
        defaultValue: 'Try clearing a tag filter.',
      })}
    />
  ) : (
    <RecordGridState title={t('records.empty', { defaultValue: 'No records yet' })} />
  );

  useEffect(() => {
    const itemIds = new Set(filteredItems.map(item => item.id));
    setSelectedRecordIds(current => current.filter(recordId => itemIds.has(recordId)));
  }, [filteredItems]);

  const handleFilterTagToggle = useCallback((groupKey: string, tagId: string) => {
    setSelectedRecordFilters(current => {
      const currentTagIds = current[groupKey] ?? [];
      const nextTagIds = currentTagIds.includes(tagId)
        ? currentTagIds.filter(currentTagId => currentTagId !== tagId)
        : [...currentTagIds, tagId];

      if (nextTagIds.length > 0) {
        return {
          ...current,
          [groupKey]: nextTagIds,
        };
      }

      const nextFilters: SelectedRecordFilters = {};
      for (const [currentGroupKey, currentTagIds] of Object.entries(current)) {
        if (currentGroupKey !== groupKey) {
          nextFilters[currentGroupKey] = currentTagIds;
        }
      }
      return nextFilters;
    });
  }, []);

  const handleSelectedRecordChange = (recordId: string) => {
    if (selectionMode) {
      setSelectedRecordIds(current => {
        if (current.includes(recordId)) {
          return current.filter(selectedRecordId => selectedRecordId !== recordId);
        }

        return [...current, recordId];
      });
      return;
    }

    setSelectedRecordId(recordId);
    setPreviewOpen(true);
  };

  const handleSelectionModeChange = useCallback(
    (nextSelectionMode: boolean) => {
      setSelectionMode(nextSelectionMode);
      if (!nextSelectionMode) {
        setSelectedRecordIds([]);
        return;
      }

      setSelectedRecordIds(current => {
        if (current.length > 0) {
          return current;
        }

        return selectedRecordId && filteredItems.some(record => record.id === selectedRecordId)
          ? [selectedRecordId]
          : [];
      });
    },
    [filteredItems, selectedRecordId],
  );

  const handleSelectAllChange = useCallback(
    (selected: boolean) => {
      setSelectedRecordIds(selected ? filteredItems.map(record => record.id) : []);
    },
    [filteredItems],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedRecordIds.length === 0 || isActionBusy) {
      return;
    }

    const deletedIds = new Set(selectedRecordIds);
    const deletedSelectedRecord = selectedRecordId ? deletedIds.has(selectedRecordId) : false;
    setIsActionBusy(true);
    setActionError(null);

    void Promise.all(selectedRecordIds.map(recordId => ipc.record.delete({ recordId })))
      .then(async () => {
        setSelectionMode(false);
        setSelectedRecordIds([]);
        if (deletedSelectedRecord) {
          setSelectedRecordId(null);
          setPreviewOpen(false);
        }
        await loadRecords();
        await onExplorerRefresh?.();
      })
      .catch((nextError: unknown) => {
        setActionError(
          getErrorMessage(
            nextError,
            t('records.error.delete_selected', {
              defaultValue: 'Failed to delete selected records.',
            }),
          ),
        );
      })
      .finally(() => {
        setIsActionBusy(false);
      });
  }, [isActionBusy, loadRecords, onExplorerRefresh, selectedRecordId, selectedRecordIds, t]);

  const statusError = actionError;

  return (
    <>
      <LibraryWorkspace
        mode="records"
        items={filteredItems}
        layout={layout}
        selectedItemId={selectedRecordId ?? undefined}
        selectedItemIds={selectedRecordIds}
        selectionMode={selectionMode}
        gridAriaLabel={t('records.title', { defaultValue: 'Records' })}
        previewOpen={previewOpen}
        gridBusy={isLoading}
        gridEmptyState={gridEmptyState}
        onLayoutChange={setLayout}
        onSelectedItemChange={handleSelectedRecordChange}
        renderHeader={({ itemCount, layout: currentLayout, onLayoutChange }) => (
          <RecordExplorerHeader
            itemCount={itemCount}
            layout={currentLayout}
            filterExpanded={filterExpanded}
            filterGroups={recordFilterGroups}
            selectedFilters={selectedRecordFilters}
            onLayoutChange={onLayoutChange}
            onFilterExpandedChange={setFilterExpanded}
            onFilterTagToggle={handleFilterTagToggle}
          />
        )}
        renderToolbar={
          <RecordSelectionToolbar
            selectionMode={selectionMode}
            selectedCount={selectedRecordIds.length}
            totalCount={filteredItems.length}
            actionBusy={isActionBusy}
            addTagDisabled={
              isActionBusy ||
              selectedRecordIds.length === 0 ||
              selectableTagsForSelectedRecords.length === 0
            }
            exportDisabled={
              isActionBusy || selectedRecordIds.length === 0 || exportableSelectedRecordCount === 0
            }
            onSelectionModeChange={handleSelectionModeChange}
            onSelectAllChange={handleSelectAllChange}
            onDeleteSelected={handleDeleteSelected}
            onAddTag={() => {
              setTagAddTarget({ kind: 'selection' });
            }}
            onExport={() => {
              setActionError(null);
              setRecordExportOpen(true);
            }}
          />
        }
        renderTile={(record, tileState) => (
          <RecordResultTile
            record={record}
            layout={tileState.layout}
            selected={tileState.selected}
            selectionIndex={tileState.selectionIndex}
            selectionMode={tileState.selectionMode}
            onSelect={tileState.onSelect}
          />
        )}
        renderPreview={record => (
          <RecordResultPreviewPanel
            record={record}
            relatedRecords={getRelatedRecords(record, recordsBySourceAssetId)}
            tagGroupNamesById={tagGroupNamesById}
            availableTags={tagIndex.tags}
            tagEditDisabled={isActionBusy}
            onTagAddRequest={recordId => {
              setTagAddTarget({ kind: 'record', recordId });
            }}
            onTagRemove={handleRecordTagRemove}
            onClose={() => {
              setPreviewOpen(false);
            }}
          />
        )}
      />
      <RecordExportModal
        open={recordExportOpen}
        records={selectedRecordItems}
        onClose={() => {
          setRecordExportOpen(false);
        }}
      />
      <RecordTagAddModal
        open={tagAddTarget !== null}
        tags={tagAddModalTags}
        tagGroups={tagIndex.groups}
        disabled={isActionBusy}
        emptyMessage={tagAddModalEmptyMessage}
        onClose={() => {
          setTagAddTarget(null);
        }}
        onAddTag={handleTagAddModalAdd}
      />
      {statusError ? (
        <div className="record-action-error" role="status">
          {statusError}
        </div>
      ) : null}
    </>
  );
}
