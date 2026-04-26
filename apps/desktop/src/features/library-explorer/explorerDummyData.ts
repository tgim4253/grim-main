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
    meta: '342',
    defaultExpanded: true,
    children: [
      {
        id: 'skeletal-structure',
        label: 'Skeletal Structure',
        icon: 'folder',
        meta: '84',
        children: [
          {
            id: 'skull-and-neck',
            label: 'Skull and Neck',
            icon: 'folder',
            meta: '22',
          },
          {
            id: 'spine-ribcage-pelvis',
            label: 'Spine, Ribcage, Pelvis',
            icon: 'folder',
            meta: '34',
          },
          {
            id: 'hands-feet-bones',
            label: 'Hands and Feet',
            icon: 'folder',
            meta: '28',
          },
        ],
      },
      {
        id: 'musculature',
        label: 'Musculature',
        icon: 'folder-open',
        meta: '126',
        defaultExpanded: true,
        children: [
          {
            id: 'torso-muscles',
            label: 'Torso Muscles',
            icon: 'folder',
            meta: '38',
          },
          {
            id: 'arm-shoulder-muscles',
            label: 'Arm and Shoulder',
            icon: 'folder',
            meta: '41',
          },
          {
            id: 'leg-hip-muscles',
            label: 'Leg and Hip',
            icon: 'folder',
            meta: '47',
          },
        ],
      },
      {
        id: 'head-hands-feet',
        label: 'Head, Hands, Feet',
        icon: 'folder',
        meta: '63',
        children: [
          {
            id: 'portrait-head-planes',
            label: 'Head Planes',
            icon: 'folder',
            meta: '19',
          },
          {
            id: 'hand-reference',
            label: 'Hand Reference',
            icon: 'folder',
            meta: '27',
          },
          {
            id: 'feet-reference',
            label: 'Feet Reference',
            icon: 'folder',
            meta: '17',
          },
        ],
      },
    ],
  },
  {
    id: 'pose-studies',
    label: 'Pose Studies',
    icon: 'gesture',
    meta: '248',
    defaultExpanded: true,
    children: [
      {
        id: 'standing-poses',
        label: 'Standing Poses',
        icon: 'folder',
        meta: '68',
      },
      {
        id: 'seated-poses',
        label: 'Seated Poses',
        icon: 'folder',
        meta: '45',
      },
      {
        id: 'dynamic-action',
        label: 'Dynamic Action',
        icon: 'folder',
        meta: '73',
      },
      {
        id: 'contrapposto-balance',
        label: 'Contrapposto Balance',
        icon: 'folder',
        meta: '62',
      },
    ],
  },
  {
    id: 'gesture-practice',
    label: 'Gesture Practice',
    icon: 'gesture',
    meta: '187',
    children: [
      {
        id: 'thirty-second',
        label: '30 Second',
        icon: 'folder',
        meta: '44',
      },
      {
        id: 'one-minute',
        label: '1 Minute',
        icon: 'folder',
        meta: '58',
      },
      {
        id: 'five-minute',
        label: '5 Minute',
        icon: 'folder',
        meta: '49',
      },
      {
        id: 'line-of-action',
        label: 'Line of Action',
        icon: 'folder',
        meta: '36',
      },
    ],
  },
  {
    id: 'lighting-and-form',
    label: 'Lighting and Form',
    icon: 'folder',
    meta: '156',
    children: [
      {
        id: 'single-light',
        label: 'Single Light',
        icon: 'folder',
        meta: '39',
      },
      {
        id: 'rim-light',
        label: 'Rim Light',
        icon: 'folder',
        meta: '27',
      },
      {
        id: 'value-block-in',
        label: 'Value Block-in',
        icon: 'folder',
        meta: '54',
      },
      {
        id: 'cast-shadow',
        label: 'Cast Shadow',
        icon: 'folder',
        meta: '36',
      },
    ],
  },
  {
    id: 'costume-drapery',
    label: 'Costume and Drapery',
    icon: 'folder',
    meta: '119',
    children: [
      {
        id: 'cloth-folds',
        label: 'Cloth Folds',
        icon: 'folder',
        meta: '46',
      },
      {
        id: 'loose-garments',
        label: 'Loose Garments',
        icon: 'folder',
        meta: '31',
      },
      {
        id: 'armor-props',
        label: 'Armor and Props',
        icon: 'folder',
        meta: '42',
      },
    ],
  },
  {
    id: 'favorites',
    label: 'Favorites',
    icon: 'folder',
    meta: '52',
  },
  {
    id: 'recent-imports',
    label: 'Recent Imports',
    icon: 'folder',
    meta: '91',
  },
];
