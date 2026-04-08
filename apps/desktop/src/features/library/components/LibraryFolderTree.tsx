import { cx } from '../../../shared/lib/cx';
import { type ExplorerFolderNode, type ExplorerSelection } from '../../../entities/library/model';

type LibraryFolderTreeProps = {
  tree: ExplorerFolderNode[];
  expandedFolderIds: string[];
  selectedItem: ExplorerSelection;
  onToggle: (folderId: string) => void;
  onOpen: (folderId: string) => void;
};

type FolderRowProps = {
  node: ExplorerFolderNode;
  expandedFolderIds: string[];
  selectedItem: ExplorerSelection;
  onToggle: (folderId: string) => void;
  onOpen: (folderId: string) => void;
};

function FolderRow({ node, expandedFolderIds, selectedItem, onToggle, onOpen }: FolderRowProps) {
  const isExpanded = expandedFolderIds.includes(node.id);
  const isSelected = selectedItem.kind === 'folder' && selectedItem.folderId === node.id;

  return (
    <li className="library-tree__node">
      <button
        type="button"
        className={cx('library-tree__row', isSelected && 'library-tree__row--selected')}
        onClick={() => {
          onOpen(node.id);
        }}
      >
        <span
          className={cx(
            'library-tree__toggle',
            node.children.length === 0 && 'library-tree__toggle--empty',
          )}
          onClick={event => {
            event.stopPropagation();
            if (node.children.length > 0) {
              onToggle(node.id);
            }
          }}
        >
          {node.children.length > 0 ? (isExpanded ? '▾' : '▸') : '•'}
        </span>
        <span className="library-tree__label" title={node.fullPath}>
          {node.name}
        </span>
      </button>

      {isExpanded && node.children.length > 0 ? (
        <ul className="library-tree__children">
          {node.children.map(child => (
            <FolderRow
              key={child.id}
              node={child}
              expandedFolderIds={expandedFolderIds}
              selectedItem={selectedItem}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function LibraryFolderTree({
  tree,
  expandedFolderIds,
  selectedItem,
  onToggle,
  onOpen,
}: LibraryFolderTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="library-empty-copy">
        No folders yet. Create logical groups here and import images into them.
      </div>
    );
  }

  return (
    <ul className="library-tree">
      {tree.map(node => (
        <FolderRow
          key={node.id}
          node={node}
          expandedFolderIds={expandedFolderIds}
          selectedItem={selectedItem}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
