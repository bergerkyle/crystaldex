import { useEffect, useMemo, useState } from 'react'
import { formatName, type PokemonDetail, type PokemonListItem } from '../pokemon'
import { AnimatedFrontSprite } from '../PokemonSprite'
import { PokemonDetailView } from './PokemonDetailView'
import { TypeMetaChip } from './moveMeta'

interface PokedexViewProps {
  list: PokemonListItem[]
  listError: string | null
  loadingList: boolean
  filter: string
  selected: string | null
  detail: PokemonDetail | null
  detailError: string | null
  loadingDetail: boolean
  allNames: Set<string>
  onFilterChange: (value: string) => void
  onNavigatePokedexHome: () => void
  onSelectPokemon: (name: string) => void
  onOpenMove: (key: string) => void
  mobileSidebarOpen: boolean
  onCloseSidebar: () => void
}

export function PokedexView({
  list,
  listError,
  loadingList,
  filter,
  selected,
  detail,
  detailError,
  loadingDetail,
  allNames,
  onFilterChange,
  onNavigatePokedexHome,
  onSelectPokemon,
  onOpenMove,
  mobileSidebarOpen,
  onCloseSidebar,
}: PokedexViewProps) {
  const [typeFilter, setTypeFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 24

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    for (const p of list) for (const t of p.types) set.add(t.toLowerCase())
    return [...set].sort()
  }, [list])

  const allRegions = useMemo(() => {
    const set = new Set<string>()
    for (const p of list) set.add(p.region.toLowerCase())
    return [...set].sort()
  }, [list])

  const query = filter.trim().toLowerCase()
  const filtered = useMemo(() =>
    list.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query)) return false
      if (typeFilter && !p.types.map((t) => t.toLowerCase()).includes(typeFilter)) return false
      if (regionFilter && p.region.toLowerCase() !== regionFilter) return false
      return true
    }),
    [list, query, typeFilter, regionFilter],
  )
  const sorted = [...filtered].sort((a, b) =>
    formatName(a.name, a.region, allNames).localeCompare(
      formatName(b.name, b.region, allNames),
    ),
  )

  useEffect(() => {
    setPage(1)
  }, [query, typeFilter, regionFilter])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="pokedex">
      <button
        className={`sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
        aria-label="Close Pokédex list"
      />

      <aside className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <button
            className="title title-button"
            onClick={() => {
              onNavigatePokedexHome()
              onCloseSidebar()
            }}
          >
            Pokédex
          </button>
          <button
            className="sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close Pokédex list"
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
          placeholder="Search Pokemon..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        <div className="pokedex-filter-row">
          <select
            className="pokedex-filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <select
            className="pokedex-filter-select"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            aria-label="Filter by region"
          >
            <option value="">All regions</option>
            {allRegions.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
        {loadingList && <p className="muted">Loading...</p>}
        {listError && <p className="error">{listError}</p>}
        <ul className="list">
          {filtered.map((p) => (
            <li key={`${p.region}/${p.name}`}>
              <button
                className={p.name.toLowerCase() === selected?.toLowerCase() ? 'active' : ''}
                onClick={() => {
                  onSelectPokemon(p.name.toLowerCase())
                  onCloseSidebar()
                }}
              >
                {formatName(p.name, p.region, allNames)}
              </button>
            </li>
          ))}
        </ul>
        {!loadingList && !listError && filtered.length === 0 && (
          <p className="muted">No matches.</p>
        )}
      </aside>

      <div className="pokedex-main">
        <h1 className="pokedex-page-title">Pokédex</h1>
        <div className="mobile-pokedex-controls">
          {!selected && (
            <input
              className="search"
              type="search"
              placeholder="Search Pokemon..."
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
            />
          )}
          {!selected && (
            <div className="pokedex-filter-row">
              <select
                className="pokedex-filter-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="">All types</option>
                {allTypes.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
              <select
                className="pokedex-filter-select"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                aria-label="Filter by region"
              >
                <option value="">All regions</option>
                {allRegions.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!selected ? (
          <main className="detail pokemon-grid-page">
            {loadingList && <p className="muted">Loading...</p>}
            {listError && <p className="error">{listError}</p>}

            {!loadingList && !listError && sorted.length > 0 && (
              <ul className="pokemon-card-grid">
                {paginated.map((p) => (
                  <li key={`${p.region}/${p.name}`}>
                    <button
                      className="pokemon-card"
                      onClick={() => {
                        onSelectPokemon(p.name.toLowerCase())
                        onCloseSidebar()
                      }}
                    >
                      <AnimatedFrontSprite
                        className="pokemon-card-sprite"
                        front={p.frontSprite}
                        ariaLabel={`${formatName(p.name, p.region, allNames)} front sprite`}
                        displaySize={112}
                      />
                      <h3 className="pokemon-card-name">
                        {formatName(p.name, p.region, allNames)}
                      </h3>
                      <div className="pokemon-card-types" aria-label="Pokemon types">
                        {p.types.map((type) => (
                          <TypeMetaChip key={`${p.name}-${type}`} type={type} />
                        ))}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!loadingList && !listError && sorted.length > 0 && totalPages > 1 && (
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

            {!loadingList && !listError && sorted.length === 0 && (
              <p className="muted">No matches.</p>
            )}
          </main>
        ) : (
          <PokemonDetailView
            selected={selected}
            detail={detail}
            loadingDetail={loadingDetail}
            detailError={detailError}
            allNames={allNames}
            list={list}
            onSelectPokemon={onSelectPokemon}
            onOpenMove={onOpenMove}
          />
        )}
      </div>
    </div>
  )
}
