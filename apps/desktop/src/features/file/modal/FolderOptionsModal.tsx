import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '@tgim/ui/index';
import { FolderMountState, FolderOptionUpdatePayload } from '@tgim/types/file';
import { FileTreeData } from '@tgim/types/index';
import { ipc } from '../../../lib/ipc';

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
  const [includeExtensionsInput, setIncludeExtensionsInput] = useState<string>(
    (mount?.includeExtensions ?? []).join(', '),
  );
  const [excludeExtensionsInput, setExcludeExtensionsInput] = useState<string>(
    (mount?.excludeExtensions ?? []).join(', '),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPath(mount?.realPath ?? '');
    setRecursive(mount?.recursive ?? true);
    setSyncEnabled(mount?.syncEnabled ?? false);
    setSuppressWarnings(mount?.suppressWarnings ?? false);
    setIncludeExtensionsInput((mount?.includeExtensions ?? []).join(', '));
    setExcludeExtensionsInput((mount?.excludeExtensions ?? []).join(', '));
  }, [
    mount?.realPath,
    mount?.recursive,
    mount?.syncEnabled,
    mount?.suppressWarnings,
    mount?.includeExtensions,
    mount?.excludeExtensions,
  ]);

  const parseExtensions = useCallback((value: string): string[] => {
    return value
      .split(',')
      .map(entry => entry.trim().replace(/^[.]+/, '').toLowerCase())
      .filter(Boolean);
  }, []);

  const handleSave = async () => {
    if (!mount) return;
    if (!moaId) {
      setError('MOA 컨텍스트를 찾을 수 없습니다.');
      return;
    }
    setIsSaving(true);
    setError(null);
    const includeExtensions = parseExtensions(includeExtensionsInput);
    const excludeExtensions = parseExtensions(excludeExtensionsInput);
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
      await onUpdated();
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
      await onUpdated();
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
                onChange={event => setPath(event.target.value)}
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

            <div className="space-y-3 rounded-lg border border-modal-input-bg/60 p-4 text-sm">
              <h3 className="font-medium">파일 확장자 필터</h3>
              <p className="text-xs text-modal-text-secondary">
                여러 값을 입력할 때는 쉼표로 구분하세요. `png, jpg`처럼 확장자 앞의 점은 생략해도
                됩니다.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="include-extensions">
                  포함할 확장자
                </label>
                <input
                  id="include-extensions"
                  className="w-full rounded-md border border-modal-input-bg bg-modal-input-bg px-3 py-2 text-sm text-modal-text focus:border-primary focus:outline-none"
                  value={includeExtensionsInput}
                  onChange={event => setIncludeExtensionsInput(event.target.value)}
                  placeholder="예: png, jpg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="exclude-extensions">
                  제외할 확장자
                </label>
                <input
                  id="exclude-extensions"
                  className="w-full rounded-md border border-modal-input-bg bg-modal-input-bg px-3 py-2 text-sm text-modal-text focus:border-primary focus:outline-none"
                  value={excludeExtensionsInput}
                  onChange={event => setExcludeExtensionsInput(event.target.value)}
                  placeholder="예: psd, tmp"
                />
              </div>
            </div>

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
            <Button variant="secondary" onClick={handleSync} disabled={!mount || isSyncing}>
              {isSyncing ? '동기화 중...' : '지금 동기화'}
            </Button>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              취소
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!mount || isSaving}>
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
      onChange={event => onChange(event.target.checked)}
    />
  </label>
);

export default FolderOptionsModal;
