import { NormalizedCropRect } from '@tgim/types/crop';
import { Connection, GraphResponse, NodeCrop, NodeMemo } from '@tgim/types/graph';
import { useRef, useState } from 'react';

interface Props {
  nodesById?: Record<string, Node>;
  connections?: Connection[];
  onGraphUpdate?: (graph: GraphResponse) => void;
}

type MemoAttachmentType = 'file' | 'crop';

type MemoEntry = {
  memo: NodeMemo;
  attachmentNodeId: string;
  attachmentType: MemoAttachmentType;
  crop?: NodeCrop | null;
  marker?: number;
};
const ImageMemoView: React.FC<Props> = ({ nodesById, connections, onGraphUpdate }) => {
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [memoItems, setMemoItems] = useState<MemoEntry[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isCreatingMemo, setIsCreatingMemo] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<NormalizedCropRect | null>(null);

  return <div></div>;
};
