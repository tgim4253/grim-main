import { useEffect, useMemo, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileType } from '@tgim/types/file';
import { NodeFile } from '@tgim/types/graph';
import { ipc } from '../../../../lib/ipc';
import { FileText } from 'lucide-react';

interface FileViewerProps {
  file: NodeFile;
  moaId: string | null;
}

const FileViewer: React.FC<FileViewerProps> = ({ file, moaId }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    file.kind === FileType.Image ? 'loading' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (file.kind !== FileType.Image) {
      setImageSrc(null);
      setStatus('idle');
      setErrorMessage(null);
      return;
    }
    if (!moaId) {
      setStatus('error');
      setErrorMessage('이미지를 불러오지 못했습니다.');
      return;
    }

    let isCancelled = false;
    setStatus('loading');
    setErrorMessage(null);

    const fetchImage = async () => {
      try {
        const path = await ipc.file.getFilePath(moaId, file.xxh364);
        if (isCancelled) return;
        setImageSrc(convertFileSrc(path));
        setStatus('ready');
      } catch (error) {
        console.error('[FileViewer] Failed to load original image', error);
        if (isCancelled) return;
        setStatus('error');
        setErrorMessage('이미지를 불러오지 못했습니다.');
      }
    };

    void fetchImage();

    return () => {
      isCancelled = true;
    };
  }, [file.kind, file.xxh364, moaId]);

  const fileDescription = useMemo(() => {
    switch (file.kind) {
      case FileType.Image:
        return '이미지 파일';
      case FileType.Video:
        return '비디오 파일';
      case FileType.Document:
        return '문서 파일';
      case FileType.Audio:
        return '오디오 파일';
      case FileType.Archive:
        return '압축 파일';
      case FileType.GraphicTool:
        return '그래픽 툴 파일';
      default:
        return '파일';
    }
  }, [file.kind]);

  return (
    <div className="flex h-full w-full flex-col gap-4 p-6 text-foreground">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="max-w-full truncate text-lg font-semibold">{file.fileName}</p>
        <p className="text-sm text-muted-foreground">{fileDescription}</p>
      </div>

      {file.kind === FileType.Image ? (
        <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted">
          {status === 'ready' && imageSrc ? (
            <img
              src={imageSrc}
              alt={file.fileName}
              className="max-h-full max-w-full object-contain"
            />
          ) : status === 'loading' ? (
            <p className="text-sm text-muted-foreground">이미지를 불러오는 중...</p>
          ) : (
            <p className="text-sm text-destructive">
              {errorMessage ?? '이미지를 불러오지 못했습니다.'}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface-muted">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">미리보기를 지원하지 않는 파일입니다.</p>
            <p className="text-xs text-muted-foreground">
              그래프 보기에서 다른 관계를 탐색해 보세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileViewer;
