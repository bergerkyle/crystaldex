import { PokemonSprite } from '../PokemonSprite'
import { useEffect, useState } from 'react'
import {
  MAX_STAT,
  compareLocationOrder,
  STAT_DISPLAY,
  compareRegionOrder,
  evolutionItemName,
  evolutionMethodText,
  evolutionSourceMethodText,
  formatFishingRod,
  formatEncounterMethod,
  formatEncounterTime,
  formatLocation,
  type Evolution,
  type EvolutionSource,
  type PokemonDetail,
  type PokemonListItem,
  formatName,
  moveAccuracy,
} from '../pokemon'
import { PokemonAutocomplete } from '../components/PokemonAutocomplete'
import { CategoryMetaChip, TypeMetaChip } from './moveMeta'
import { FIGHTING_TM_ICON, NORMAL_TM_ICON } from '../itemCategories'

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

function StatDiff({ diff }: { diff?: number }) {
  if (!diff) return null
  const up = diff > 0
  return (
    <span
      className="stat-diff"
      style={{ color: up ? '#1e88e5' : '#e53935', marginLeft: 4 }}
      title="Difference from source (.h) value"
    >
      ({up ? `+${diff}` : diff})
    </span>
  )
}

// An item name that reveals its description in a tooltip on hover/focus. Falls
// back to plain text when there is no description to show.
function ItemTooltip({
  name,
  description,
}: {
  name: string
  description: string
}) {
  if (!description) return <span className="item-name">{name}</span>
  return (
    <span className="item-tooltip-wrap" tabIndex={0}>
      <span className="item-name">{name}</span>
      <span className="item-tooltip" role="tooltip">
        {description}
      </span>
    </span>
  )
}

// Render an evolution trigger, wrapping the item name (if any) in a tooltip so
// its description shows on hover. `text` is the full trigger phrase (e.g.
// "with Water Stone"); the item name inside it becomes the tooltip trigger.
function EvolutionTrigger({
  evo,
  text,
  onOpenItem,
}: {
  evo: Evolution | EvolutionSource
  text: string
  onOpenItem: (key: string) => void
}) {
  const itemName = evolutionItemName(evo)
  if (itemName && evo.item && text.includes(itemName)) {
    const index = text.indexOf(itemName)
    const before = text.slice(0, index)
    const after = text.slice(index + itemName.length)
    return (
      <>
        {before}
        <button
          className="item-inline-link"
          onClick={() => onOpenItem(evo.item!)}
        >
          <ItemTooltip
            name={itemName}
            description={evo.itemDescription ?? ''}
          />
        </button>
        {after}
      </>
    )
  }
  return <>{text}</>
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
  onOpenItem: (key: string) => void
  onOpenLocation: (region: string, route: string) => void
}

interface DisplayEncounter {
  region: string
  route: string
  method: PokemonDetail['encounters'][number]['method']
  rod?: PokemonDetail['encounters'][number]['rod']
  tree?: PokemonDetail['encounters'][number]['tree']
  rate: number
  timeLabel: string
}

const ENCOUNTER_METHOD_ICONS = {
  surf: '/surf.png',
  old: '/Bag_Old_Rod_III_Sprite.png',
  good: '/Bag_Good_Rod_III_Sprite.png',
  super: '/Bag_Super_Rod_III_Sprite.png',
  headbutt: NORMAL_TM_ICON,
  rocksmash: FIGHTING_TM_ICON,
} as const

function EncounterMethodLabel({
  method,
  rod,
}: {
  method: PokemonDetail['encounters'][number]['method']
  rod?: PokemonDetail['encounters'][number]['rod']
}) {
  if (method === 'headbutt') {
    return (
      <span className="encounter-method-label">
        <img
          className="encounter-method-icon"
          src={ENCOUNTER_METHOD_ICONS.headbutt}
          alt=""
          width={14}
          height={14}
          aria-hidden="true"
        />
        {formatEncounterMethod(method)}
      </span>
    )
  }
  if (method === 'rocksmash') {
    return (
      <span className="encounter-method-label">
        <img
          className="encounter-method-icon"
          src={ENCOUNTER_METHOD_ICONS.rocksmash}
          alt=""
          width={14}
          height={14}
          aria-hidden="true"
        />
        {formatEncounterMethod(method)}
      </span>
    )
  }
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
  tree?: PokemonDetail['encounters'][number]['tree']
}): number {
  if (entry.method === 'grass') return 0
  if (entry.method === 'water') return 1
  if (entry.method === 'headbutt') return entry.tree === 'rare' ? 7 : 6
  if (entry.method === 'rocksmash') return 8
  if (entry.method === 'fixed') return 9
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
      tree?: PokemonDetail['encounters'][number]['tree']
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
      encounter.tree ?? '',
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
      tree: encounter.tree,
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
        tree: entry.tree,
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
  onOpenItem,
  onOpenLocation,
}: PokemonDetailViewProps) {
  const [showShiny, setShowShiny] = useState(false)

  useEffect(() => {
    setShowShiny(false)
  }, [detail?.name, detail?.region])

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
          {detail.sourceComparison?.sourceTypes && (
            <p className="type-diff" style={{ color: '#e53935' }}>
              Differs from source typing:{' '}
              {detail.sourceComparison.sourceTypes
                .map((t) => formatName(t))
                .join(' / ')}
            </p>
          )}
          {detail.region && (
            <p className="region">{formatName(detail.region)}</p>
          )}
          {detail.shinyPalette && (
            <label className="shiny-toggle" htmlFor="pokemon-shiny-toggle">
              <input
                id="pokemon-shiny-toggle"
                type="checkbox"
                checked={showShiny}
                onChange={(event) => setShowShiny(event.target.checked)}
              />
              <span>Shiny</span>
            </label>
          )}
          <PokemonSprite
            front={detail.sprites.front}
            back={detail.sprites.back}
            shiny={showShiny}
            shinyPalette={detail.shinyPalette}
          />
          <div className="ability mb-4">
            {detail.abilities.length === 0 ? (
              <p className="ability-name">
                <strong>Ability: (None)</strong>
              </p>
            ) : (
              <>
                <p className="ability-name">
                  <strong>
                    {detail.abilities.length > 1 ? 'Abilities' : 'Ability'}
                  </strong>
                </p>
                <ul className="ability-list">
                  {detail.abilities.map((ability) => (
                    <li
                      key={`${ability.name}-${ability.hidden ? 'hidden' : 'normal'}`}
                    >
                      <p className="ability-name">
                        <strong>{ability.name}</strong>
                        {ability.hidden && (
                          <span className="ability-hidden-tag">Hidden</span>
                        )}
                      </p>
                      {ability.description && (
                        <p className="ability-desc">{ability.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {detail.heldItems.length > 0 && (
            <div className="held-items mb-4">
              <p className="held-items-title">
                <strong>Held Items</strong>
              </p>
              <ul className="held-items-list">
                {detail.heldItems.map((item) => (
                  <li key={item.key}>
                    <button
                      className="item-inline-link"
                      onClick={() => onOpenItem(item.key)}
                    >
                      <ItemTooltip
                        name={item.name}
                        description={item.description}
                      />
                    </button>
                    <span className="held-item-rate">{item.rate}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                    <EvolutionTrigger
                      evo={evo}
                      text={evolutionSourceMethodText(evo)}
                      onOpenItem={onOpenItem}
                    />
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
                    <EvolutionTrigger
                      evo={evo}
                      text={evolutionMethodText(evo)}
                      onOpenItem={onOpenItem}
                    />
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
                  <span className="stat-value">
                    {value}
                    <StatDiff diff={detail.sourceComparison?.statDiffs[key]} />
                  </span>
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
                          Acc {moveAccuracy(m) > 0 ? moveAccuracy(m) : '-'}
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
                          Acc {moveAccuracy(m) > 0 ? moveAccuracy(m) : '-'}
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
                        key={`${encounter.route}-${encounter.method}-${encounter.tree ?? ''}-${encounter.timeLabel}-${index}`}
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
