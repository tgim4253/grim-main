import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ipc } from '../../../shared/lib/ipc';
import type { CroquisRecordDetail, CroquisRecordSummary } from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { RecordExplorerHeader } from './RecordExplorerHeader';
import { RecordResultPreviewPanel } from './RecordResultPreviewPanel';
import { RecordResultTile } from './RecordResultTile';
import { RecordSelectionToolbar } from './RecordSelectionToolbar';
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
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

        setTagGroupNamesById(new Map(tagIndex.groups.map(group => [group.id, group.name])));
      })
      .catch(() => {
        if (!cancelled) {
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

  const recordsBySourceAssetId = useMemo(() => createRecordsBySourceAssetId(items), [items]);

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
  ) : (
    <RecordGridState title={t('records.empty', { defaultValue: 'No records yet' })} />
  );

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

        return selectedRecordId && records.some(record => record.id === selectedRecordId)
          ? [selectedRecordId]
          : [];
      });
    },
    [records, selectedRecordId],
  );

  const handleSelectAllChange = useCallback(
    (selected: boolean) => {
      setSelectedRecordIds(selected ? records.map(record => record.id) : []);
    },
    [records],
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
        items={items}
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
            onLayoutChange={onLayoutChange}
          />
        )}
        renderToolbar={
          <RecordSelectionToolbar
            selectionMode={selectionMode}
            selectedCount={selectedRecordIds.length}
            totalCount={records.length}
            actionBusy={isActionBusy}
            onSelectionModeChange={handleSelectionModeChange}
            onSelectAllChange={handleSelectAllChange}
            onDeleteSelected={handleDeleteSelected}
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
            onClose={() => {
              setPreviewOpen(false);
            }}
          />
        )}
      />
      {statusError ? (
        <div className="record-action-error" role="status">
          {statusError}
        </div>
      ) : null}
    </>
  );
}
