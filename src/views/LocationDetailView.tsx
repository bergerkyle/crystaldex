import {
  formatFishingRod,
  formatEncounterTime,
  formatHeadbuttTree,
  formatLocation,
  formatName,
  type FishingRod,
  type HeadbuttTree,
  type EncounterRate,
  type RouteEncounter,
} from '../pokemon'
import { LocationAutocomplete } from '../components/LocationAutocomplete'
import { FIGHTING_TM_ICON, NORMAL_TM_ICON } from '../itemCategories'

interface LocationDetailViewProps {
  routeDetail: RouteEncounter | null
  allRoutes: RouteEncounter[]
  loading: boolean
  error: string | null
  allNames: Set<string>
  onBack: () => void
  onOpenLocation: (region: string, route: string) => void
  onSelectPokemon: (name: string) => void
}

interface EncounterTableRow {
  pokemon: EncounterRate['pokemon']
  time: string
  rate: number
  rod?: FishingRod
  tree?: HeadbuttTree
}

const ENCOUNTER_METHOD_ICONS = {
  surf: '/surf.png',
  old: '/Bag_Old_Rod_III_Sprite.png',
  good: '/Bag_Good_Rod_III_Sprite.png',
  super: '/Bag_Super_Rod_III_Sprite.png',
  headbutt: NORMAL_TM_ICON,
  rocksmash: FIGHTING_TM_ICON,
} as const

function RodLabel({ rod }: { rod?: FishingRod }) {
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

function HeadbuttTreeLabel({ tree }: { tree?: HeadbuttTree }) {
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
      {formatHeadbuttTree(tree)}
    </span>
  )
}

function RockSmashLabel() {
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
      Rock Smash
    </span>
  )
}

function SurfLabel() {
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
      Surf
    </span>
  )
}

function buildLandEncounterRows(
  grass: RouteEncounter['grass'],
): EncounterTableRow[] {
  const grouped = new Map<
    string,
    {
      firstIndex: number
      pokemon: EncounterRate['pokemon']
      rate: number
      times: Set<string>
    }
  >()

  let index = 0
  for (const group of grass) {
    for (const entry of group.encounters) {
      const key = `${entry.pokemon.region}|${entry.pokemon.name}|${entry.rate}`
      const existing = grouped.get(key)
      if (existing) {
        existing.times.add(group.time)
      } else {
        grouped.set(key, {
          firstIndex: index,
          pokemon: entry.pokemon,
          rate: entry.rate,
          times: new Set([group.time]),
        })
      }
      index++
    }
  }

  return [...grouped.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((entry) => {
      const hasAllTimes =
        entry.times.has('morn') &&
        entry.times.has('day') &&
        entry.times.has('nite')

      const time = hasAllTimes
        ? 'All'
        : [...entry.times]
            .map((value) =>
              formatEncounterTime(value as 'morn' | 'day' | 'nite'),
            )
            .join(', ')

      return {
        pokemon: entry.pokemon,
        time,
        rate: entry.rate,
      }
    })
}

function rodOrder(rod?: FishingRod): number {
  if (rod === 'old') return 0
  if (rod === 'good') return 1
  if (rod === 'super') return 2
  return 3
}

function buildFishingEncounterRows(
  fishing: RouteEncounter['fishing'],
): EncounterTableRow[] {
  const rows = fishing.flatMap((group) =>
    group.encounters.map((entry) => ({
      pokemon: entry.pokemon,
      rod: group.rod,
      time: group.time ? formatEncounterTime(group.time) : 'Any',
      rate: entry.rate,
    })),
  )

  return rows.sort((a, b) => {
    const byRod = rodOrder(a.rod) - rodOrder(b.rod)
    if (byRod !== 0) return byRod
    return a.pokemon.name.localeCompare(b.pokemon.name)
  })
}

function buildHeadbuttEncounterRows(
  headbutt: RouteEncounter['headbutt'],
): EncounterTableRow[] {
  const treeOrder = (tree?: HeadbuttTree) => (tree === 'rare' ? 1 : 0)
  return headbutt
    .flatMap((group) =>
      group.encounters.map((entry) => ({
        pokemon: entry.pokemon,
        tree: group.tree,
        time: '',
        rate: entry.rate,
      })),
    )
    .sort((a, b) => treeOrder(a.tree) - treeOrder(b.tree) || b.rate - a.rate)
}

function EncounterTable({
  title,
  rows,
  allNames,
  onSelectPokemon,
  showRod = false,
  showTree = false,
  showTime = true,
}: {
  title: string
  rows: EncounterTableRow[]
  allNames: Set<string>
  onSelectPokemon: (name: string) => void
  showRod?: boolean
  showTree?: boolean
  showTime?: boolean
}) {
  return (
    <section className="move-type-section">
      <h2 className="route-detail-table-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">No encounters.</p>
      ) : (
        <div className="move-table-wrap">
          <table className="move-table">
            <thead>
              <tr>
                <th>Pokemon</th>
                {showRod && <th>Rod</th>}
                {showTree && <th>Tree</th>}
                {showTime && <th>Time</th>}
                <th>Chance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.rod ?? ''}-${row.tree ?? ''}-${row.time}-${row.pokemon.region}/${row.pokemon.name}-${row.rate}`}
                >
                  <td>
                    <button
                      className="move-table-link"
                      onClick={() => onSelectPokemon(row.pokemon.name)}
                    >
                      {formatName(
                        row.pokemon.name,
                        row.pokemon.region,
                        allNames,
                      )}
                    </button>
                  </td>
                  {showRod && (
                    <td>
                      <RodLabel rod={row.rod} />
                    </td>
                  )}
                  {showTree && (
                    <td>
                      <HeadbuttTreeLabel tree={row.tree} />
                    </td>
                  )}
                  {showTime && (
                    <td>
                      {row.time === 'Surf' ? (
                        <SurfLabel />
                      ) : row.time === 'Rock Smash' ? (
                        <RockSmashLabel />
                      ) : (
                        row.time
                      )}
                    </td>
                  )}
                  <td>{row.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function LocationDetailView({
  routeDetail,
  allRoutes,
  loading,
  error,
  allNames,
  onBack,
  onOpenLocation,
  onSelectPokemon,
}: LocationDetailViewProps) {
  return (
    <div className="encounters-page">
      <div className="md:hidden">
        <LocationAutocomplete
          routes={allRoutes}
          onSelectLocation={onOpenLocation}
        />
      </div>
      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && !routeDetail && (
        <p className="muted">Location not found.</p>
      )}
      {routeDetail && (
        <>
          <p className="route-encounter-region">
            {formatName(routeDetail.region)}
          </p>
          <h1 className="moves-page-title location-detail-title">
            {formatLocation(routeDetail.route)}
          </h1>

          <EncounterTable
            title="Land Locations"
            rows={buildLandEncounterRows(routeDetail.grass)}
            allNames={allNames}
            onSelectPokemon={onSelectPokemon}
          />

          <EncounterTable
            title="Water Locations"
            rows={routeDetail.water.map((entry) => ({
              pokemon: entry.pokemon,
              time: 'Surf',
              rate: entry.rate,
            }))}
            allNames={allNames}
            onSelectPokemon={onSelectPokemon}
          />

          <EncounterTable
            title="Fishing Locations"
            rows={buildFishingEncounterRows(routeDetail.fishing)}
            allNames={allNames}
            onSelectPokemon={onSelectPokemon}
            showRod
          />

          {routeDetail.headbutt.length > 0 && (
            <EncounterTable
              title="Headbutt Trees"
              rows={buildHeadbuttEncounterRows(routeDetail.headbutt)}
              allNames={allNames}
              onSelectPokemon={onSelectPokemon}
              showTree
              showTime={false}
            />
          )}

          {routeDetail.rockSmash.length > 0 && (
            <EncounterTable
              title="Rock Smash"
              rows={routeDetail.rockSmash.map((entry) => ({
                pokemon: entry.pokemon,
                time: 'Rock Smash',
                rate: entry.rate,
              }))}
              allNames={allNames}
              onSelectPokemon={onSelectPokemon}
            />
          )}

          {routeDetail.fixed.length > 0 && (
            <EncounterTable
              title="Fixed Encounters"
              rows={routeDetail.fixed.map((entry) => ({
                pokemon: entry.pokemon,
                time: '',
                rate: entry.rate,
              }))}
              allNames={allNames}
              onSelectPokemon={onSelectPokemon}
              showTime={false}
            />
          )}
        </>
      )}
    </div>
  )
}
