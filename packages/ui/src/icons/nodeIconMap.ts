import type { LucideIcon } from 'lucide-react';
import {
  File as FileIcon,
  FileText,
  Folder,
  Image as ImageIcon,
  NotebookPen,
  Tag,
  Crop,
} from 'lucide-react';
import { NodeKind } from '@tgim/types/graph';

const baseNodeIconMap: Record<string, LucideIcon> = {
  [NodeKind.Folder]: Folder,
  [NodeKind.File]: FileIcon,
  [NodeKind.Memo]: NotebookPen,
  [NodeKind.Tag]: Tag,
  crop: Crop,
  image: ImageIcon,
  document: FileText,
};

const fallbackIcon: LucideIcon = FileIcon;

export const getNodeIcon = (kind?: string): LucideIcon => {
  if (!kind) return fallbackIcon;

  const key = kind.toLowerCase();
  return baseNodeIconMap[key] ?? fallbackIcon;
};

export const nodeIconMap = baseNodeIconMap;
