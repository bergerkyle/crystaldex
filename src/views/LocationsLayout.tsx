import { useMemo, useState, type ReactNode } from 'react'
import {
  compareLocationOrder,
  compareRegionOrder,
  formatLocation,
  formatName,
  type RouteEncounter,
} from '../pokemon'

interface LocationsLayoutProps {
  routes: RouteEncounter[]
  loading: boolean
  error: string | null
  locationFilter: string
  onLocationFilterChange: (value: string) => void
  onOpenLocation: (region: string, route: string) => void
  onNavigateLocationsHome: () => void
  mobileSidebarOpen: boolean
  onCloseSidebar: () => void
  children: ReactNode
}

export function LocationsLayout({
  routes,
  loading,
  error,
  locationFilter,
  onLocationFilterChange,
  onOpenLocation,
  onNavigateLocationsHome,
  mobileSidebarOpen,
  onCloseSidebar,
  children,
}: LocationsLayoutProps) {
  const [openRegionSections, setOpenRegionSections] = useState<
    Record<string, boolean>
  >({})

  const sidebarGroupedRoutes = useMemo(() => {
    const grouped = new Map<string, RouteEncounter[]>()
    for (const route of routes) {
      const region = route.region.toLowerCase()
      if (!grouped.has(region)) grouped.set(region, [])
      grouped.get(region)!.push(route)
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => compareRegionOrder(a, b))
      .map(([region, regionRoutes]) => ({
        region,
        routes: [...regionRoutes].sort((a, b) =>
          compareLocationOrder(a.route, b.route),
        ),
      }))
  }, [routes])

  const isFilteringLocations = locationFilter.trim().length > 0

  const toggleRegionSection = (region: string) => {
    setOpenRegionSections((prev) => ({ ...prev, [region]: !prev[region] }))
  }

  return (
    <div className="moves-layout">
      <button
        className={`moves-sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
        aria-label="Close locations sidebar"
      />

      <aside
        className={`moves-sidebar ${mobileSidebarOpen ? 'open' : ''}`}
        aria-label="Locations by region"
      >
        <div className="moves-sidebar-head">
          <button
            className="moves-sidebar-title moves-sidebar-title-btn"
            onClick={() => {
              onNavigateLocationsHome()
              onCloseSidebar()
            }}
          >
            Locations
          </button>
          <button
            className="moves-sidebar-close"
            onClick={onCloseSidebar}
            aria-label="Close locations sidebar"
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
          placeholder="Search locations..."
          value={locationFilter}
          onChange={(e) => onLocationFilterChange(e.target.value)}
        />
        {loading && <p className="muted">Loading...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && sidebarGroupedRoutes.length === 0 && (
          <p className="muted">No locations found.</p>
        )}
        <div className="moves-sidebar-scroll">
          {sidebarGroupedRoutes.map((group) => {
            const isOpen =
              isFilteringLocations || openRegionSections[group.region] === true

            return (
              <section className="moves-sidebar-type" key={group.region}>
                <button
                  className={`moves-sidebar-type-toggle locations-sidebar-region-toggle locations-sidebar-region-toggle-${group.region}`}
                  onClick={() => toggleRegionSection(group.region)}
                  aria-expanded={isOpen}
                >
                  <span className="moves-sidebar-type-label">
                    {formatName(group.region)}
                  </span>
                  <span className="moves-sidebar-caret" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                </button>
                {isOpen && (
                  <ul className="moves-sidebar-move-list">
                    {group.routes.map((route) => (
                      <li key={`${route.region}/${route.route}`}>
                        <button
                          className="moves-sidebar-move-btn"
                          onClick={() => {
                            onOpenLocation(route.region, route.route)
                            onCloseSidebar()
                          }}
                        >
                          {formatLocation(route.route)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </aside>

      <main className="moves-page">{children}</main>
    </div>
  )
}
