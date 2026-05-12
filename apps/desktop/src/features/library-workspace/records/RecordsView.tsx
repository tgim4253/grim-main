import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../shared/lib/error';
import { ipc } from '../../../shared/lib/ipc';
import type {
  CroquisRecordDetail,
  CroquisRecordSummary,
  Tag,
  TagGroup,
  TagIndex,
} from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import {
  RecordExplorerHeader,
  type RecordExplorerFilterGroup,
  type RecordExplorerSelectedFilters,
} from './RecordExplorerHeader';
import { RecordResultPreviewPanel } from './RecordResultPreviewPanel';
import { RecordResultTile } from './RecordResultTile';
import { RecordSelectionToolbar } from './RecordSelectionToolbar';
import { RecordTagAddModal } from './RecordTagAddModal';
import { createRecordResultItem } from './recordResultItems';
import type { RecordResultItem } from './types';
import './record-workspace.css';

type RecordsViewProps = {
  refreshKey?: number;
  onExplorerRefresh?: () => Promise<void> | void;
};

type RecordGridStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type SelectedRecordFilters = Record<string, string[]>;

type RecordTagAddTarget =
  | {
      kind: 'selection';
    }
  | {
      kind: 'record';
      recordId: string;
    };

const EMPTY_TAG_INDEX: TagIndex = {
  groups: [],
  tags: [],
};

const UNGROUPED_RECORD_FILTER_GROUP_KEY = '__record-filter-group:ungrouped__';

function compareBySortOrderThenName(
  first: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
  second: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
) {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  return first.name.localeCompare(second.name);
}

function getRecordFilterGroupKey(groupId: string | null) {
  return groupId ?? UNGROUPED_RECORD_FILTER_GROUP_KEY;
}

function createRecordFilterGroups(tagIndex: TagIndex): RecordExplorerFilterGroup[] {
  const tagsByGroupId = new Map<string | null, Tag[]>();

  for (const tag of tagIndex.tags) {
    const groupId = tag.groupId ?? null;
    const groupTags = tagsByGroupId.get(groupId) ?? [];
    groupTags.push(tag);
    tagsByGroupId.set(groupId, groupTags);
  }

  const groups = [...tagIndex.groups]
    .sort(compareBySortOrderThenName)
    .map<RecordExplorerFilterGroup>(group => ({
      key: getRecordFilterGroupKey(group.id),
      label: group.name,
      tags: [...(tagsByGroupId.get(group.id) ?? [])].sort(compareBySortOrderThenName).map(tag => ({
        id: tag.id,
        name: tag.name,
      })),
    }))
    .filter(group => group.tags.length > 0);

  const ungroupedTags = [...(tagsByGroupId.get(null) ?? [])].sort(compareBySortOrderThenName);
  if (ungroupedTags.length > 0) {
    groups.push({
      key: UNGROUPED_RECORD_FILTER_GROUP_KEY,
      label: 'Ungrouped',
      tags: ungroupedTags.map(tag => ({
        id: tag.id,
        name: tag.name,
      })),
    });
  }

  return groups;
}

function hasActiveSelectedRecordFilters(selectedFilters: RecordExplorerSelectedFilters) {
  return Object.values(selectedFilters).some(tagIds => tagIds.length > 0);
}

function recordMatchesSelectedFilters(
  record: RecordResultItem,
  selectedFilters: RecordExplorerSelectedFilters,
) {
  const selectedTagGroups = Object.values(selectedFilters).filter(tagIds => tagIds.length > 0);
  if (selectedTagGroups.length === 0) {
    return true;
  }

  const recordTagIds = new Set(record.tags.map(tag => tag.id));

  return selectedTagGroups.every(tagIds => tagIds.some(tagId => recordTagIds.has(tagId)));
}

function pruneSelectedRecordFilters(
  selectedFilters: SelectedRecordFilters,
  filterGroups: readonly RecordExplorerFilterGroup[],
) {
  const validTagsByGroupKey = new Map(
    filterGroups.map(group => [group.key, new Set(group.tags.map(tag => tag.id))]),
  );
  const nextFilters: SelectedRecordFilters = {};
  let changed = false;

  for (const [groupKey, tagIds] of Object.entries(selectedFilters)) {
    const validTagIds = validTagsByGroupKey.get(groupKey);
    if (!validTagIds) {
      changed = true;
      continue;
    }

    const nextTagIds = tagIds.filter(tagId => validTagIds.has(tagId));
    if (nextTagIds.length !== tagIds.length) {
      changed = true;
    }

    if (nextTagIds.length > 0) {
      nextFilters[groupKey] = nextTagIds;
    }
  }

  if (Object.keys(nextFilters).length !== Object.keys(selectedFilters).length) {
    changed = true;
  }

  return changed ? nextFilters : selectedFilters;
}

function RecordGridState({ title, description, action }: RecordGridStateProps) {
  return (
    <div className="masonry-grid__empty">
      <div className="record-grid-state">
        <p className="record-grid-state__title">{title}</p>
        {description ? <p className="record-grid-state__description">{description}</p> : null}
        {action ? <div className="record-grid-state__action">{action}</div> : null}
      </div>
    </div>
  );
}

function createDetailMap(details: readonly CroquisRecordDetail[]) {
  const detailsById = new Map<string, CroquisRecordDetail>();

  details.forEach(detail => {
    detailsById.set(detail.id, detail);
  });

  return detailsById;
}

function getTagIds(tags: readonly Tag[]) {
  return tags.reduce<string[]>((tagIds, tag) => {
    if (tag.id && !tagIds.includes(tag.id)) {
      tagIds.push(tag.id);
    }

    return tagIds;
  }, []);
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function recordSummaryFromDetail(detail: CroquisRecordDetail): CroquisRecordSummary {
  return {
    id: detail.id,
    title: detail.title,
    sourceAssetId: detail.sourceAssetId,
    resultAssetId: detail.resultAssetId,
    targetDurationSeconds: detail.targetDurationSeconds,
    actualDurationSeconds: detail.actualDurationSeconds,
    finishedAt: detail.finishedAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

function createRecordsBySourceAssetId(items: readonly RecordResultItem[]) {
  const itemsBySourceAssetId = new Map<string, RecordResultItem[]>();

  for (const item of items) {
    if (!item.sourceAssetId) {
      continue;
    }

    const sourceItems = itemsBySourceAssetId.get(item.sourceAssetId) ?? [];
    sourceItems.push(item);
    itemsBySourceAssetId.set(item.sourceAssetId, sourceItems);
  }

  return itemsBySourceAssetId;
}

function getRelatedRecords(
  item: RecordResultItem,
  itemsBySourceAssetId: ReadonlyMap<string, readonly RecordResultItem[]>,
) {
  if (!item.sourceAssetId) {
    return [];
  }

  const sourceItems = itemsBySourceAssetId.get(item.sourceAssetId) ?? [];
  return sourceItems.filter(candidate => candidate.id !== item.id);
}

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
            onSelectionModeChange={handleSelectionModeChange}
            onSelectAllChange={handleSelectAllChange}
            onDeleteSelected={handleDeleteSelected}
            onAddTag={() => {
              setTagAddTarget({ kind: 'selection' });
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
