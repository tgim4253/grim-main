export type ExplorerNodeIcon = 'anatomy' | 'gesture' | 'folder' | 'folder-open';

export type ExplorerNode = {
  id: string;
  label: string;
  icon: ExplorerNodeIcon;
  meta: string;
  children?: ExplorerNode[];
  defaultExpanded?: boolean;
};

export const EXPLORER_INITIAL_ACTIVE_NODE_ID = 'musculature';

export const EXPLORER_DUMMY_NODES: ExplorerNode[] = [
  {
    id: 'figure-study',
    label: 'Figure Study',
    icon: 'anatomy',
    meta: '[asset count]',
    defaultExpanded: true,
    children: [
      {
        id: 'skeletal-structure',
        label: 'Skeletal Structure',
        icon: 'folder',
        meta: '[asset count]',
      },
      {
        id: 'musculature',
        label: 'Musculature',
        icon: 'folder-open',
        meta: '[asset count]',
      },
    ],
  },
  {
    id: 'pose-studies',
    label: 'Pose Studies',
    icon: 'gesture',
    meta: '[asset count]',
  },
  {
    id: 'gesture-practice',
    label: 'Gesture Practice',
    icon: 'gesture',
    meta: '[asset count]',
  },
];
