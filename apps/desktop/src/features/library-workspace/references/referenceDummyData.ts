import type { ReferenceAsset } from './types';

export const DEFAULT_REFERENCE_SELECTED_ASSET_ID = 'reference-06';

export const REFERENCE_DUMMY_ASSETS: readonly ReferenceAsset[] = [
  {
    id: 'reference-01',
    title: 'standing figure reference',
    ratio: '2:5',
    height: 530,
    metadata: {
      resolution: '4200 x 5600 px',
      addedAt: '24 Oct 2023',
      lastCroquisAt: '24 Oct 2023',
    },
    folders: ['Anatomy / Musculature', 'Reference / Portrait'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-01-related-01', tone: 'portrait', active: true },
        { id: 'reference-01-related-02', tone: 'gesture' },
        { id: 'reference-01-related-03', tone: 'shape' },
        { id: 'reference-01-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-02',
    title: 'seated anatomy study',
    ratio: '3:5',
    height: 440,
    metadata: {
      resolution: '3600 x 4800 px',
      addedAt: '02 Nov 2023',
      lastCroquisAt: '07 Nov 2023',
    },
    folders: ['Reference / Figure', 'Study / Warmup'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-02-related-01', tone: 'gesture', active: true },
        { id: 'reference-02-related-02', tone: 'portrait' },
        { id: 'reference-02-related-03', tone: 'shape' },
        { id: 'reference-02-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-03',
    title: 'portrait value block',
    ratio: '3:5',
    height: 350,
    metadata: {
      resolution: '3000 x 4200 px',
      addedAt: '08 Nov 2023',
      lastCroquisAt: '11 Nov 2023',
    },
    folders: ['Reference / Portrait', 'Lighting / Side'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-03-related-01', tone: 'portrait', active: true },
        { id: 'reference-03-related-02', tone: 'shape' },
        { id: 'reference-03-related-03', tone: 'gesture' },
        { id: 'reference-03-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-04',
    title: 'hand construction sheet',
    ratio: '4:5',
    height: 420,
    metadata: {
      resolution: '2800 x 3600 px',
      addedAt: '12 Nov 2023',
      lastCroquisAt: '18 Nov 2023',
    },
    folders: ['Anatomy / Hands', 'Reference / Detail'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-04-related-01', tone: 'shape', active: true },
        { id: 'reference-04-related-02', tone: 'gesture' },
        { id: 'reference-04-related-03', tone: 'portrait' },
        { id: 'reference-04-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-05',
    title: 'torso rotation block',
    ratio: '3:4',
    height: 320,
    metadata: {
      resolution: '3200 x 4200 px',
      addedAt: '19 Nov 2023',
      lastCroquisAt: '21 Nov 2023',
    },
    folders: ['Anatomy / Torso', 'Croquis / Rotation'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-05-related-01', tone: 'gesture', active: true },
        { id: 'reference-05-related-02', tone: 'shape' },
        { id: 'reference-05-related-03', tone: 'portrait' },
        { id: 'reference-05-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-06',
    title: 'selected shoulder study',
    ratio: '4:5',
    height: 260,
    metadata: {
      resolution: '4200 x 5600 px',
      addedAt: '24 Oct 2023',
      lastCroquisAt: '24 Oct 2023',
    },
    folders: ['Anatomy / Musculature', 'Reference / Portrait'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-06-related-01', tone: 'portrait', active: true },
        { id: 'reference-06-related-02', tone: 'gesture' },
        { id: 'reference-06-related-03', tone: 'shape' },
        { id: 'reference-06-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-07',
    title: 'profile gesture pose',
    ratio: '3:4',
    height: 350,
    metadata: {
      resolution: '2400 x 3200 px',
      addedAt: '26 Oct 2023',
      lastCroquisAt: '03 Nov 2023',
    },
    folders: ['Reference / Gesture', 'Croquis / Daily'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-07-related-01', tone: 'gesture', active: true },
        { id: 'reference-07-related-02', tone: 'portrait' },
        { id: 'reference-07-related-03', tone: 'shape' },
        { id: 'reference-07-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-08',
    title: 'long drapery reference',
    ratio: '2:5',
    height: 450,
    metadata: {
      resolution: '3800 x 5400 px',
      addedAt: '28 Oct 2023',
      lastCroquisAt: '31 Oct 2023',
    },
    folders: ['Reference / Drapery', 'Material / Cloth'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-08-related-01', tone: 'shape', active: true },
        { id: 'reference-08-related-02', tone: 'gesture' },
        { id: 'reference-08-related-03', tone: 'portrait' },
        { id: 'reference-08-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-09',
    title: 'upper body silhouette',
    ratio: '3:4',
    height: 420,
    metadata: {
      resolution: '3300 x 4400 px',
      addedAt: '05 Nov 2023',
      lastCroquisAt: '09 Nov 2023',
    },
    folders: ['Reference / Silhouette', 'Anatomy / Upper Body'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-09-related-01', tone: 'portrait', active: true },
        { id: 'reference-09-related-02', tone: 'shape' },
        { id: 'reference-09-related-03', tone: 'gesture' },
        { id: 'reference-09-related-add', tone: 'add' },
      ],
    },
  },
  {
    id: 'reference-10',
    title: 'vertical pose sheet',
    ratio: '2:5',
    height: 530,
    metadata: {
      resolution: '4000 x 6000 px',
      addedAt: '14 Nov 2023',
      lastCroquisAt: '20 Nov 2023',
    },
    folders: ['Reference / Full Body', 'Croquis / Long Pose'],
    croquisResult: {
      label: 'Croquis Result',
      status: 'Primary',
      connectedImages: [
        { id: 'reference-10-related-01', tone: 'gesture', active: true },
        { id: 'reference-10-related-02', tone: 'portrait' },
        { id: 'reference-10-related-03', tone: 'shape' },
        { id: 'reference-10-related-add', tone: 'add' },
      ],
    },
  },
];
