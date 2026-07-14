import { PokemonSprite } from '../PokemonSprite'
import {
  MAX_STAT,
  STAT_DISPLAY,
  evolutionMethodText,
  type PokemonDetail,
  type PokemonListItem,
  formatName,
} from '../pokemon'
import { PokemonAutocomplete } from '../components/PokemonAutocomplete'
import { CategoryMetaChip, TypeMetaChip } from './moveMeta'

interface PokemonDetailViewProps {
  selected: string | null
  detail: PokemonDetail | null
  loadingDetail: boolean
  detailError: string | null
  allNames: Set<string>
  list: PokemonListItem[]
  onSelectPokemon: (name: string) => void
  onOpenMove: (key: string) => void
}

export function PokemonDetailView({
  selected,
  detail,
  loadingDetail,
  detailError,
  allNames,
  list,
  onSelectPokemon,
  onOpenMove,
}: PokemonDetailViewProps) {
  return (
    <main className="detail">
      <PokemonAutocomplete list={list} allNames={allNames} onSelectPokemon={onSelectPokemon} />
      {!selected && <p className="muted">Select a Pokemon to view its stats.</p>}
      {loadingDetail && <p className="muted">Loading...</p>}
      {detailError && <p className="error">{detailError}</p>}
      {detail && (
        <>
          <h1 className="pokemon-name font-bold text-2xl">
            {formatName(detail.name, detail.region, allNames)}
          </h1>
          <div className="pokemon-types" aria-label="Pokemon types">
            {detail.types.map((type) => (
              <TypeMetaChip key={type} type={type} />
            ))}
          </div>
          {detail.region && <p className="region">{formatName(detail.region)}</p>}
          <PokemonSprite front={detail.sprites.front} back={detail.sprites.back} />
          {detail.evolutions.length > 0 && (
            <ul className="evolutions">
              {detail.evolutions.map((evo, i) => (
                <li key={`${evo.to.name}-${i}`}>
                  Evolves into{' '}
                  <button
                    className="evo-link"
                    onClick={() => onSelectPokemon(evo.to.name.toLowerCase())}
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
            <div className="stat-row">
              <span className="stat-label">Total</span>
              <span className="stat-value">
                {STAT_DISPLAY.reduce((sum, { key }) => sum + detail.stats[key], 0)}
              </span>
              <div className="stat-track" />
            </div>
          </div>
          {detail.moves.length > 0 && (
            <div className="moves">
              <h2 className="font-bold text-xl mb-4">Moves</h2>
              <ul className="move-list">
                {detail.moves.map((m, i) => (
                  <li key={`${m.level}-${m.key}-${i}`} className="mb-2">
                    <span className="move-level">Lv. {m.level}</span>
                    <button className="move-link mb-1" onClick={() => onOpenMove(m.key)}>
                      {m.name}
                    </button>
                    <span className="move-meta">
                      <TypeMetaChip type={m.type} />
                      <CategoryMetaChip category={m.category} />
                      <span className="meta-text">Pow {m.power > 0 ? m.power : '-'}</span>
                      <span className="meta-text">
                        Acc {m.accuracy > 0 ? `${m.accuracy}%` : '-'}
                      </span>
                      <span className="meta-text">PP {m.pp}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {detail.tmMoves.length > 0 && (
            <div className="moves">
              <h2 className="font-bold text-xl mb-4">TM/HM Moves</h2>
              <ul className="move-list">
                {detail.tmMoves.map((m, i) => (
                  <li key={`${m.label}-${m.key}-${i}`} className="mb-2">
                    <span className="move-level">{m.label || 'Tutor'}</span>
                    <button className="move-link mb-1" onClick={() => onOpenMove(m.key)}>
                      {m.name}
                    </button>
                    <span className="move-meta">
                      <TypeMetaChip type={m.type} />
                      <CategoryMetaChip category={m.category} />
                      <span className="meta-text">Pow {m.power > 0 ? m.power : '-'}</span>
                      <span className="meta-text">
                        Acc {m.accuracy > 0 ? `${m.accuracy}%` : '-'}
                      </span>
                      <span className="meta-text">PP {m.pp}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  )
}
