import { cx } from '../../../shared/lib/cx';

type LibrarySidebarListSectionProps<TItem> = {
  title: string;
  count: number;
  active: boolean;
  items: TItem[];
  emptyCopy: string;
  getKey: (item: TItem) => string;
  getTitle: (item: TItem) => string;
  getMeta: (item: TItem) => string;
  isItemActive: (item: TItem) => boolean;
  onActivate: () => void;
  onOpenItem: (item: TItem) => void;
};

export function LibrarySidebarListSection<TItem>({
  title,
  count,
  active,
  items,
  emptyCopy,
  getKey,
  getTitle,
  getMeta,
  isItemActive,
  onActivate,
  onOpenItem,
}: LibrarySidebarListSectionProps<TItem>) {
  return (
    <section className="library-explorer__section">
      <button
        type="button"
        className={cx('library-section-button', active && 'library-section-button--active')}
        onClick={onActivate}
      >
        <span>{title}</span>
        <span className="library-section-button__count">{String(count)}</span>
      </button>
      <div className="library-list">
        {items.length === 0 ? (
          <div className="library-empty-copy">{emptyCopy}</div>
        ) : (
          items.map(item => (
            <button
              key={getKey(item)}
              type="button"
              className={cx(
                'library-list__item',
                isItemActive(item) && 'library-list__item--active',
              )}
              onClick={() => {
                onOpenItem(item);
              }}
            >
              <strong>{getTitle(item)}</strong>
              <span>{getMeta(item)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
