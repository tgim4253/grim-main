import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '@tgim/ui/index';
import {
  FileType,
  FileTypeExtensionGroup,
  FolderMountState,
  FolderOptionUpdatePayload,
} from '@tgim/types/file';
import { FileTreeData } from '@tgim/types/index';
import { ipc } from '../../../lib/ipc';
import { FILE_TYPE_LABELS } from '../constants';
import { omitKey } from '@tgim/utils/object';

type ExtensionSelection = Partial<Record<FileType, Set<string>>>;

const normalizeExtension = (value: string) => value.trim().replace(/^\./, '').toLowerCase();

const splitCustomExtensions = (value: string): string[] =>
  value
    .split(',')
    .map(normalizeExtension)
    .filter(part => part.length > 0);

const collectExtensions = (selection: ExtensionSelection, custom: string) => {
  const result = new Set<string>();
  Object.values(selection).forEach(set => {
    set.forEach(ext => result.add(ext));
  });
  splitCustomExtensions(custom).forEach(ext => result.add(ext));
  return Array.from(result).sort();
};

const initialSelections = () => {
  return {
    [FileType.Image]: new Set<string>(),
    [FileType.Video]: new Set<string>(),
    [FileType.GraphicTool]: new Set<string>(),
    [FileType.Audio]: new Set<string>(),
    [FileType.Document]: new Set<string>(),
    [FileType.Archive]: new Set<string>(),
    [FileType.Unknown]: new Set<string>(),
  };
};

const partitionExtensions = (
  lookup: Map<string, FileType>,
  extensions?: string[],
): { selections: ExtensionSelection; remainder: string[] } => {
  const selections: ExtensionSelection = initialSelections();
  const remainder: string[] = [];

  if (!extensions) {
    return { selections, remainder };
  }

  extensions.forEach(raw => {
    const normalized = normalizeExtension(raw);
    if (!normalized) return;
    const fileType = lookup.get(normalized);
    if (fileType) {
      selections[fileType]?.add(normalized);
    } else {
      remainder.push(normalized);
    }
  });

  return { selections, remainder };
};

interface FolderOptionsModalProps {
  node: FileTreeData;
  moaId: string;
  onClose: () => void;
  onUpdated: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const FolderOptionsModal: React.FC<FolderOptionsModalProps> = ({
  node,
  moaId,
  onClose,
  onUpdated,
}) => {
  const mount: FolderMountState | undefined = useMemo(() => node.mounts?.[0], [node.mounts]);

  const [path, setPath] = useState<string>(mount?.realPath ?? '');
  const [recursive, setRecursive] = useState<boolean>(mount?.recursive ?? true);
  const [syncEnabled, setSyncEnabled] = useState<boolean>(mount?.syncEnabled ?? false);
  const [suppressWarnings, setSuppressWarnings] = useState<boolean>(
    mount?.suppressWarnings ?? false,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensionGroups, setExtensionGroups] = useState<FileTypeExtensionGroup[]>([]);
  const [loadingExtensions, setLoadingExtensions] = useState(true);
  const [includeSelection, setIncludeSelection] = useState<ExtensionSelection>(initialSelections());
  const [excludeSelection, setExcludeSelection] = useState<ExtensionSelection>(initialSelections());
  const [includeCustom, setIncludeCustom] = useState('');
  const [excludeCustom, setExcludeCustom] = useState('');
  const [expandedInclude, setExpandedInclude] = useState<Set<FileType>>(() => new Set());
  const [expandedExclude, setExpandedExclude] = useState<Set<FileType>>(() => new Set());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const groups = await ipc.file.listFileTypeExtensions();
        if (!mounted) return;
        setExtensionGroups(groups);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) {
          setLoadingExtensions(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setPath(mount?.realPath ?? '');
    setRecursive(mount?.recursive ?? true);
    setSyncEnabled(mount?.syncEnabled ?? false);
    setSuppressWarnings(mount?.suppressWarnings ?? false);
  }, [mount?.realPath, mount?.recursive, mount?.syncEnabled, mount?.suppressWarnings]);

  const extensionLookup = useMemo(() => {
    const map = new Map<string, FileType>();
    extensionGroups.forEach(group => {
      group.extensions.forEach(ext => {
        map.set(normalizeExtension(ext), group.fileType);
      });
    });
    return map;
  }, [extensionGroups]);

  useEffect(() => {
    if (!mount) {
      setIncludeSelection(initialSelections());
      setExcludeSelection(initialSelections());
      setIncludeCustom('');
      setExcludeCustom('');
      setExpandedInclude(new Set());
      setExpandedExclude(new Set());
      return;
    }

    const includeParsed = partitionExtensions(extensionLookup, mount.includeExtensions);
    setIncludeSelection(includeParsed.selections);
    setIncludeCustom(includeParsed.remainder.join(', '));

    const excludeParsed = partitionExtensions(extensionLookup, mount.excludeExtensions);
    setExcludeSelection(excludeParsed.selections);
    setExcludeCustom(excludeParsed.remainder.join(', '));

    setExpandedInclude(new Set());
    setExpandedExclude(new Set());
  }, [mount?.mountId, mount?.includeExtensions, mount?.excludeExtensions, extensionLookup]);

  const setSelectionFor = (
    setter: React.Dispatch<React.SetStateAction<ExtensionSelection>>,
    fileType: FileType,
    values: Set<string>,
  ) => {
    setter(prev => {
      const next = { ...prev } as ExtensionSelection;
      const normalized = new Set(Array.from(values).map(normalizeExtension));
      if (normalized.size === 0) {
        omitKey(next, fileType);
      } else {
        next[fileType] = normalized;
      }
      return next;
    });
  };

  const toggleGroupExpansion = (
    setter: React.Dispatch<React.SetStateAction<Set<FileType>>>,
    fileType: FileType,
  ) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(fileType)) {
        next.delete(fileType);
      } else {
        next.add(fileType);
      }
      return next;
    });
  };

  const renderFilterColumn = (
    kind: 'include' | 'exclude',
    selection: ExtensionSelection,
    setSelection: React.Dispatch<React.SetStateAction<ExtensionSelection>>,
    expanded: Set<FileType>,
    setExpanded: React.Dispatch<React.SetStateAction<Set<FileType>>>,
    customValue: string,
    setCustomValue: (value: string) => void,
  ) => {
    const title = kind === 'include' ? '포함할 확장자' : '제외할 확장자';
    const description =
      kind === 'include'
        ? '선택된 확장자만 동기화 대상에 포함됩니다.'
        : '선택된 확장자는 동기화 대상에서 제외됩니다.';

    return (
      <div className="space-y-3">
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-xs text-modal-text-secondary">{description}</p>
        </div>
        <div className="space-y-2">
          {extensionGroups
            .filter(group => group.fileType !== FileType.Unknown)
            .map(group => {
              const selectedSet = selection[group.fileType];
              const selectedCount = selectedSet?.size ?? 0;
              const totalCount = group.extensions.length;
              const isExpanded = expanded.has(group.fileType);
              const isChecked = selectedCount > 0;
              const isIndeterminate =
                selectedCount > 0 && totalCount > 0 && selectedCount < totalCount;

              return (
                <div
                  key={group.fileType}
                  className="rounded-lg border border-modal-input-bg/60 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        ref={element => {
                          if (element) {
                            element.indeterminate = isIndeterminate;
                          }
                        }}
                        onChange={event => {
                          const { checked } = event.target;
                          if (!checked) {
                            setSelectionFor(setSelection, group.fileType, new Set());
                            return;
                          }
                          const values = new Set(group.extensions.map(normalizeExtension));
                          setSelectionFor(setSelection, group.fileType, values);
                          setExpanded(prev => {
                            const next = new Set(prev);
                            next.add(group.fileType);
                            return next;
                          });
                        }}
                      />
                      <span className="flex-1 text-sm">{FILE_TYPE_LABELS[group.fileType]}</span>
                      <span className="text-xs text-modal-text-secondary">
                        {selectedCount}/{totalCount}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="text-xs text-modal-text-secondary underline"
                      onClick={() => {
                        toggleGroupExpansion(setExpanded, group.fileType);
                      }}
                    >
                      {isExpanded ? '접기' : '세부 선택'}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      {group.extensions.map(ext => {
                        const normalized = normalizeExtension(ext);
                        const isExtensionChecked = selectedSet?.has(normalized);
                        return (
                          <label key={ext} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isExtensionChecked}
                              onChange={event => {
                                const next = new Set(selectedSet);
                                if (event.target.checked) {
                                  next.add(normalized);
                                } else {
                                  next.delete(normalized);
                                }
                                setSelectionFor(setSelection, group.fileType, next);
                              }}
                            />
                            <span>.{ext}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-modal-text-secondary">
            {FILE_TYPE_LABELS[FileType.Unknown]}
          </label>
          <input
            className="w-full rounded-md border border-modal-input-bg bg-modal-input-bg px-3 py-2 text-sm text-modal-text focus:border-primary focus:outline-none"
            value={customValue}
            onChange={event => {
              setCustomValue(event.target.value);
            }}
            placeholder="psd, clip"
          />
          <p className="text-xs text-modal-text-secondary">
            콤마로 구분된 확장자를 직접 입력하세요.
          </p>
        </div>
      </div>
    );
  };

  const handleSave = async () => {
    if (!mount) return;
    if (!moaId) {
      setError('MOA 컨텍스트를 찾을 수 없습니다.');
      return;
    }
    setIsSaving(true);
    setError(null);
    const includeExtensions = collectExtensions(includeSelection, includeCustom);
    const excludeExtensions = collectExtensions(excludeSelection, excludeCustom);
    const payload: FolderOptionUpdatePayload = {
      path: path.trim() || undefined,
      recursive,
      syncEnabled,
      suppressWarnings,
      includeExtensions,
      excludeExtensions,
    };
    try {
      await ipc.file.updateFolderOptions(moaId, node.id, payload);
      onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '옵션을 저장하는 데 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    if (!mount) return;
    if (!moaId) {
      setError('MOA 컨텍스트를 찾을 수 없습니다.');
      return;
    }
    setIsSyncing(true);
    setError(null);
    try {
      await ipc.file.syncFolder(moaId, node.id);
      onUpdated();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : '동기화에 실패했습니다.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      className="bg-modal-bg max-w-xl max-h-[80vh] overflow-y-auto text-modal-text"
    >
      <div className="flex flex-col gap-6">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">폴더 옵션</h2>
          <p className="text-sm text-modal-text-secondary">
            가상 폴더와 연결된 실 폴더 경로 및 동기화 동작을 관리합니다.
          </p>
        </header>

        {!mount ? (
          <div className="rounded-lg border border-modal-input-bg p-4 text-sm text-modal-text-secondary">
            연결된 실 폴더가 없습니다. 우선 폴더를 가져온 뒤 옵션을 설정할 수 있습니다.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="folder-path">
                실 폴더 경로
              </label>
              <input
                id="folder-path"
                className="w-full rounded-md border border-modal-input-bg bg-modal-input-bg px-3 py-2 text-sm text-modal-text focus:border-primary focus:outline-none"
                value={path}
                onChange={event => {
                  setPath(event.target.value);
                }}
                placeholder="/Users/username/Pictures"
              />
              <p className="text-xs text-modal-text-secondary">
                경로를 수정하면 다음 동기화 시 새로운 위치에서 파일을 가져옵니다.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-modal-input-bg p-4 text-sm">
              <OptionToggle
                id="recursive"
                label="하위 폴더까지 모두 동기화"
                description="비활성화하면 현재 폴더 바로 아래의 파일만 가져옵니다."
                checked={recursive}
                onChange={setRecursive}
              />
              <OptionToggle
                id="auto-sync"
                label="앱 시작 시 자동 동기화"
                description="초기 부트스트랩 과정에서 변경 사항을 자동으로 가져옵니다."
                checked={syncEnabled}
                onChange={setSyncEnabled}
              />
              <OptionToggle
                id="suppress-warning"
                label="경고 아이콘 숨기기"
                description="변경 사항이 있어도 폴더 트리에서 경고 아이콘을 표시하지 않습니다."
                checked={suppressWarnings}
                onChange={setSuppressWarnings}
              />
            </div>

            <section className="space-y-3 rounded-lg border border-modal-input-bg p-4 text-sm">
              <div>
                <h3 className="font-medium">확장자 필터</h3>
                <p className="text-xs text-modal-text-secondary">
                  동기화 시 포함하거나 제외할 파일 확장자를 선택하세요.
                </p>
              </div>
              {loadingExtensions ? (
                <p className="text-xs text-modal-text-secondary">
                  확장자 정보를 불러오는 중입니다...
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {renderFilterColumn(
                    'include',
                    includeSelection,
                    setIncludeSelection,
                    expandedInclude,
                    setExpandedInclude,
                    includeCustom,
                    setIncludeCustom,
                  )}
                  {renderFilterColumn(
                    'exclude',
                    excludeSelection,
                    setExcludeSelection,
                    expandedExclude,
                    setExpandedExclude,
                    excludeCustom,
                    setExcludeCustom,
                  )}
                </div>
              )}
            </section>

            <section className="space-y-2 rounded-lg border border-modal-input-bg/60 p-4 text-sm">
              <h3 className="font-medium">최근 상태</h3>
              <div className="grid gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-modal-text-secondary">무결성</span>
                  <span className="capitalize">
                    {mount.errorFlag === 'success'
                      ? '정상'
                      : mount.errorFlag === 'mismatch'
                        ? '변경 감지'
                        : '경로 오류'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-modal-text-secondary">최근 스캔</span>
                  <span>{formatDate(mount.lastSeenAt)}</span>
                </div>
                {mount.errorMsg ? (
                  <p className="rounded bg-red-500/10 p-2 text-xs text-red-400">{mount.errorMsg}</p>
                ) : null}
              </div>
            </section>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </div>
        )}

        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleSync()}
              disabled={!mount || isSyncing}
            >
              {isSyncing ? '동기화 중...' : '지금 동기화'}
            </Button>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!mount || isSaving}
            >
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </footer>
      </div>
    </Modal>
  );
};

const OptionToggle = ({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="flex items-start justify-between gap-4" htmlFor={id}>
    <div>
      <div className="font-medium">{label}</div>
      <p className="text-xs text-modal-text-secondary">{description}</p>
    </div>
    <input
      id={id}
      type="checkbox"
      className="mt-1 h-4 w-4"
      checked={checked}
      onChange={event => {
        onChange(event.target.checked);
      }}
    />
  </label>
);

export default FolderOptionsModal;
