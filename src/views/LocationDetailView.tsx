import {
  formatFishingRod,
  formatEncounterTime,
  formatLocation,
  formatName,
  type FishingRod,
  type EncounterRate,
  type RouteEncounter,
} from '../pokemon'
import { LocationAutocomplete } from '../components/LocationAutocomplete'

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

function EncounterTable({
  title,
  rows,
  allNames,
  onSelectPokemon,
  showRod = false,
}: {
  title: string
  rows: EncounterTableRow[]
  allNames: Set<string>
  onSelectPokemon: (name: string) => void
  showRod?: boolean
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
                <th>Time</th>
                <th>Chance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.time}-${row.pokemon.region}/${row.pokemon.name}-${row.rate}`}
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
                  {showRod && <td>{formatFishingRod(row.rod)}</td>}
                  <td>{row.time}</td>
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
            rows={routeDetail.fishing.flatMap((group) =>
              group.encounters.map((entry) => ({
                pokemon: entry.pokemon,
                rod: group.rod,
                time: group.time ? formatEncounterTime(group.time) : 'Any',
                rate: entry.rate,
              })),
            )}
            allNames={allNames}
            onSelectPokemon={onSelectPokemon}
            showRod
          />
        </>
      )}
    </div>
  )
}
