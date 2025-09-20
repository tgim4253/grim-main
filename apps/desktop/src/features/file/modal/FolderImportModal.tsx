import { open } from '@tauri-apps/plugin-dialog';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@tgim/ui/index';
import { Input } from '@tgim/ui/Input';
import { FileType, FolderPreview, FolderPreviewFileStat, FolderSelection } from '@tgim/types/file';

import { ipc } from '../../../lib/ipc';

export interface FolderImportModalSubmitData {
  name: string;
  path: string;
  selection?: FolderSelection;
}

export interface FolderImportModalProps {
  onClose: () => void;
  onSubmit: (data: FolderImportModalSubmitData) => Promise<void> | void;
  title?: string;
  cancelLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  submitLabel?: string;
  browseLabel?: string;
  initialName?: string;
  initialPath?: string;
}

type SelectionState = {
  include: boolean;
  fileTypes: Set<FileType> | null;
};

type EffectiveSelection = {
  include: boolean;
  types: Set<FileType>;
};

type NodeIndexEntry = {
  node: FolderPreview['root'];
  parent: string | null;
};

type SelectionSummary = {
  totalFolders: number;
  totalFiles: number;
  totalBytes: number;
  fileTypeTotals: Record<FileType, { count: number; bytes: number }>;
};

const FILE_TYPE_ORDER: FileType[] = [
  FileType.Image,
  FileType.Video,
  FileType.Document,
  FileType.GraphicTool,
  FileType.Audio,
  FileType.Archive,
  FileType.Unknown,
];

const FILE_TYPE_LABELS: Record<FileType, string> = {
  [FileType.Image]: '이미지',
  [FileType.Video]: '비디오',
  [FileType.Document]: '문서',
  [FileType.GraphicTool]: '그래픽',
  [FileType.Audio]: '오디오',
  [FileType.Archive]: '압축',
  [FileType.Unknown]: '기타',
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const fixed = value >= 10 ? value.toFixed(0) : value.toFixed(2);
  return `${fixed} ${units[idx]}`;
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '즉시 처리';
  }

  const rounded = Math.max(1, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}시간`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}분`);
  }
  if (hours === 0 && secs > 0) {
    parts.push(`${secs}초`);
  }

  if (parts.length === 0) {
    return '약 1초';
  }

  return `약 ${parts.join(' ')}`;
};

const estimateProcessingSeconds = (fileCount: number, totalBytes: number) => {
  if (fileCount <= 0 && totalBytes <= 0) {
    return 0;
  }

  const assumedBytesPerSecond = 25 * 1024 * 1024;
  const perFileOverheadSeconds = 0.18;

  const throughputSeconds = totalBytes / assumedBytesPerSecond;
  const overheadSeconds = fileCount * perFileOverheadSeconds;
  const combined = throughputSeconds + overheadSeconds;

  if (!Number.isFinite(combined) || combined <= 0.5) {
    return 0;
  }

  return Math.ceil(combined);
};

const getStatForType = (stats: FolderPreviewFileStat[] | undefined, fileType: FileType) =>
  stats?.find(stat => stat.fileType === fileType) ?? { count: 0, bytes: 0 };

const areSetsEqual = (a: Set<FileType>, b: Set<FileType>) => {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};

const buildNodeIndex = (root: FolderPreview['root'] | null) => {
  const map = new Map<string, NodeIndexEntry>();
  if (!root) return map;

  const walk = (node: FolderPreview['root'], parent: string | null) => {
    const key = node.relativePath ?? '';
    map.set(key, { node, parent });
    node.children.forEach(child => walk(child, key));
  };

  walk(root, null);
  return map;
};

const flattenNodes = (root: FolderPreview['root'] | null) => {
  const out: FolderPreview['root'][] = [];
  if (!root) return out;

  const walk = (node: FolderPreview['root']) => {
    node.children.forEach(child => {
      out.push(child);
      walk(child);
    });
  };

  walk(root);
  return out;
};

const initializeSelection = (preview: FolderPreview) => {
  const initial = new Map<string, SelectionState>();
  const rootKey = preview.root.relativePath ?? '';
  const rootTypes = new Set<FileType>(preview.summary.fileTypeTotals.map(stat => stat.fileType));

  if (rootTypes.size === 0) {
    FILE_TYPE_ORDER.forEach(type => rootTypes.add(type));
  }

  const walk = (node: FolderPreview['root']) => {
    const key = node.relativePath ?? '';
    initial.set(key, {
      include: true,
      fileTypes: key === rootKey ? new Set(rootTypes) : null,
    });
    node.children.forEach(walk);
  };

  walk(preview.root);
  return initial;
};

const buildEffectiveSelections = (
  preview: FolderPreview | null,
  selection: Map<string, SelectionState>,
) => {
  const effective = new Map<string, EffectiveSelection>();
  if (!preview) return effective;

  const rootKey = preview.root.relativePath ?? '';
  const rootState = selection.get(rootKey);
  const rootIncluded = rootState?.include ?? true;
  const rootTypes = rootState?.fileTypes ? new Set(rootState.fileTypes) : new Set(FILE_TYPE_ORDER);

  const walk = (
    node: FolderPreview['root'],
    parentTypes: Set<FileType>,
    ancestorsIncluded: boolean,
  ) => {
    const key = node.relativePath ?? '';
    const state = selection.get(key);
    const isIncluded = ancestorsIncluded && (state?.include ?? true);

    let allowedTypes: Set<FileType>;
    if (!ancestorsIncluded || !isIncluded) {
      allowedTypes = new Set<FileType>();
    } else if (state?.fileTypes) {
      allowedTypes = new Set(Array.from(state.fileTypes).filter(type => parentTypes.has(type)));
    } else {
      allowedTypes = new Set(parentTypes);
    }

    effective.set(key, { include: isIncluded, types: allowedTypes });

    node.children.forEach(child => walk(child, allowedTypes, isIncluded));
  };

  walk(preview.root, rootTypes, rootIncluded);
  return effective;
};

const computeSelectionSummary = (
  preview: FolderPreview | null,
  effective: Map<string, EffectiveSelection>,
): SelectionSummary => {
  const totals = FILE_TYPE_ORDER.reduce(
    (acc, type) => {
      acc[type] = { count: 0, bytes: 0 };
      return acc;
    },
    {} as Record<FileType, { count: number; bytes: number }>,
  );

  const summary: SelectionSummary = {
    totalFolders: 0,
    totalFiles: 0,
    totalBytes: 0,
    fileTypeTotals: totals,
  };

  if (!preview) return summary;

  const walk = (node: FolderPreview['root']) => {
    const key = node.relativePath ?? '';
    const entry = effective.get(key);
    if (!entry || !entry.include) return;

    summary.totalFolders += 1;
    node.fileStats.forEach(stat => {
      if (!entry.types.has(stat.fileType)) return;
      summary.totalFiles += stat.count;
      summary.totalBytes += stat.bytes;
      summary.fileTypeTotals[stat.fileType].count += stat.count;
      summary.fileTypeTotals[stat.fileType].bytes += stat.bytes;
    });

    node.children.forEach(walk);
  };

  walk(preview.root);
  return summary;
};

type SelectionProgress = {
  progressRatio: number;
  progressPercent: number;
  selectedFiles: number;
  totalFiles: number;
  selectedBytes: number;
  totalBytes: number;
};

const computeSelectionProgress = (
  preview: FolderPreview | null,
  summary: SelectionSummary,
): SelectionProgress => {
  const totalFiles = preview?.summary.totalFiles ?? 0;
  const totalBytes = preview?.summary.totalBytes ?? 0;
  const selectedFiles = summary.totalFiles;
  const selectedBytes = summary.totalBytes;

  const fileRatio = totalFiles > 0 ? selectedFiles / totalFiles : 0;
  const byteRatio = totalBytes > 0 ? selectedBytes / totalBytes : 0;

  let combinedRatio = 0;
  if (totalFiles > 0 && totalBytes > 0) {
    combinedRatio = (fileRatio + byteRatio) / 2;
  } else if (totalFiles > 0) {
    combinedRatio = fileRatio;
  } else if (totalBytes > 0) {
    combinedRatio = byteRatio;
  }

  if (!Number.isFinite(combinedRatio)) {
    combinedRatio = 0;
  }

  const normalized = Math.min(1, Math.max(0, combinedRatio));

  return {
    progressRatio: normalized,
    progressPercent: Math.round(normalized * 100),
    selectedFiles,
    totalFiles,
    selectedBytes,
    totalBytes,
  };
};

const buildSelectionPayload = (
  selection: Map<string, SelectionState>,
  rootKey: string,
): FolderSelection => {
  const entries = Array.from(selection.entries())
    .map(([relativePath, state]) => ({
      relativePath,
      include: state.include,
      fileTypes: state.fileTypes ? Array.from(state.fileTypes) : undefined,
    }))
    .filter(entry => {
      if (entry.relativePath === rootKey) return true;
      if (!entry.include) return true;
      return entry.fileTypes !== undefined;
    });

  return { entries };
};

const FolderImportModal: React.FC<FolderImportModalProps> = ({
  onClose,
  onSubmit,
  title = '폴더 가져오기',
  cancelLabel = '취소',
  nextLabel = '다음',
  backLabel = '이전',
  submitLabel = '업서트',
  browseLabel = '찾기',
  initialName = '',
  initialPath = '',
}) => {
  const [step, setStep] = useState<'details' | 'selection'>('details');
  const [name, setName] = useState(initialName);
  const [path, setPath] = useState(initialPath);
  const [preview, setPreview] = useState<FolderPreview | null>(null);
  const [selection, setSelection] = useState<Map<string, SelectionState>>(new Map());
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nodeIndex = useMemo(() => buildNodeIndex(preview?.root ?? null), [preview]);
  const effectiveSelections = useMemo(
    () => buildEffectiveSelections(preview, selection),
    [preview, selection],
  );
  const flattenedNodes = useMemo(() => flattenNodes(preview?.root ?? null), [preview]);
  const summary = useMemo(
    () => computeSelectionSummary(preview, effectiveSelections),
    [preview, effectiveSelections],
  );
  const selectionProgress = useMemo(
    () => computeSelectionProgress(preview, summary),
    [preview, summary],
  );
  const estimatedSeconds = useMemo(
    () =>
      estimateProcessingSeconds(selectionProgress.selectedFiles, selectionProgress.selectedBytes),
    [selectionProgress.selectedBytes, selectionProgress.selectedFiles],
  );
  const previewEstimatedSeconds = useMemo(() => {
    if (!preview) return 0;
    return estimateProcessingSeconds(preview.summary.totalFiles, preview.summary.totalBytes);
  }, [preview]);

  const rootKey = preview?.root?.relativePath ?? '';
  const rootState = selection.get(rootKey);
  const rootEffective = effectiveSelections.get(rootKey);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const updateSelection = useCallback(
    (key: string, updater: (current: SelectionState) => SelectionState) => {
      setSelection(prev => {
        const next = new Map(prev);
        const current = next.get(key) ?? { include: true, fileTypes: null };
        next.set(key, updater(current));
        return next;
      });
    },
    [],
  );

  const fetchPreview = useCallback(async (selectedPath: string) => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const data = await ipc.file.previewFolderImport(selectedPath);
      setPreview(data);
      setSelection(initializeSelection(data));
    } catch (error) {
      console.error(error);
      setPreview(null);
      setSelection(new Map());
      setPreviewError('폴더 정보를 불러오는 데 실패했습니다.');
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    setPath(initialPath);
    if (initialPath) {
      void fetchPreview(initialPath);
    }
  }, [fetchPreview, initialPath]);

  const handlePickFolder = useCallback(async () => {
    const result = await open({ directory: true });
    if (!result) return;

    const selected = Array.isArray(result) ? result[0] : result;
    if (!selected) return;

    setPath(selected);
    await fetchPreview(selected);
  }, [fetchPreview]);

  const handleRootIncludeToggle = useCallback(
    (include: boolean) => {
      if (!preview) return;
      updateSelection(rootKey, current => ({ ...current, include }));
    },
    [preview, rootKey, updateSelection],
  );

  const handleRootFileTypeToggle = useCallback(
    (fileType: FileType) => {
      if (!rootState || !preview) return;
      updateSelection(rootKey, current => {
        const base = new Set(current.fileTypes ?? []);
        if (base.has(fileType)) {
          base.delete(fileType);
        } else {
          base.add(fileType);
        }
        return { ...current, fileTypes: base };
      });
    },
    [preview, rootKey, rootState, updateSelection],
  );

  const handleFolderIncludeToggle = useCallback(
    (key: string, include: boolean) => {
      const parentKey = nodeIndex.get(key)?.parent ?? null;
      if (parentKey !== null) {
        const parentEffective = effectiveSelections.get(parentKey);
        if (parentEffective && !parentEffective.include) {
          return;
        }
      }
      updateSelection(key, current => ({ ...current, include }));
    },
    [effectiveSelections, nodeIndex, updateSelection],
  );

  const handleFolderFileTypeToggle = useCallback(
    (key: string, fileType: FileType) => {
      const parentKey = nodeIndex.get(key)?.parent ?? null;
      const parentEffective = parentKey !== null ? effectiveSelections.get(parentKey) : undefined;
      if (parentEffective && !parentEffective.include) {
        return;
      }

      const parentTypes = parentEffective?.types ?? new Set<FileType>();
      updateSelection(key, current => {
        const base = current.fileTypes ? new Set(current.fileTypes) : new Set(parentTypes);

        if (base.has(fileType)) {
          base.delete(fileType);
        } else {
          if (parentKey !== null && !parentTypes.has(fileType)) {
            return current;
          }
          base.add(fileType);
        }

        const nextTypes = parentKey !== null && areSetsEqual(base, parentTypes) ? null : base;
        return { ...current, fileTypes: nextTypes };
      });
    },
    [effectiveSelections, nodeIndex, updateSelection],
  );

  const handleResetFolderTypes = useCallback(
    (key: string) => {
      updateSelection(key, current => ({ ...current, fileTypes: null }));
    },
    [updateSelection],
  );

  const handleNext = useCallback(() => {
    if (!name.trim()) {
      alert('폴더 이름을 입력하세요.');
      return;
    }
    if (!path) {
      alert('실제 폴더 경로를 선택하세요.');
      return;
    }
    if (previewError) {
      alert('폴더 정보를 불러오는 데 실패했습니다. 다시 시도하세요.');
      return;
    }
    if (!preview || loadingPreview) {
      alert('폴더 구조를 불러오는 중입니다. 잠시만 기다려주세요.');
      return;
    }
    setStep('selection');
  }, [loadingPreview, name, path, preview, previewError]);

  const handleSubmit = useCallback(async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const payload = buildSelectionPayload(selection, rootKey);
      await onSubmit({
        name: name.trim(),
        path,
        selection: payload.entries.length ? payload : undefined,
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert('폴더를 생성하는 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [name, onClose, onSubmit, path, preview, rootKey, selection]);

  const canProceed = !!name.trim() && !!path && !!preview && !loadingPreview && !previewError;

  return (
    <div className="text-modal-text">
      <div className="flex flex-col gap-6">
        {step === 'details' ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Input
              className="bg-modal-input-bg hover:bg-modal-input-hover shadow-lg"
              placeholder="폴더 이름"
              value={name}
              onChange={event => setName(event.target.value)}
            />
            <div className="flex items-center gap-3">
              <Input
                className="read-only:bg-transparent shadow-lg truncate"
                readOnly
                placeholder="실제 폴더 경로"
                value={path}
              />
              <Button
                variant="default"
                className="whitespace-nowrap bg-modal-input-bg hover:bg-modal-input-hover"
                onClick={handlePickFolder}
              >
                {browseLabel}
              </Button>
            </div>
            {loadingPreview && (
              <p className="text-sm text-modal-text-secondary">폴더 구조를 불러오는 중입니다...</p>
            )}
            {previewError && <p className="text-sm text-red-400">{previewError}</p>}
            {preview && !loadingPreview && !previewError && (
              <div className="rounded-md bg-modal-input-bg/60 p-3 text-sm space-y-1">
                <div>폴더: {preview.summary.totalFolders.toLocaleString()}개</div>
                <div>
                  파일: {preview.summary.totalFiles.toLocaleString()}개 ·{' '}
                  {formatBytes(preview.summary.totalBytes)}
                </div>
                <div className="text-xs text-modal-text-secondary">
                  전체 업서트 예상 시간: {formatDuration(previewEstimatedSeconds)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">가져오기 옵션 선택</h2>
              <p className="text-sm text-modal-text-secondary">
                전체 요약에서 파일 유형을 선택하고, 하위 폴더별로 세부 옵션을 조정하세요.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-4 rounded-lg border border-modal-input-bg p-4">
                <h3 className="font-medium">전체 요약</h3>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rootState?.include ?? true}
                      onChange={event => handleRootIncludeToggle(event.target.checked)}
                    />
                    전체 폴더 포함
                  </label>
                  <div>
                    선택된 폴더:{' '}
                    <span className="font-semibold">{summary.totalFolders.toLocaleString()}</span> /{' '}
                    {preview?.summary.totalFolders.toLocaleString() ?? 0}
                  </div>
                  <div>
                    선택된 파일:{' '}
                    <span className="font-semibold">{summary.totalFiles.toLocaleString()}</span> /{' '}
                    {preview?.summary.totalFiles.toLocaleString() ?? 0}
                  </div>
                  <div>
                    선택된 용량:{' '}
                    <span className="font-semibold">{formatBytes(summary.totalBytes)}</span> /{' '}
                    {formatBytes(preview?.summary.totalBytes ?? 0)}
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-medium text-modal-text-secondary">
                    <span>선택 진행률</span>
                    <span>{selectionProgress.progressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-modal-input-bg/60">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${selectionProgress.progressPercent}%` }}
                    />
                  </div>
                  <div className="text-modal-text-secondary">
                    파일 {selectionProgress.selectedFiles.toLocaleString()} /{' '}
                    {selectionProgress.totalFiles.toLocaleString()} ·{' '}
                    {formatBytes(selectionProgress.selectedBytes)} /{' '}
                    {formatBytes(selectionProgress.totalBytes)}
                  </div>
                  <div className="text-modal-text-secondary">
                    예상 소요 시간: {formatDuration(estimatedSeconds)}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {FILE_TYPE_ORDER.map(type => {
                    const total = getStatForType(preview?.summary.fileTypeTotals, type);
                    const selected = summary.fileTypeTotals[type];
                    const isChecked = rootEffective?.types.has(type) ?? true;
                    return (
                      <label key={type} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!rootState?.include}
                          onChange={() => handleRootFileTypeToggle(type)}
                        />
                        <span className="flex-1">
                          {FILE_TYPE_LABELS[type]} · {selected.count.toLocaleString()}개 /{' '}
                          {total.count.toLocaleString()}개
                        </span>
                        <span className="text-xs text-modal-text-secondary">
                          {formatBytes(selected.bytes)} / {formatBytes(total.bytes)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
              <section className="space-y-3 rounded-lg border border-modal-input-bg p-4">
                <h3 className="font-medium">폴더별 세부 설정</h3>
                <div className="max-h-72 space-y-3 overflow-y-auto pr-2 text-sm">
                  {flattenedNodes.map(node => {
                    const key = node.relativePath ?? '';
                    if (key === rootKey) return null;
                    const state = selection.get(key) ?? {
                      include: true,
                      fileTypes: null,
                    };
                    const effective = effectiveSelections.get(key);
                    const parentKey = nodeIndex.get(key)?.parent ?? null;
                    const parentEffective =
                      parentKey !== null ? effectiveSelections.get(parentKey) : undefined;
                    const ancestorIncluded = parentEffective ? parentEffective.include : true;
                    const depth = key ? key.split('/').filter(Boolean).length : 0;
                    const containerClasses = ancestorIncluded
                      ? 'rounded-md border border-modal-input-bg/60 p-3'
                      : 'rounded-md border border-modal-input-bg/60 p-3 opacity-50';

                    const typesForFolder = FILE_TYPE_ORDER.filter(type => {
                      const stat = getStatForType(node.fileStats, type);
                      const hasExplicit = state.fileTypes?.has(type) ?? false;
                      return stat.count > 0 || hasExplicit;
                    });

                    return (
                      <div key={key} className={containerClasses}>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={state.include}
                              disabled={!ancestorIncluded}
                              onChange={event =>
                                handleFolderIncludeToggle(key, event.target.checked)
                              }
                            />
                            <span className="font-medium" style={{ paddingLeft: depth * 12 }}>
                              {node.name}
                            </span>
                          </label>
                          {state.fileTypes && (
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs text-modal-text-secondary"
                              onClick={() => handleResetFolderTypes(key)}
                            >
                              초기화
                            </Button>
                          )}
                        </div>
                        {typesForFolder.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {typesForFolder.map(type => {
                              const stat = getStatForType(node.fileStats, type);
                              const isAllowed = effective?.types.has(type) ?? false;
                              const parentTypes = parentEffective?.types ?? new Set<FileType>();
                              const disabled =
                                !ancestorIncluded ||
                                !state.include ||
                                (parentKey !== null && !parentTypes.has(type));
                              return (
                                <label key={type} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    disabled={disabled}
                                    onChange={() => handleFolderFileTypeToggle(key, type)}
                                  />
                                  <span className="flex-1">
                                    {FILE_TYPE_LABELS[type]} · {stat.count.toLocaleString()}개
                                  </span>
                                  <span className="text-xs text-modal-text-secondary">
                                    {formatBytes(stat.bytes)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-modal-text-secondary">
                            표시할 파일이 없습니다.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {flattenedNodes.length === 0 && (
                    <p className="text-xs text-modal-text-secondary">하위 폴더가 없습니다.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button onClick={onClose} disabled={submitting}>
            {cancelLabel}
          </Button>
          {step === 'selection' ? (
            <>
              <Button variant="outline" onClick={() => setStep('details')} disabled={submitting}>
                {backLabel}
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                {submitLabel}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={handleNext} disabled={!canProceed}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FolderImportModal;
