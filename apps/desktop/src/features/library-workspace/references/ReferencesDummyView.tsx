import { useState } from 'react';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { ReferenceExplorerHeader } from './ReferenceExplorerHeader';
import { ReferenceMasonryTile } from './ReferenceMasonryTile';
import { DEFAULT_REFERENCE_SELECTED_ASSET_ID, REFERENCE_DUMMY_ASSETS } from './referenceDummyData';
import './reference-workspace.css';

export function ReferencesDummyView() {
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [selectedAssetId, setSelectedAssetId] = useState(DEFAULT_REFERENCE_SELECTED_ASSET_ID);
  const [previewOpen, setPreviewOpen] = useState(true);

  const handleSelectedAssetChange = (assetId: string) => {
    setSelectedAssetId(assetId);
    setPreviewOpen(true);
  };

  return (
    <LibraryWorkspace
      mode="references"
      items={REFERENCE_DUMMY_ASSETS}
      layout={layout}
      selectedItemId={selectedAssetId}
      gridAriaLabel="References"
      previewOpen={previewOpen}
      onLayoutChange={setLayout}
      onSelectedItemChange={handleSelectedAssetChange}
      renderHeader={headerProps => <ReferenceExplorerHeader {...headerProps} />}
      renderTile={(asset, tileState) => (
        <ReferenceMasonryTile
          asset={asset}
          layout={tileState.layout}
          selected={tileState.selected}
          onSelect={tileState.onSelect}
        />
      )}
      renderPreview={asset => (
        <AssetPreviewPanel
          asset={asset}
          onClose={() => {
            setPreviewOpen(false);
          }}
        />
      )}
    />
  );
}
