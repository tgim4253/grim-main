import { FileType } from '@tgim/types/file';

export const FILE_TYPE_ORDER: FileType[] = [
  FileType.Image,
  FileType.Video,
  FileType.Document,
  FileType.GraphicTool,
  FileType.Audio,
  FileType.Archive,
  FileType.Unknown,
];

export const FILE_TYPE_LABELS: Partial<Partial<Record<FileType, string>>> = {
  [FileType.Image]: '이미지',
  [FileType.Video]: '비디오',
  [FileType.Document]: '문서',
  [FileType.GraphicTool]: '그래픽',
  [FileType.Audio]: '오디오',
  [FileType.Archive]: '압축',
  [FileType.Unknown]: '기타',
};
