import { useEffect, useMemo, useState } from 'react'
import { PokemonSprite } from './PokemonSprite'
import {
  MAX_STAT,
  STAT_DISPLAY,
  evolutionMethodText,
  formatConstant,
  formatName,
  type PokemonDetail,
  type PokemonListItem,
} from './pokemon'

export default function App() {
  const [list, setList] = useState<PokemonListItem[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [filter, setFilter] = useState('')

  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<PokemonDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    fetch('/api/pokemon')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load list (${res.status})`)
        return res.json() as Promise<PokemonListItem[]>
      })
      .then(setList)
      .catch((err: unknown) =>
        setListError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoadingDetail(true)
    setDetailError(null)
    setDetail(null)
    fetch(`/api/pokemon/${encodeURIComponent(selected)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${selected} (${res.status})`)
        return res.json() as Promise<PokemonDetail>
      })
      .then(setDetail)
      .catch((err: unknown) =>
        setDetailError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoadingDetail(false))
  }, [selected])

  const allNames = useMemo(
    () => new Set(list.map((p) => p.name.toLowerCase())),
    [list],
  )

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return list
    return list.filter((p) => p.name.toLowerCase().includes(query))
  }, [list, filter])

  return (
    <div className="pokedex">
      <aside className="sidebar">
        <h1 className="title">Pokédex</h1>
        <input
          className="search"
          type="search"
          placeholder="Search Pokémon…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {loadingList && <p className="muted">Loading…</p>}
        {listError && <p className="error">{listError}</p>}
        <ul className="list">
          {filtered.map((p) => (
            <li key={`${p.region}/${p.name}`}>
              <button
                className={p.name === selected ? 'active' : ''}
                onClick={() => setSelected(p.name)}
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

      <main className="detail">
        {!selected && <p className="muted">Select a Pokémon to view its stats.</p>}
        {loadingDetail && <p className="muted">Loading…</p>}
        {detailError && <p className="error">{detailError}</p>}
        {detail && (
          <>
            <h2 className="pokemon-name">
              {formatName(detail.name, detail.region, allNames)}
            </h2>
            {detail.region && (
              <p className="region">{formatName(detail.region)}</p>
            )}
            <PokemonSprite name={detail.name} />
            {detail.evolutions.length > 0 && (
              <ul className="evolutions">
                {detail.evolutions.map((evo, i) => (
                  <li key={`${evo.to.name}-${i}`}>
                    Evolves into{' '}
                    <button
                      className="evo-link"
                      onClick={() => setSelected(evo.to.name)}
                    >
                      {formatName(evo.to.name, evo.to.region, allNames)}
                    </button>{' '}
                    {evolutionMethodText(evo)}
                  </li>
                ))}
              </ul>
            )}
            <div className="stats">
              {STAT_DISPLAY.map(({ key, label, color }) => {
                const value = detail.stats[key]
                return (
                  <div className="stat-row" key={key}>
                    <span className="stat-label">{label}</span>
                    <span className="stat-value">{value}</span>
                    <div className="stat-track">
                      <div
                        className="stat-bar"
                        style={{
                          width: `${(value / MAX_STAT) * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {detail.moves.length > 0 && (
              <div className="moves">
                <h3>Moves</h3>
                <ul className="move-list">
                  {detail.moves.map((m, i) => (
                    <li key={`${m.level}-${m.move}-${i}`}>
                      <span className="move-level">Lv. {m.level}</span>
                      <span className="move-name">{formatConstant(m.move)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
