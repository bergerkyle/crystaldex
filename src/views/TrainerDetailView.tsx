import { useState } from 'react'
import { AnimatedFrontSprite } from '../PokemonSprite'
import { itemIconUrl } from '../itemCategories'
import {
  STAT_DISPLAY,
  formatConstant,
  formatLocation,
  formatName,
} from '../pokemon'
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
import { TYPE_ICONS } from './moveMeta'

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

const ROCKET_PARAM = 'rocket'

function readRocketParam(): string[] {
  const value = new URLSearchParams(window.location.search).get(ROCKET_PARAM)
  const valid: string[] = ROCKET_EVENTS.map((ev) => ev.key)
  return (value ?? '').split(',').filter((k) => valid.includes(k))
}

function writeRocketParam(keys: string[]) {
  const url = new URL(window.location.href)
  if (keys.length > 0) url.searchParams.set(ROCKET_PARAM, keys.join(','))
  else url.searchParams.delete(ROCKET_PARAM)
  window.history.replaceState({}, '', url)
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
  const [rocket, setRocket] = useState(readRocketParam)
  const baseLevel = baseLevelFor(badges, rocket.length)
  const [hardMode, setHardMode] = useState(false)

  const team = trainer
    ? hardMode && trainer.hard
      ? trainer.hard
      : trainer.normal
    : null

  return (
    <main className="move-detail-page trainer-detail-page">
      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {trainer && team && (
        <article className="move-detail-content">
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

          <div className="trainer-controls">
            <label>
              Badges{' '}
              <select
                value={badges}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  setBadges(value)
                  document.cookie = `${BADGES_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`
                }}
              >
                {Array.from({ length: MAX_BADGES + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n} (base Lv. {baseLevelFor(n, rocket.length)})
                  </option>
                ))}
              </select>
            </label>
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
                    writeRocketParam(next)
                  }}
                />{' '}
                {label} Rockets
              </label>
            ))}
            {trainer.hard && (
              <label>
                <input
                  type="checkbox"
                  checked={hardMode}
                  onChange={(e) => setHardMode(e.target.checked)}
                />{' '}
                Hard mode team
              </label>
            )}
          </div>
          <p className="muted trainer-note">
            Trainer levels scale with badges earned (badge level + 5) plus 2 for
            each Rocket event completed. Stats use the engine formula with the
            trainer's DVs and EVs.
          </p>
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
                      <p className="trainer-mon-types">
                        {mon.types.map((type) =>
                          TYPE_ICONS[type] ? (
                            <img
                              key={type}
                              src={TYPE_ICONS[type]}
                              alt={type}
                              title={type}
                              width={20}
                            />
                          ) : (
                            <span key={type}>{type}</span>
                          ),
                        )}
                      </p>
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

                  <ul className="trainer-mon-moves">
                    {moves.map((move) => (
                      <li key={move}>
                        <button
                          className="move-link"
                          onClick={() => onOpenMove(move)}
                        >
                          {trainer.moves[move]?.name ?? formatConstant(move)}
                        </button>
                      </li>
                    ))}
                    {!mon.moves && <li className="muted">(level-up moves)</li>}
                  </ul>

                  {computed && (
                    <div className="trainer-mon-stats">
                      {STAT_DISPLAY.map(({ key, label, color }) => (
                        <div className="stat-row" key={key}>
                          <span className="stat-label">{label}</span>
                          <span className="stat-value">
                            {computed.stats[key]}
                          </span>
                          <span className="stat-track">
                            <span
                              className="stat-bar"
                              style={{
                                display: 'block',
                                width: `${Math.min(100, (computed.stats[key] / (key === 'hp' ? 400 : 300)) * 100)}%`,
                                background: color,
                              }}
                            />
                          </span>
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
