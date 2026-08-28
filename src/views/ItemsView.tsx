import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { type ItemListItem } from '../pokemon'

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
  const PAGE_SIZE = 24

  const filteredItems = useMemo(() => {
    const query = itemFilter.trim().toLowerCase()
    if (!query) return itemList
    return itemList.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.key.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query),
    )
  }, [itemList, itemFilter])

  useEffect(() => {
    setPage(1)
  }, [itemFilter])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const paginatedItems = useMemo(
    () => filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredItems, page],
  )

  const sidebarGroups = useMemo(() => {
    const grouped = new Map<string, ItemListItem[]>()
    for (const item of filteredItems) {
      const first = item.name.trim().charAt(0).toUpperCase()
      const bucket = /^[A-Z]$/.test(first) ? first : '#'
      if (!grouped.has(bucket)) grouped.set(bucket, [])
      grouped.get(bucket)!.push(item)
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, items]) => ({
        bucket,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [filteredItems])

  const renderMainContent = () => {
    if (children) return children

    return (
      <>
        <h1 className="moves-page-title">Items</h1>
        <p className="muted item-page-subtitle">
          Browse held items, key effects, and where each item can be found.
        </p>
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
                  {paginatedItems.map((item) => (
                    <tr
                      key={item.key}
                      className="move-table-row"
                      onClick={() => onOpenItem(item.key)}
                    >
                      <td className="move-table-name-cell">{item.name}</td>
                      <td>{item.description || 'No description available.'}</td>
                    </tr>
                  ))}
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
            <section className="moves-sidebar-type" key={group.bucket}>
              <p className="moves-sidebar-type-heading items-sidebar-letter-heading">
                {group.bucket}
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
