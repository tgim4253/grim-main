import { Button } from '../../../../shared/ui';
import type { Tag, TagGroup } from '../../../../shared/types';
import { ALL_GROUP_FILTER, UNGROUPED_FILTER } from './constants';

type TagManagerSidebarProps = {
  groupFilter: string;
  tagGroups: TagGroup[];
  tags: Tag[];
  onCreateGroup: () => void;
  onSelectGroupFilter: (filter: string) => void;
  onSelectGroup: (group: TagGroup) => void;
};

export function TagManagerSidebar({
  groupFilter,
  tagGroups,
  tags,
  onCreateGroup,
  onSelectGroupFilter,
  onSelectGroup,
}: TagManagerSidebarProps) {
  return (
    <aside className="library-manager__nav">
      <div className="library-manager__header">
        <div>
          <div className="app-kicker">Tags</div>
          <strong>Groups & Filters</strong>
        </div>
        <Button variant="secondary" size="sm" onClick={onCreateGroup}>
          New Group
        </Button>
      </div>

      <div className="library-list">
        <button
          type="button"
          className={`library-list__item${groupFilter === ALL_GROUP_FILTER ? ' library-list__item--active' : ''}`}
          onClick={() => {
            onSelectGroupFilter(ALL_GROUP_FILTER);
          }}
        >
          <strong>All Tags</strong>
          <span>{tags.length} items</span>
        </button>
        <button
          type="button"
          className={`library-list__item${
            groupFilter === UNGROUPED_FILTER ? ' library-list__item--active' : ''
          }`}
          onClick={() => {
            onSelectGroupFilter(UNGROUPED_FILTER);
          }}
        >
          <strong>Ungrouped</strong>
          <span>{tags.filter(tag => !tag.groupId).length} items</span>
        </button>
        {tagGroups.map(group => (
          <button
            key={group.id}
            type="button"
            className={`library-list__item${groupFilter === group.id ? ' library-list__item--active' : ''}`}
            onClick={() => {
              onSelectGroup(group);
            }}
          >
            <strong>{group.name}</strong>
            <span>{tags.filter(tag => tag.groupId === group.id).length} tags</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
