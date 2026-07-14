import { LocationAutocomplete } from '../components/LocationAutocomplete'
import {
  compareLocationOrder,
  compareRegionOrder,
  formatLocation,
  formatName,
  type RouteEncounter,
} from '../pokemon'

interface LocationsViewProps {
  routes: RouteEncounter[]
  loading: boolean
  error: string | null
  allRoutes: RouteEncounter[]
  onOpenLocation: (region: string, route: string) => void
}

export function LocationsView({
  routes,
  loading,
  error,
  allRoutes,
  onOpenLocation,
}: LocationsViewProps) {
  const groupedRoutes = routes.reduce<Record<string, RouteEncounter[]>>(
    (acc, route) => {
      const key = route.region
      acc[key] ??= []
      acc[key].push(route)
      return acc
    },
    {},
  )

  const regions = Object.entries(groupedRoutes).sort(([a], [b]) =>
    compareRegionOrder(a, b),
  )

  return (
    <div className="encounters-page">
      <div className="md:hidden">
        <LocationAutocomplete
          routes={allRoutes}
          onSelectLocation={onOpenLocation}
        />
      </div>
      <h1 className="moves-page-title">Locations</h1>
      <p className="about-description">
        Browse every wild encounter location grouped by region. Select a
        location to view its land and water encounters.
      </p>
      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <div className="location-region-list">
          {regions.map(([region, regionRoutes]) => (
            <section key={region} className="location-region-section">
              <h2 className="location-region-title">{formatName(region)}</h2>
              <ul className="location-list">
                {regionRoutes
                  .slice()
                  .sort((a, b) => compareLocationOrder(a.route, b.route))
                  .map((route) => (
                    <li key={`${route.region}/${route.route}`}>
                      <button
                        className="location-list-button"
                        onClick={() =>
                          onOpenLocation(route.region, route.route)
                        }
                      >
                        {formatLocation(route.route)}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
