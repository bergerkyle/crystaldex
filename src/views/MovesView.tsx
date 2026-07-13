import { useMemo, useState } from 'react'
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
}

export function MovesView({
  moveList,
  moveListError,
  loadingMoveList,
  moveFilter,
  onMoveFilterChange,
  onOpenMove,
}: MovesViewProps) {
  const [moveSortByType, setMoveSortByType] = useState<Record<string, MoveSortState>>({})

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
    const compareBySort = (sort: MoveSortState) => (a: MoveCatalogItem, b: MoveCatalogItem) => {
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
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, moves]) => {
        const sort = moveSortByType[type] ?? { key: 'name', dir: 'asc' }
        return { type, moves: [...moves].sort(compareBySort(sort)) }
      })
  }, [filteredMoves, moveSortByType])

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

  return (
    <main className="moves-page">
      <h2>Moves</h2>
      <div className="moves-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search moves..."
          value={moveFilter}
          onChange={(e) => onMoveFilterChange(e.target.value)}
        />
        <nav className="type-jump-nav" aria-label="Jump to move type">
          {TYPE_ORDER.map((type) => (
            <a
              key={type}
              href={`#type-heading-${type}`}
              className="type-jump-link"
              style={{ backgroundColor: TYPE_HEADER_COLORS[type], color: '#fff' }}
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
      {!loadingMoveList && !moveListError && sortedGroupedMoves.length === 0 && (
        <p className="muted">No moves found.</p>
      )}
      {sortedGroupedMoves.map((group) => (
        <section className="move-type-section" key={group.type}>
          <h3
            className="move-type-heading"
            id={`type-heading-${group.type}`}
            style={{
              backgroundColor: TYPE_HEADER_COLORS[group.type] ?? '#666',
              color: headerTextColor(TYPE_HEADER_COLORS[group.type] ?? '#666'),
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
                    <button className="sort-btn" onClick={() => toggleMoveSort(group.type, 'name')}>
                      Name{sortIndicator(group.type, 'name')}
                    </button>
                  </th>
                  <th>
                    <button className="sort-btn" onClick={() => toggleMoveSort(group.type, 'category')}>
                      Category{sortIndicator(group.type, 'category')}
                    </button>
                  </th>
                  <th>
                    <button className="sort-btn" onClick={() => toggleMoveSort(group.type, 'power')}>
                      Power{sortIndicator(group.type, 'power')}
                    </button>
                  </th>
                  <th>
                    <button className="sort-btn" onClick={() => toggleMoveSort(group.type, 'accuracy')}>
                      Accuracy{sortIndicator(group.type, 'accuracy')}
                    </button>
                  </th>
                  <th>
                    <button className="sort-btn" onClick={() => toggleMoveSort(group.type, 'pp')}>
                      PP{sortIndicator(group.type, 'pp')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.moves.map((m) => (
                  <tr key={m.key}>
                    <td>
                      <button className="move-table-link" onClick={() => onOpenMove(m.key)}>
                        {m.name}
                      </button>
                    </td>
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
    </main>
  )
}
