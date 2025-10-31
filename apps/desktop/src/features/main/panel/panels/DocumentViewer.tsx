import { type FC, useMemo } from 'react';
import { FileType } from '@tgim/types/file';
import { NodeFile } from '@tgim/types/graph';
import { cn } from '@tgim/utils/index';
import { TestEditor } from '@tgim/editor';

interface DocumentViewerProps {
  file: NodeFile;
  className?: string;
}

/**
 * Lightweight wrapper that mounts the shared Grim editor for document files.
 * For now this renders the test harness version of the editor so we can
 * iterate on integration without wiring persistence.
 */
const DocumentViewer: FC<DocumentViewerProps> = ({ file, className }) => {
  const fileDescription = useMemo(() => {
    switch (file.kind) {
      case FileType.Document:
        return '문서';
      default:
        return '파일';
    }
  }, [file.kind]);

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col bg-surface', className)}>
      <header className="flex flex-shrink-0 flex-col gap-1 border-b border-border bg-surface-raised px-6 py-4">
        <h2 className="truncate text-lg font-semibold text-foreground">{file.fileName}</h2>
        <span className="text-sm text-muted-foreground">{fileDescription} 편집</span>
      </header>
      <div className="flex-1 overflow-auto">
        <TestEditor />
      </div>
    </div>
  );
};

export default DocumentViewer;
