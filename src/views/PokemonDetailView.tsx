import { PokemonSprite } from '../PokemonSprite'
import {
  MAX_STAT,
  compareLocationOrder,
  STAT_DISPLAY,
  compareRegionOrder,
  evolutionMethodText,
  evolutionSourceMethodText,
  formatFishingRod,
  formatEncounterMethod,
  formatEncounterTime,
  formatLocation,
  type PokemonDetail,
  type PokemonListItem,
  formatName,
} from '../pokemon'
import { PokemonAutocomplete } from '../components/PokemonAutocomplete'
import { CategoryMetaChip, TypeMetaChip } from './moveMeta'

interface DetailAccordionSectionProps {
  title: string
  children: React.ReactNode
}

function DetailAccordionSection({
  title,
  children,
}: DetailAccordionSectionProps) {
  return (
    <details className="detail-accordion">
      <summary className="detail-accordion-summary">
        <span className="detail-accordion-title">{title}</span>
        <span className="detail-accordion-caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="detail-accordion-content">{children}</div>
    </details>
  )
}

interface PokemonDetailViewProps {
  selected: string | null
  detail: PokemonDetail | null
  loadingDetail: boolean
  detailError: string | null
  allNames: Set<string>
  list: PokemonListItem[]
  onSelectPokemon: (name: string) => void
  onOpenMove: (key: string) => void
  onOpenLocation: (region: string, route: string) => void
}

interface DisplayEncounter {
  region: string
  route: string
  method: PokemonDetail['encounters'][number]['method']
  rod?: PokemonDetail['encounters'][number]['rod']
  rate: number
  timeLabel: string
}

const ENCOUNTER_METHOD_ICONS = {
  surf: '/surf.png',
  old: '/Bag_Old_Rod_III_Sprite.png',
  good: '/Bag_Good_Rod_III_Sprite.png',
  super: '/Bag_Super_Rod_III_Sprite.png',
} as const

function EncounterMethodLabel({
  method,
  rod,
}: {
  method: PokemonDetail['encounters'][number]['method']
  rod?: PokemonDetail['encounters'][number]['rod']
}) {
  if (method === 'fishing') {
    const icon =
      rod === 'old'
        ? ENCOUNTER_METHOD_ICONS.old
        : rod === 'good'
          ? ENCOUNTER_METHOD_ICONS.good
          : rod === 'super'
            ? ENCOUNTER_METHOD_ICONS.super
            : null
    return (
      <span className="encounter-method-label">
        {icon && (
          <img
            className="encounter-method-icon"
            src={icon}
            alt=""
            width={14}
            height={14}
            aria-hidden="true"
          />
        )}
        {formatFishingRod(rod)}
      </span>
    )
  }

  if (method === 'water') {
    return (
      <span className="encounter-method-label">
        <img
          className="encounter-method-icon"
          src={ENCOUNTER_METHOD_ICONS.surf}
          alt=""
          width={14}
          height={14}
          aria-hidden="true"
        />
        {formatEncounterMethod(method)}
      </span>
    )
  }

  return <>{formatEncounterMethod(method)}</>
}

function encounterGroupOrder(entry: {
  method: PokemonDetail['encounters'][number]['method']
  rod?: PokemonDetail['encounters'][number]['rod']
}): number {
  if (entry.method === 'grass') return 0
  if (entry.method === 'water') return 1
  if (entry.method !== 'fishing') return 99
  if (entry.rod === 'old') return 2
  if (entry.rod === 'good') return 3
  if (entry.rod === 'super') return 4
  return 5
}

function groupDisplayEncounters(
  encounters: PokemonDetail['encounters'],
): DisplayEncounter[] {
  const grouped = new Map<
    string,
    {
      firstIndex: number
      region: string
      route: string
      method: PokemonDetail['encounters'][number]['method']
      rod?: PokemonDetail['encounters'][number]['rod']
      rate: number
      times: Set<string>
    }
  >()

  encounters.forEach((encounter, index) => {
    const key = [
      encounter.region,
      encounter.route,
      encounter.method,
      encounter.rod ?? '',
      encounter.rate,
    ].join('|')
    const existing = grouped.get(key)
    if (existing) {
      if (encounter.time) existing.times.add(encounter.time)
      return
    }
    grouped.set(key, {
      firstIndex: index,
      region: encounter.region,
      route: encounter.route,
      method: encounter.method,
      rod: encounter.rod,
      rate: encounter.rate,
      times: new Set(encounter.time ? [encounter.time] : []),
    })
  })

  return [...grouped.values()]
    .sort((a, b) => {
      const groupOrder = encounterGroupOrder(a) - encounterGroupOrder(b)
      if (groupOrder !== 0) return groupOrder
      const regionOrder = compareRegionOrder(a.region, b.region)
      if (regionOrder !== 0) return regionOrder
      const routeOrder = compareLocationOrder(a.route, b.route)
      if (routeOrder !== 0) return routeOrder
      return a.firstIndex - b.firstIndex
    })
    .map((entry) => {
      const hasAllTimes =
        entry.times.has('morn') &&
        entry.times.has('day') &&
        entry.times.has('nite')

      let timeLabel = 'Any'
      if (hasAllTimes) {
        timeLabel = 'All'
      } else if (entry.times.size > 0) {
        timeLabel = [...entry.times]
          .map((time) => formatEncounterTime(time as 'morn' | 'day' | 'nite'))
          .join(', ')
      }

      return {
        region: entry.region,
        route: entry.route,
        method: entry.method,
        rod: entry.rod,
        rate: entry.rate,
        timeLabel,
      }
    })
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
  onOpenLocation,
}: PokemonDetailViewProps) {
  const displayEncounters = detail
    ? groupDisplayEncounters(detail.encounters)
    : []

  return (
    <main className="detail !pt-0 md:!p-8">
      <div className="block md:hidden">
        <PokemonAutocomplete
          list={list}
          allNames={allNames}
          onSelectPokemon={onSelectPokemon}
        />
      </div>
      {!selected && (
        <p className="muted">Select a Pokemon to view its stats.</p>
      )}
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
          {detail.region && (
            <p className="region">{formatName(detail.region)}</p>
          )}
          <PokemonSprite
            front={detail.sprites.front}
            back={detail.sprites.back}
          />
          <div className="ability mb-4">
            <p className="ability-name">
              <strong>
                Ability: {detail.ability ? detail.ability.name : '(None)'}
              </strong>
            </p>
            {detail.ability && detail.ability.description && (
              <p className="ability-desc">{detail.ability.description}</p>
            )}
          </div>
          <div className="block sm:flex gap-4">
            {detail.evolutionSources.length > 0 && (
              <ul className="evolutions">
                {detail.evolutionSources.map((evo, i) => (
                  <li key={`${evo.from.name}-${i}`}>
                    Evolves from{' '}
                    <button
                      className="evo-link"
                      onClick={() =>
                        onSelectPokemon(evo.from.name.toLowerCase())
                      }
                    >
                      {formatName(evo.from.name, evo.from.region, allNames)}
                    </button>{' '}
                    {evolutionSourceMethodText(evo)}
                  </li>
                ))}
              </ul>
            )}
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
          </div>
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
                {STAT_DISPLAY.reduce(
                  (sum, { key }) => sum + detail.stats[key],
                  0,
                )}
              </span>
            </div>
          </div>
          {detail.moves.length > 0 && (
            <DetailAccordionSection title="Moves">
              <div className="moves">
                <ul className="move-list">
                  {detail.moves.map((m, i) => (
                    <li key={`${m.level}-${m.key}-${i}`} className="mb-2">
                      <span className="move-level">Lv. {m.level}</span>
                      <button
                        className="move-link mb-1"
                        onClick={() => onOpenMove(m.key)}
                      >
                        {m.name}
                      </button>
                      <span className="move-meta">
                        <TypeMetaChip type={m.type} />
                        <CategoryMetaChip category={m.category} />
                        <span className="meta-text">
                          Pow {m.power > 0 ? m.power : '-'}
                        </span>
                        <span className="meta-text">
                          Acc {m.accuracy > 0 ? `${m.accuracy}%` : '-'}
                        </span>
                        <span className="meta-text">PP {m.pp}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </DetailAccordionSection>
          )}
          {detail.tmMoves.length > 0 && (
            <DetailAccordionSection title="TM/HM Moves">
              <div className="moves">
                <ul className="move-list">
                  {detail.tmMoves.map((m, i) => (
                    <li key={`${m.label}-${m.key}-${i}`} className="mb-2">
                      <span className="move-level">{m.label || 'Tutor'}</span>
                      <button
                        className="move-link mb-1"
                        onClick={() => onOpenMove(m.key)}
                      >
                        {m.name}
                      </button>
                      <span className="move-meta">
                        <TypeMetaChip type={m.type} />
                        <CategoryMetaChip category={m.category} />
                        <span className="meta-text">
                          Pow {m.power > 0 ? m.power : '-'}
                        </span>
                        <span className="meta-text">
                          Acc {m.accuracy > 0 ? `${m.accuracy}%` : '-'}
                        </span>
                        <span className="meta-text">PP {m.pp}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </DetailAccordionSection>
          )}

          {displayEncounters.length > 0 && (
            <DetailAccordionSection title="Wild Location">
              <div className="encounter-table-wrap">
                <table className="encounter-table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Region</th>
                      <th>Method</th>
                      <th>Time</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayEncounters.map((encounter, index) => (
                      <tr
                        key={`${encounter.route}-${encounter.method}-${encounter.timeLabel}-${index}`}
                      >
                        <td>
                          <button
                            className="move-table-link"
                            onClick={() =>
                              onOpenLocation(encounter.region, encounter.route)
                            }
                          >
                            {formatLocation(encounter.route)}
                          </button>
                        </td>
                        <td>{formatName(encounter.region)}</td>
                        <td>
                          <EncounterMethodLabel
                            method={encounter.method}
                            rod={encounter.rod}
                          />
                        </td>
                        <td>{encounter.timeLabel}</td>
                        <td>{encounter.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetailAccordionSection>
          )}
        </>
      )}
    </main>
  )
}
