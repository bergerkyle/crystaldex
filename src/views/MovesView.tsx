import { type ReactNode, useMemo, useState } from 'react'
import { formatConstant, type MoveCatalogItem } from '../pokemon'
import {
  CategoryMetaChip,
  TYPE_HEADER_COLORS,
  TYPE_ICONS,
  TYPE_ORDER,
  headerTextColor,
} from './moveMeta'

type MoveSortKey = 'name' | 'category' | 'power' | 'accuracy' | 'pp'
type MoveSortDir = 'asc' | 'desc'
type MoveSortState = { key: MoveSortKey; dir: MoveSortDir }

interface MovesViewProps {
  moveList: MoveCatalogItem[]
  moveListError: string | null
  loadingMoveList: boolean
  moveFilter: string
  onMoveFilterChange: (value: string) => void
  onOpenMove: (key: string) => void
  onNavigateMovesHome: () => void
  mobileSidebarOpen: boolean
  onCloseSidebar: () => void
  children?: ReactNode
}

export function MovesView({
  moveList,
  moveListError,
  loadingMoveList,
  moveFilter,
  onMoveFilterChange,
  onOpenMove,
  onNavigateMovesHome,
  mobileSidebarOpen,
  onCloseSidebar,
  children,
}: MovesViewProps) {
  const [moveSortByType, setMoveSortByType] = useState<
    Record<string, MoveSortState>
  >({})
  const [openTypeSections, setOpenTypeSections] = useState<
    Record<string, boolean>
  >({})

  const filteredMoves = useMemo(() => {
    const query = moveFilter.trim().toLowerCase()
    if (!query) return moveList
    return moveList.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.key.toLowerCase().includes(query) ||
        m.type.toLowerCase().includes(query),
    )
  }, [moveList, moveFilter])

  const sortedGroupedMoves = useMemo(() => {
    const compareBySort =
      (sort: MoveSortState) => (a: MoveCatalogItem, b: MoveCatalogItem) => {
        const direction = sort.dir === 'asc' ? 1 : -1
        if (sort.key === 'name' || sort.key === 'category') {
          const left = String(a[sort.key]).toLowerCase()
          const right = String(b[sort.key]).toLowerCase()
          return left.localeCompare(right) * direction
        }
        return (a[sort.key] - b[sort.key]) * direction
      }

    const grouped = new Map<string, MoveCatalogItem[]>()
    for (const move of filteredMoves) {
      const type = move.type.toLowerCase()
      if (!grouped.has(type)) grouped.set(type, [])
      grouped.get(type)!.push(move)
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => {
        const ai = TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number])
        const bi = TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number])
        const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai
        const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi
        return ar !== br ? ar - br : a.localeCompare(b)
      })
      .map(([type, moves]) => {
        const sort = moveSortByType[type] ?? { key: 'name', dir: 'asc' }
        return { type, moves: [...moves].sort(compareBySort(sort)) }
      })
  }, [filteredMoves, moveSortByType])

  const sidebarGroupedMoves = useMemo(() => {
    const grouped = new Map<string, MoveCatalogItem[]>()
    for (const move of filteredMoves) {
      const type = move.type.toLowerCase()
      if (!grouped.has(type)) grouped.set(type, [])
      grouped.get(type)!.push(move)
    }

    const rank = (type: string) => {
      const index = TYPE_ORDER.indexOf(type as (typeof TYPE_ORDER)[number])
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => {
        const diff = rank(a) - rank(b)
        return diff !== 0 ? diff : a.localeCompare(b)
      })
      .map(([type, moves]) => ({
        type,
        moves: [...moves].sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [filteredMoves])

  const toggleMoveSort = (type: string, key: MoveSortKey) => {
    setMoveSortByType((prev) => {
      const current = prev[type] ?? { key: 'name', dir: 'asc' as MoveSortDir }
      const next: MoveSortState =
        current.key === key
          ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: 'asc' }
      return { ...prev, [type]: next }
    })
  }

  const sortIndicator = (type: string, key: MoveSortKey) => {
    const current = moveSortByType[type] ?? { key: 'name', dir: 'asc' }
    if (current.key !== key) return ''
    return current.dir === 'asc' ? ' ▲' : ' ▼'
  }

  const toggleTypeSection = (type: string) => {
    setOpenTypeSections((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const isFilteringMoves = moveFilter.trim().length > 0

  const renderMainContent = () => {
    if (children) return children

    return (
      <>
        <h1 className="moves-page-title">Moves</h1>
        <div className="moves-toolbar">
          <nav className="type-jump-nav" aria-label="Jump to move type">
            {TYPE_ORDER.map((type) => (
              <a
                key={type}
                href={`#type-heading-${type}`}
                className="type-jump-link"
                style={{
                  backgroundColor: TYPE_HEADER_COLORS[type],
                  color: '#fff',
                }}
              >
                {TYPE_ICONS[type] && (
                  <img
                    className="type-jump-icon"
                    src={TYPE_ICONS[type]}
                    alt=""
                    width={16}
                    height={16}
                    aria-hidden="true"
                  />
                )}
                {formatConstant(type)}
              </a>
            ))}
          </nav>
        </div>
        {loadingMoveList && <p className="muted">Loading...</p>}
        {moveListError && <p className="error">{moveListError}</p>}
        {!loadingMoveList &&
          !moveListError &&
          sortedGroupedMoves.length === 0 && (
            <p className="muted">No moves found.</p>
          )}
        {sortedGroupedMoves.map((group) => (
          <section className="move-type-section" key={group.type}>
            <h3
              className="move-type-heading"
              id={`type-heading-${group.type}`}
              style={{
                backgroundColor: TYPE_HEADER_COLORS[group.type] ?? '#666',
                color: headerTextColor(
                  TYPE_HEADER_COLORS[group.type] ?? '#666',
                ),
              }}
            >
              <span className="move-type-heading-inner">
                {TYPE_ICONS[group.type] && (
                  <img
                    className="move-type-icon"
                    src={TYPE_ICONS[group.type]}
                    alt={`${formatConstant(group.type)} icon`}
                    width={20}
                    height={20}
                  />
                )}
                {formatConstant(group.type).toUpperCase()}
              </span>
            </h3>
            <div className="move-table-wrap">
              <table className="move-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        className="sort-btn"
                        onClick={() => toggleMoveSort(group.type, 'name')}
                      >
                        Name{sortIndicator(group.type, 'name')}
                      </button>
                    </th>
                    <th>
                      <button
                        className="sort-btn"
                        onClick={() => toggleMoveSort(group.type, 'category')}
                      >
                        Category{sortIndicator(group.type, 'category')}
                      </button>
                    </th>
                    <th>
                      <button
                        className="sort-btn"
                        onClick={() => toggleMoveSort(group.type, 'power')}
                      >
                        Power{sortIndicator(group.type, 'power')}
                      </button>
                    </th>
                    <th>
                      <button
                        className="sort-btn"
                        onClick={() => toggleMoveSort(group.type, 'accuracy')}
                      >
                        Accuracy{sortIndicator(group.type, 'accuracy')}
                      </button>
                    </th>
                    <th>
                      <button
                        className="sort-btn"
                        onClick={() => toggleMoveSort(group.type, 'pp')}
                      >
                        PP{sortIndicator(group.type, 'pp')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.moves.map((m) => (
                    <tr
                      key={m.key}
                      className="move-table-row"
                      onClick={() => onOpenMove(m.key)}
                    >
                      <td className="move-table-name-cell">{m.name}</td>
                      <td>
                        <CategoryMetaChip category={m.category} />
                      </td>
                      <td>{m.power > 0 ? m.power : '-'}</td>
                      <td>{m.accuracy > 0 ? `${m.accuracy}%` : '-'}</td>
                      <td>{m.pp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </>
    )
  }

  return (
    <div className="moves-layout">
      <button
        className={`moves-sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
        aria-label="Close moves sidebar"
      />

      <aside
        className={`moves-sidebar ${mobileSidebarOpen ? 'open' : ''}`}
        aria-label="Moves by type"
      >
        <div className="moves-sidebar-head">
          <button
            className="moves-sidebar-title moves-sidebar-title-btn"
            onClick={() => {
              onNavigateMovesHome()
              onCloseSidebar()
            }}
          >
            Moves
          </button>
          <button
            className="moves-sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close moves sidebar"
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
          placeholder="Search moves..."
          value={moveFilter}
          onChange={(e) => onMoveFilterChange(e.target.value)}
        />
        {loadingMoveList && <p className="muted">Loading...</p>}
        {moveListError && <p className="error">{moveListError}</p>}
        {!loadingMoveList &&
          !moveListError &&
          sidebarGroupedMoves.length === 0 && (
            <p className="muted">No moves found.</p>
          )}
        <div className="moves-sidebar-scroll">
          {sidebarGroupedMoves.map((group) => (
            <section
              className="moves-sidebar-type"
              key={`sidebar-${group.type}`}
            >
              {(() => {
                const isOpen =
                  isFilteringMoves || openTypeSections[group.type] === true

                return (
                  <>
                    <button
                      className="moves-sidebar-type-toggle"
                      onClick={() => toggleTypeSection(group.type)}
                      style={{
                        backgroundColor:
                          TYPE_HEADER_COLORS[group.type] ?? '#666',
                        color: headerTextColor(
                          TYPE_HEADER_COLORS[group.type] ?? '#666',
                        ),
                      }}
                      aria-expanded={isOpen}
                    >
                      <span className="moves-sidebar-type-label">
                        {TYPE_ICONS[group.type] && (
                          <img
                            className="type-jump-icon"
                            src={TYPE_ICONS[group.type]}
                            alt=""
                            width={14}
                            height={14}
                            aria-hidden="true"
                          />
                        )}
                        {formatConstant(group.type)}
                      </span>
                      <span className="moves-sidebar-caret" aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="moves-sidebar-move-list">
                        {group.moves.map((move) => (
                          <li key={`sidebar-${group.type}-${move.key}`}>
                            <button
                              className="moves-sidebar-move-btn"
                              onClick={() => {
                                onOpenMove(move.key)
                                onCloseSidebar()
                              }}
                            >
                              {move.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )
              })()}
            </section>
          ))}
        </div>
      </aside>

      <main className="moves-page">{renderMainContent()}</main>
    </div>
  )
}
