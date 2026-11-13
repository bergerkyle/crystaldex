import { useState } from 'react'
import { AnimatedFrontSprite } from '../PokemonSprite'
import { itemIconUrl } from '../itemCategories'
import {
  STAT_DISPLAY,
  formatConstant,
  formatLocation,
  formatName,
  moveAccuracy,
} from '../pokemon'
import { CategoryMetaChip, TypeMetaChip } from './moveMeta'
import {
  baseLevelFor,
  computeMonStats,
  MAX_BADGES,
  ROCKET_EVENTS,
  monMoves,
  trainerLabel,
  type TrainerDetail,
  type TrainerItemInfo,
  type TrainerListItem,
} from '../trainers'

interface TrainerDetailViewProps {
  trainer: TrainerDetail | null
  error: string | null
  loading: boolean
  allTrainers: TrainerListItem[]
  allNames: Set<string>
  onOpenLocation: (region: string, route: string) => void
  onOpenItem: (key: string) => void
  onOpenMove: (key: string) => void
  onSelectPokemon: (name: string) => void
}

function ItemChip({
  item,
  fallbackKey,
  onOpenItem,
}: {
  item: TrainerItemInfo | null
  fallbackKey: string
  onOpenItem: (key: string) => void
}) {
  const icon = item ? itemIconUrl({ ...item, description: '' }) : null
  return (
    <button
      className="move-link trainer-item"
      onClick={() => onOpenItem(fallbackKey)}
    >
      {icon && (
        <img className="item-icon" src={icon} alt="" aria-hidden="true" />
      )}
      {item?.name ?? formatConstant(fallbackKey)}
    </button>
  )
}

const ROCKET_COOKIE = 'crystaldex_rocket'

function readRocketCookie(): string[] {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ROCKET_COOKIE}=([a-z,]*)`),
  )
  const valid: string[] = ROCKET_EVENTS.map((ev) => ev.key)
  return (match?.[1] ?? '').split(',').filter((k) => valid.includes(k))
}

function writeRocketCookie(keys: string[]) {
  document.cookie = `${ROCKET_COOKIE}=${keys.join(',')}; path=/; max-age=31536000; SameSite=Lax`
}

const BADGES_COOKIE = 'crystaldex_badges'

function readBadgesCookie(): number {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${BADGES_COOKIE}=(\\d+)`),
  )
  const value = match ? Number(match[1]) : 0
  return value >= 0 && value <= MAX_BADGES ? value : 0
}

export function TrainerDetailView({
  trainer,
  error,
  loading,
  allTrainers,
  allNames,
  onOpenLocation,
  onOpenItem,
  onOpenMove,
  onSelectPokemon,
}: TrainerDetailViewProps) {
  const [badges, setBadges] = useState(readBadgesCookie)
  const [rocket, setRocket] = useState(readRocketCookie)
  const baseLevel = baseLevelFor(badges, rocket.length)
  const [hardMode, setHardMode] = useState(false)

  const [manualVariant, setManualVariant] = useState<string | null>(null)
  const variant = trainer
    ? (trainer.variants.find((v) => v.key === manualVariant) ??
      trainer.variants.find(
        (v) =>
          v.variant?.minBadges != null &&
          v.variant.maxBadges != null &&
          badges >= v.variant.minBadges &&
          badges <= v.variant.maxBadges,
      ) ??
      trainer.variants[0])
    : null
  const team = variant
    ? hardMode && variant.hard
      ? variant.hard
      : variant.normal
    : null

  return (
    <main className="move-detail-page trainer-detail-page">
      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {trainer && team && (
        <article className="move-detail-content">
          <div className="trainer-controls">
            <label>
              Badges{' '}
              <select
                value={badges}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  setBadges(value)
                  setManualVariant(null)
                  document.cookie = `${BADGES_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`
                }}
              >
                {Array.from({ length: MAX_BADGES + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <details className="trainer-rocket-menu">
              <summary>
                Rocket events
                {rocket.length > 0 ? ` (${rocket.length})` : ''}
              </summary>
              <div className="trainer-rocket-options">
                {ROCKET_EVENTS.map(({ key, label }) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={rocket.includes(key)}
                      onChange={(e) => {
                        const next = ROCKET_EVENTS.map((ev) => ev.key).filter(
                          (k) =>
                            k === key ? e.target.checked : rocket.includes(k),
                        )
                        setRocket(next)
                        writeRocketCookie(next)
                      }}
                    />{' '}
                    {label}
                  </label>
                ))}
              </div>
            </details>
            {variant?.hard && (
              <label>
                <input
                  type="checkbox"
                  checked={hardMode}
                  onChange={(e) => setHardMode(e.target.checked)}
                />{' '}
                Hard mode team
              </label>
            )}
            <span
              className="trainer-info"
              tabIndex={0}
              aria-describedby="trainer-info-tip"
            >
              ⓘ
              <span
                className="trainer-info-tip"
                role="tooltip"
                id="trainer-info-tip"
              >
                Trainer levels scale with badges earned (badge level + 5) plus 2
                for each Rocket event completed (currently base Lv. {baseLevel}
                ). Stats use the engine formula with the trainer's DVs and EVs.
              </span>
            </span>
          </div>

          <div className="trainer-header">
            {trainer.picUrl && (
              <img className="trainer-header-pic" src={trainer.picUrl} alt="" />
            )}
            <div>
              <h2 className="move-detail-title">
                {trainerLabel(
                  trainer,
                  allTrainers.length ? allTrainers : [trainer],
                )}
              </h2>
              <p className="move-key">
                {trainer.className} ({formatConstant(trainer.classKey)})
                {trainer.double ? ' · Double battle' : ''}
              </p>
              {trainer.locations.length > 0 && (
                <ul className="encounter-inline-list">
                  {trainer.locations.map((location) => (
                    <li key={`${location.region}/${location.route}`}>
                      <button
                        className="move-link"
                        onClick={() =>
                          onOpenLocation(location.region, location.route)
                        }
                      >
                        {formatLocation(location.route)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {trainer.classItems.length > 0 && (
                <p className="trainer-class-items">
                  Items:{' '}
                  {trainer.classItems.map((item) => (
                    <ItemChip
                      key={item.key}
                      item={item}
                      fallbackKey={item.key}
                      onOpenItem={onOpenItem}
                    />
                  ))}
                </p>
              )}
            </div>
          </div>

          {trainer.variants.length > 1 && (
            <div className="trainer-variants" role="tablist">
              {trainer.variants.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={v.key === variant?.key}
                  className={`trainer-variant${v.key === variant?.key ? ' active' : ''}`}
                  onClick={() => setManualVariant(v.key)}
                >
                  {v.variant?.label ?? v.key}
                </button>
              ))}
            </div>
          )}
          {team.randomCount !== null && (
            <p className="muted">
              Random team: {team.randomCount} Pokémon drawn from the pool below.
            </p>
          )}

          <div className="trainer-party">
            {team.mons.map((mon, index) => {
              const computed = computeMonStats(
                mon,
                trainer,
                baseLevel,
                hardMode,
              )
              const level = computed?.level ?? baseLevel + mon.levelOffset
              const moves = monMoves(mon, level)
              return (
                <section
                  className="trainer-mon"
                  key={`${mon.species}-${index}`}
                >
                  <div className="trainer-mon-head">
                    {mon.frontSprite && (
                      <AnimatedFrontSprite
                        front={mon.frontSprite}
                        displaySize={80}
                        shiny={mon.shiny}
                        ariaLabel={`${mon.species} front sprite`}
                      />
                    )}
                    <div>
                      <h3 className="trainer-mon-name">
                        <button
                          className="move-link"
                          onClick={() => onSelectPokemon(mon.species)}
                        >
                          {formatName(mon.species, mon.speciesRegion, allNames)}
                        </button>
                        {mon.nickname && (
                          <span className="muted"> “{mon.nickname}”</span>
                        )}
                      </h3>
                      <p className="trainer-mon-level">
                        Lv. {level}
                        {mon.shiny ? ' · Shiny' : ''}
                      </p>
                      <div className="pokemon-types">
                        {mon.types.map((type) => (
                          <TypeMetaChip key={type} type={type} />
                        ))}
                      </div>
                      {mon.ability && (
                        <p>Ability: {formatConstant(mon.ability)}</p>
                      )}
                      {mon.item && (
                        <p>
                          Item:{' '}
                          <ItemChip
                            item={mon.itemInfo}
                            fallbackKey={mon.item}
                            onOpenItem={onOpenItem}
                          />
                        </p>
                      )}
                      {mon.dvsPreset && !mon.dvs && (
                        <p className="muted">
                          DV preset: {formatConstant(mon.dvsPreset)} (class DVs
                          used for stats)
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="move-table-wrap">
                    <table className="move-table trainer-moves-table">
                      <thead>
                        <tr>
                          <th>Move</th>
                          <th>Type</th>
                          <th>Category</th>
                          <th>Power</th>
                          <th>Accuracy</th>
                          <th>PP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moves.map((move) => {
                          const info = trainer.moves[move]
                          return (
                            <tr
                              key={move}
                              className="move-table-row"
                              onClick={() => onOpenMove(move)}
                            >
                              <td className="move-table-name-cell">
                                {info?.name ?? formatConstant(move)}
                              </td>
                              <td>
                                {info && <TypeMetaChip type={info.type} />}
                              </td>
                              <td>
                                {info && (
                                  <CategoryMetaChip category={info.category} />
                                )}
                              </td>
                              <td>
                                {info && info.power > 0 ? info.power : '-'}
                              </td>
                              <td>
                                {info &&
                                moveAccuracy({ key: move, ...info }) > 0
                                  ? moveAccuracy({ key: move, ...info })
                                  : '-'}
                              </td>
                              <td>{info?.pp ?? '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!mon.moves && (
                    <p className="muted">
                      Moves are its latest level-up moves.
                    </p>
                  )}

                  {computed && (
                    <div className="trainer-mon-stats">
                      {STAT_DISPLAY.map(({ key, label, color }) => (
                        <div className="trainer-stat" key={key}>
                          <strong style={{ color }}>{label}:</strong>{' '}
                          {computed.stats[key]}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </article>
      )}
    </main>
  )
}
