import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileType } from '@tgim/types/file';
import { NodeFile } from '@tgim/types/graph';
import { cn } from '@tgim/utils/index';
import { TestEditor } from '@tgim/editor';
import { ipc } from '../../../../lib/ipc';
import { usePanelsStore } from '@tgim/stores/index';
import { toast } from 'react-toastify';

const SAVE_DEBOUNCE_MS = 800;
const DOCUMENT_EXTENSION = 'md';
const INVALID_FILE_CHARS = /[<>:"/\\|?*]+/g;

interface DocumentViewerProps {
  file: NodeFile;
  moaId: string | null;
  className?: string;
}

const DocumentViewer: FC<DocumentViewerProps> = ({ file, moaId, className }) => {
  const [title, setTitle] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const [initialBodyMarkdown, setInitialBodyMarkdown] = useState('');
  const [editorKey, setEditorKey] = useState(file.nodeId);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastPersistedRef = useRef({
    markdown: '',
    fileName: file.fileName,
    title: '',
    body: '',
  });
  const saveTimerRef = useRef<number | null>(null);
  const hasLoadedRef = useRef(false);

  const fallbackStem = useMemo(() => {
    return normalizeDocumentStem(stripExtension(file.fileName)) || 'document';
  }, [file.fileName]);

  const updatePanelName = useCallback(
    (name: string) => {
      const { panelEntities, updatePanel } = usePanelsStore.getState();
      Object.values(panelEntities).forEach(panel => {
        if (panel && panel.nodeId === file.nodeId) {
          updatePanel({ id: panel.id, name });
        }
      });
    },
    [file.nodeId],
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    setLoading(true);
    setErrorMessage(null);
    setSaveState('idle');
    setTitle('');
    setBodyMarkdown('');
    setInitialBodyMarkdown('');
    setEditorKey(file.nodeId);

    if (!moaId) {
      setLoading(false);
      setErrorMessage('워크스페이스 정보를 찾을 수 없습니다.');
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await ipc.document.load({
          moaId,
          nodeId: file.nodeId,
        });
        if (cancelled) return;

        const parsed = splitDocumentMarkdown(data.markdown, stripExtension(data.fileName));
        setTitle(parsed.title);
        setBodyMarkdown(parsed.body);
        setInitialBodyMarkdown(parsed.body);
        setEditorKey(`${file.nodeId}:${Date.now().toString()}`);
        lastPersistedRef.current = {
          markdown: composeDocumentMarkdown(parsed.title, parsed.body),
          fileName: data.fileName,
          title: parsed.title,
          body: parsed.body,
        };
        hasLoadedRef.current = true;
      } catch (error) {
        if (cancelled) return;
        console.error('[DocumentViewer] Failed to load document', error);
        toast.error('문서를 불러오지 못했습니다.');
        setErrorMessage('문서를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [file.nodeId, moaId]);

  const combinedMarkdown = useMemo(
    () => composeDocumentMarkdown(title, bodyMarkdown),
    [title, bodyMarkdown],
  );
  const targetFileName = useMemo(
    () => buildDocumentFileName(title, fallbackStem),
    [fallbackStem, title],
  );

  useEffect(() => {
    if (!hasLoadedRef.current || !moaId) return;

    if (
      combinedMarkdown === lastPersistedRef.current.markdown &&
      targetFileName === lastPersistedRef.current.fileName
    ) {
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      const run = async () => {
        setSaveState('saving');
        try {
          const result = await ipc.document.save({
            moaId,
            nodeId: file.nodeId,
            markdown: combinedMarkdown,
            baseName: title,
          });

          const previousFileName = lastPersistedRef.current.fileName;
          lastPersistedRef.current = {
            markdown: combinedMarkdown,
            fileName: result.file.fileName,
            title,
            body: bodyMarkdown,
          };
          if (result.file.fileName !== previousFileName) {
            updatePanelName(result.file.fileName);
          }
          setSaveState('idle');
        } catch (error) {
          console.error('[DocumentViewer] Failed to save document', error);
          toast.error('문서를 저장할 수 없습니다.');
          setSaveState('error');
        } finally {
          saveTimerRef.current = null;
        }
      };

      void run();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [bodyMarkdown, combinedMarkdown, file.nodeId, moaId, targetFileName, title, updatePanelName]);

  const handleEditorChange = useCallback((next: string) => {
    setBodyMarkdown(prev => (prev === next ? prev : next));
  }, []);

  const fileDescription = useMemo(() => {
    switch (file.kind) {
      case FileType.Document:
        return '문서';
      default:
        return '파일';
    }
  }, [file.kind]);

  const statusText = useMemo(() => {
    if (!hasLoadedRef.current) return '';
    if (saveState === 'saving') return '저장 중…';
    if (saveState === 'error') return '저장 실패';
    if (
      combinedMarkdown !== lastPersistedRef.current.markdown ||
      targetFileName !== lastPersistedRef.current.fileName
    ) {
      return '변경 사항 저장 예정';
    }
    return '저장됨';
  }, [combinedMarkdown, saveState, targetFileName]);

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col bg-surface', className)}>
      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border bg-surface-raised px-8 py-6">
        <input
          type="text"
          value={title}
          onChange={event => {
            setTitle(event.target.value);
          }}
          placeholder="제목을 입력하세요"
          disabled={!hasLoadedRef.current || loading || !!errorMessage}
          className="w-full bg-transparent text-3xl font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{fileDescription} 편집</span>
          {statusText ? <span>{statusText}</span> : null}
        </div>
      </header>
      <div className="flex-1 overflow-auto px-8 py-6">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            문서를 불러오는 중…
          </div>
        ) : errorMessage ? (
          <div className="flex h-full items-center justify-center text-destructive">
            {errorMessage}
          </div>
        ) : (
          <TestEditor
            docKey={editorKey}
            initialMarkdown={initialBodyMarkdown}
            onMarkdownChange={handleEditorChange}
          />
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;

const stripExtension = (value: string): string => {
  return value.replace(/\.[^./\\]+$/, '');
};

const splitDocumentMarkdown = (
  markdown: string,
  fallbackTitle: string,
): { title: string; body: string } => {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length === 0) {
    return { title: fallbackTitle, body: '' };
  }

  const firstLine = lines[0]?.trim();
  if (firstLine && /^#\s+/.test(firstLine)) {
    const extractedTitle = firstLine.replace(/^#\s+/, '').trim() || fallbackTitle;
    const remainder = lines
      .slice(1)
      .join('\n')
      .replace(/^[\s\n]+/, '');
    return { title: extractedTitle, body: remainder };
  }

  return { title: fallbackTitle, body: normalized };
};

const composeDocumentMarkdown = (title: string, body: string): string => {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return body;
  }
  if (!body) {
    return `# ${trimmedTitle}\n`;
  }
  return `# ${trimmedTitle}\n\n${body}`;
};

const normalizeDocumentStem = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const stemCandidate = trimmed.split(/[\\/]/).pop() ?? trimmed;
  const sanitized = stemCandidate
    .replace(INVALID_FILE_CHARS, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return sanitized;
};

const buildDocumentFileName = (title: string, fallback: string): string => {
  const stem = normalizeDocumentStem(title) || fallback || 'document';
  return `${stem}.${DOCUMENT_EXTENSION}`;
};
