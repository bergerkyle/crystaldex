import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { type ItemListItem } from '../pokemon'
import {
  ITEM_CATEGORIES,
  type ItemCategoryId,
  categorizeItem,
  categoryLabel,
  categoryRank,
  isHiddenItem,
} from '../itemCategories'

interface ItemsViewProps {
  itemList: ItemListItem[]
  itemListError: string | null
  loadingItemList: boolean
  itemFilter: string
  onItemFilterChange: (value: string) => void
  onOpenItem: (key: string) => void
  onNavigateItemsHome: () => void
  mobileSidebarOpen: boolean
  onCloseSidebar: () => void
  children?: ReactNode
}

export function ItemsView({
  itemList,
  itemListError,
  loadingItemList,
  itemFilter,
  onItemFilterChange,
  onOpenItem,
  onNavigateItemsHome,
  mobileSidebarOpen,
  onCloseSidebar,
  children,
}: ItemsViewProps) {
  const [page, setPage] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState<ItemCategoryId | 'all'>(
    'all',
  )
  const PAGE_SIZE = 24

  const visibleItems = useMemo(
    () => itemList.filter((item) => !isHiddenItem(item)),
    [itemList],
  )

  const filteredItems = useMemo(() => {
    const query = itemFilter.trim().toLowerCase()
    return visibleItems.filter((item) => {
      if (
        categoryFilter !== 'all' &&
        categorizeItem(item) !== categoryFilter
      )
        return false
      if (!query) return true
      return (
        item.name.toLowerCase().includes(query) ||
        item.key.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      )
    })
  }, [visibleItems, itemFilter, categoryFilter])

  // Each visible item paired with its category, sorted by category then name.
  const categorizedItems = useMemo(
    () =>
      filteredItems
        .map((item) => ({ item, category: categorizeItem(item) }))
        .sort((a, b) => {
          const rank = categoryRank(a.category) - categoryRank(b.category)
          return rank !== 0 ? rank : a.item.name.localeCompare(b.item.name)
        }),
    [filteredItems],
  )

  const availableCategories = useMemo(() => {
    const present = new Set<ItemCategoryId>(
      visibleItems.map((item) => categorizeItem(item)),
    )
    return ITEM_CATEGORIES.filter((category) => present.has(category.id))
  }, [visibleItems])

  useEffect(() => {
    setPage(1)
  }, [itemFilter, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(categorizedItems.length / PAGE_SIZE))
  const paginatedItems = useMemo(
    () => categorizedItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [categorizedItems, page],
  )

  const sidebarGroups = useMemo(() => {
    const grouped = new Map<ItemCategoryId, ItemListItem[]>()
    for (const { item, category } of categorizedItems) {
      if (!grouped.has(category)) grouped.set(category, [])
      grouped.get(category)!.push(item)
    }

    return ITEM_CATEGORIES.filter((category) => grouped.has(category.id)).map(
      (category) => ({
        id: category.id,
        label: category.label,
        items: grouped.get(category.id)!,
      }),
    )
  }, [categorizedItems])

  const renderMainContent = () => {
    if (children) return children

    return (
      <>
        <h1 className="moves-page-title">Items</h1>
        <p className="muted item-page-subtitle">
          Browse held items, key effects, and where each item can be found.
        </p>
        <div className="item-category-filter">
          <label htmlFor="item-category-select">Category</label>
          <select
            id="item-category-select"
            className="item-category-select"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as ItemCategoryId | 'all')
            }
          >
            <option value="all">All categories</option>
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        {loadingItemList && <p className="muted">Loading...</p>}
        {itemListError && <p className="error">{itemListError}</p>}
        {!loadingItemList && !itemListError && filteredItems.length === 0 && (
          <p className="muted">No items found.</p>
        )}
        {!loadingItemList && !itemListError && filteredItems.length > 0 && (
          <>
            <div className="move-table-wrap">
              <table className="move-table item-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(({ item, category }, index) => {
                    const showHeading =
                      index === 0 ||
                      paginatedItems[index - 1].category !== category
                    return (
                      <Fragment key={item.key}>
                        {showHeading && (
                          <tr className="item-category-row">
                            <th colSpan={2} scope="colgroup">
                              {categoryLabel(category)}
                            </th>
                          </tr>
                        )}
                        <tr
                          className="move-table-row"
                          onClick={() => onOpenItem(item.key)}
                        >
                          <td className="move-table-name-cell">{item.name}</td>
                          <td>
                            {item.description || 'No description available.'}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                >
                  ← Prev
                </button>
                <span className="pagination-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </>
    )
  }

  return (
    <div className="moves-layout">
      <button
        className={`moves-sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
        aria-label="Close items sidebar"
      />

      <aside
        className={`moves-sidebar ${mobileSidebarOpen ? 'open' : ''}`}
        aria-label="Items"
      >
        <div className="moves-sidebar-head">
          <button
            className="moves-sidebar-title moves-sidebar-title-btn"
            onClick={() => {
              onNavigateItemsHome()
              onCloseSidebar()
            }}
          >
            Items
          </button>
          <button
            className="moves-sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close items sidebar"
          >
            <span className="sidebar-close-icon" aria-hidden="true">
              <span className="sidebar-close-line" />
              <span className="sidebar-close-line" />
            </span>
          </button>
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search items..."
          value={itemFilter}
          onChange={(e) => onItemFilterChange(e.target.value)}
        />
        {loadingItemList && <p className="muted">Loading...</p>}
        {itemListError && <p className="error">{itemListError}</p>}
        {!loadingItemList && !itemListError && sidebarGroups.length === 0 && (
          <p className="muted">No items found.</p>
        )}
        <div className="moves-sidebar-scroll">
          {sidebarGroups.map((group) => (
            <section className="moves-sidebar-type" key={group.id}>
              <p className="moves-sidebar-type-heading items-sidebar-letter-heading">
                {group.label}
              </p>
              <ul className="moves-sidebar-move-list">
                {group.items.map((item) => (
                  <li key={`sidebar-item-${item.key}`}>
                    <button
                      className="moves-sidebar-move-btn"
                      onClick={() => {
                        onOpenItem(item.key)
                        onCloseSidebar()
                      }}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>

      <main className="moves-page">{renderMainContent()}</main>
    </div>
  )
}
