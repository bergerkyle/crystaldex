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
  const query = filter.trim().toLowerCase()
  const filtered = query
    ? list.filter((p) => p.name.toLowerCase().includes(query))
    : list
  const sorted = [...filtered].sort((a, b) =>
    formatName(a.name, a.region, allNames).localeCompare(
      formatName(b.name, b.region, allNames),
    ),
  )

  return (
    <div className="pokedex">
      <button
        className={`sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
        aria-label="Close pokedex list"
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
            Pokedex
          </button>
          <button
            className="sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close pokedex list"
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
        <div className="mobile-pokedex-controls">
          <input
            className="search"
            type="search"
            placeholder="Search Pokemon..."
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </div>

        {!selected ? (
          <main className="detail pokemon-grid-page">
            {loadingList && <p className="muted">Loading...</p>}
            {listError && <p className="error">{listError}</p>}

            {!loadingList && !listError && sorted.length > 0 && (
              <ul className="pokemon-card-grid">
                {sorted.map((p) => (
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
            onSelectPokemon={onSelectPokemon}
            onOpenMove={onOpenMove}
          />
        )}
      </div>
    </div>
  )
}
