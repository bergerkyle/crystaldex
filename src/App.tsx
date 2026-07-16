import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { AboutView } from './views/AboutView'
import { LocationDetailView } from './views/LocationDetailView'
import { LocationsLayout } from './views/LocationsLayout'
import { LocationsView } from './views/LocationsView'
import { MoveDetailView } from './views/MoveDetailView'
import { MovesView } from './views/MovesView'
import { PokedexView } from './views/PokedexView'
import { SaveView } from './views/SaveView.tsx'
import {
  type MoveCatalogItem,
  type PokemonDetail,
  type PokemonListItem,
  type RouteEncounter,
} from './pokemon'

type Route =
  | { view: 'pokedex'; pokemon?: string }
  | { view: 'moves' }
  | { view: 'move'; key: string }
  | { view: 'locations' }
  | { view: 'location'; region: string; route: string }
  | { view: 'save' }
  | { view: 'about' }

const SAVE_VIEW_PASSWORD = 'aaroniscool'

function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search)
  const pokemonFromQuery = params.get('pokemon')?.trim()
  const moveFromQuery = params.get('move')?.trim()

  if (pathname.startsWith('/moves/')) {
    const key = decodeURIComponent(pathname.slice('/moves/'.length))
      .trim()
      .toUpperCase()
    if (key) return { view: 'move', key }
  }
  if (pathname === '/moves') {
    if (moveFromQuery) return { view: 'move', key: moveFromQuery.toUpperCase() }
    return { view: 'moves' }
  }
  if (pathname.startsWith('/locations/')) {
    const parts = pathname
      .slice('/locations/'.length)
      .split('/')
      .map((part) => decodeURIComponent(part).trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      return {
        view: 'location',
        region: parts[0].toLowerCase(),
        route: parts.slice(1).join('/').toUpperCase(),
      }
    }
  }
  if (pathname === '/locations' || pathname === '/encounters') {
    return { view: 'locations' }
  }
  if (pathname === '/save') {
    const password = params.get('password')?.trim()
    if (password === SAVE_VIEW_PASSWORD) return { view: 'save' }
    return { view: 'pokedex' }
  }

  if (pathname.startsWith('/pokedex/')) {
    const pokemon = decodeURIComponent(pathname.slice('/pokedex/'.length))
      .trim()
      .toLowerCase()
    if (pokemon) return { view: 'pokedex', pokemon }
  }
  if (pathname === '/pokedex' && pokemonFromQuery) {
    return { view: 'pokedex', pokemon: pokemonFromQuery.toLowerCase() }
  }

  if (moveFromQuery) return { view: 'move', key: moveFromQuery.toUpperCase() }
  if (pokemonFromQuery)
    return { view: 'pokedex', pokemon: pokemonFromQuery.toLowerCase() }

  return { view: 'pokedex' }
}

function routePath(route: Route): string {
  if (route.view === 'about') return '/about'
  if (route.view === 'locations') return '/locations'
  if (route.view === 'save') return '/save'
  if (route.view === 'location') {
    return `/locations/${encodeURIComponent(route.region.toLowerCase())}/${encodeURIComponent(route.route.toUpperCase())}`
  }
  if (route.view === 'moves') return '/moves'
  if (route.view === 'move')
    return `/moves/${encodeURIComponent(route.key.toUpperCase())}`
  if (route.pokemon)
    return `/pokedex/${encodeURIComponent(route.pokemon.toUpperCase())}`
  return '/pokedex'
}

export default function App() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  )

  const [list, setList] = useState<PokemonListItem[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [filter, setFilter] = useState('')
  const [mobilePokedexSidebarOpen, setMobilePokedexSidebarOpen] =
    useState(false)

  const [detail, setDetail] = useState<PokemonDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [moveList, setMoveList] = useState<MoveCatalogItem[]>([])
  const [moveListError, setMoveListError] = useState<string | null>(null)
  const [loadingMoveList, setLoadingMoveList] = useState(true)
  const [moveFilter, setMoveFilter] = useState('')
  const [mobileMovesSidebarOpen, setMobileMovesSidebarOpen] = useState(false)

  const [moveDetail, setMoveDetail] = useState<MoveCatalogItem | null>(null)
  const [moveDetailError, setMoveDetailError] = useState<string | null>(null)
  const [loadingMoveDetail, setLoadingMoveDetail] = useState(false)

  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [aboutVersion, setAboutVersion] = useState<string>('0.0.0')
  const [loadingAbout, setLoadingAbout] = useState(false)
  const [encounterRoutes, setEncounterRoutes] = useState<RouteEncounter[]>([])
  const [encounterRoutesError, setEncounterRoutesError] = useState<
    string | null
  >(null)
  const [loadingEncounterRoutes, setLoadingEncounterRoutes] = useState(false)
  const [locationFilter, setLocationFilter] = useState('')
  const [mobileLocationsSidebarOpen, setMobileLocationsSidebarOpen] =
    useState(false)

  useEffect(() => {
    const onPopState = () =>
      setRoute(parseRoute(window.location.pathname, window.location.search))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (nextRoute: Route) => {
    const path = routePath(nextRoute)
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    setRoute(nextRoute)
  }

  useEffect(() => {
    if (window.location.pathname !== '/save') return
    const password = new URLSearchParams(window.location.search)
      .get('password')
      ?.trim()
    if (password === SAVE_VIEW_PASSWORD) return

    window.history.replaceState({}, '', '/pokedex')
    setRoute({ view: 'pokedex' })
  }, [route.view])

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
    fetch('/api/moves')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load moves (${res.status})`)
        return res.json() as Promise<MoveCatalogItem[]>
      })
      .then(setMoveList)
      .catch((err: unknown) =>
        setMoveListError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoadingMoveList(false))
  }, [])

  const selected = route.view === 'pokedex' ? (route.pokemon ?? null) : null

  useEffect(() => {
    if (route.view !== 'pokedex') {
      setMobilePokedexSidebarOpen(false)
    }
  }, [route.view])

  useEffect(() => {
    if (route.view !== 'moves' && route.view !== 'move') {
      setMobileMovesSidebarOpen(false)
    }
  }, [route.view])

  useEffect(() => {
    if (route.view !== 'locations' && route.view !== 'location') {
      setMobileLocationsSidebarOpen(false)
    }
  }, [route.view])

  useEffect(() => {
    if (route.view !== 'pokedex' || !selected) return
    setLoadingDetail(true)
    setDetailError(null)
    setDetail(null)
    fetch(`/api/pokemon/${encodeURIComponent(selected)}`)
      .then((res) => {
        if (!res.ok)
          throw new Error(`Failed to load ${selected} (${res.status})`)
        return res.json() as Promise<PokemonDetail>
      })
      .then(setDetail)
      .catch((err: unknown) =>
        setDetailError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoadingDetail(false))
  }, [selected, route.view])

  useEffect(() => {
    if (route.view !== 'move') return
    setLoadingMoveDetail(true)
    setMoveDetailError(null)
    setMoveDetail(null)

    fetch(`/api/moves/${encodeURIComponent(route.key)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load move (${res.status})`)
        return res.json() as Promise<MoveCatalogItem>
      })
      .then(setMoveDetail)
      .catch((err: unknown) =>
        setMoveDetailError(
          err instanceof Error ? err.message : 'Unknown error',
        ),
      )
      .finally(() => setLoadingMoveDetail(false))
  }, [route])

  useEffect(() => {
    if (route.view !== 'about') return
    setLoadingAbout(true)
    fetch('/api/about')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load about (${res.status})`)
        return res.json() as Promise<{
          version: string
          lastSynced: string | null
        }>
      })
      .then((data) => {
        setAboutVersion(data.version)
        setLastSynced(data.lastSynced)
      })
      .catch(() => {
        setAboutVersion('0.0.0')
        setLastSynced(null)
      })
      .finally(() => setLoadingAbout(false))
  }, [route.view])

  useEffect(() => {
    if (
      (route.view !== 'locations' && route.view !== 'location') ||
      encounterRoutes.length > 0 ||
      loadingEncounterRoutes
    )
      return
    setLoadingEncounterRoutes(true)
    setEncounterRoutesError(null)
    fetch('/api/encounters/routes')
      .then((res) => {
        if (!res.ok)
          throw new Error(`Failed to load encounters (${res.status})`)
        return res.json() as Promise<RouteEncounter[]>
      })
      .then(setEncounterRoutes)
      .catch((err: unknown) =>
        setEncounterRoutesError(
          err instanceof Error ? err.message : 'Unknown error',
        ),
      )
      .finally(() => setLoadingEncounterRoutes(false))
  }, [route.view, encounterRoutes.length, loadingEncounterRoutes])

  const allNames = useMemo(
    () => new Set(list.map((p) => p.name.toLowerCase())),
    [list],
  )

  const filteredLocationRoutes = useMemo(() => {
    const query = locationFilter.trim().toLowerCase()
    if (!query) return encounterRoutes
    return encounterRoutes.filter((route) => {
      const location = route.route.toLowerCase()
      const formattedLocation = route.route.toLowerCase().replace(/_/g, ' ')
      const region = route.region.toLowerCase()
      return (
        location.includes(query) ||
        formattedLocation.includes(query) ||
        region.includes(query)
      )
    })
  }, [encounterRoutes, locationFilter])

  return (
    <div className="app-shell">
      <AppHeader
        active={
          route.view === 'pokedex'
            ? 'pokedex'
            : route.view === 'about'
              ? 'about'
              : route.view === 'locations' || route.view === 'location'
                  ? 'locations'
                  : 'moves'
        }
        onNavigateHome={() => navigate({ view: 'pokedex' })}
        onNavigatePokedex={() => navigate({ view: 'pokedex' })}
        onNavigateMoves={() => navigate({ view: 'moves' })}
        onNavigateLocations={() => navigate({ view: 'locations' })}
        onNavigateAbout={() => navigate({ view: 'about' })}
        mobileSidebarOpen={
          route.view === 'pokedex'
            ? mobilePokedexSidebarOpen
            : route.view === 'moves' || route.view === 'move'
              ? mobileMovesSidebarOpen
              : route.view === 'locations' || route.view === 'location'
                ? mobileLocationsSidebarOpen
                : undefined
        }
        onToggleSidebar={
          route.view === 'pokedex'
            ? () => {
                setMobilePokedexSidebarOpen((isOpen) => !isOpen)
              }
            : route.view === 'moves' || route.view === 'move'
              ? () => {
                  setMobileMovesSidebarOpen((isOpen) => !isOpen)
                }
              : route.view === 'locations' || route.view === 'location'
                ? () => {
                    setMobileLocationsSidebarOpen((isOpen) => !isOpen)
                  }
                : undefined
        }
      />

      {route.view === 'pokedex' && (
        <PokedexView
          list={list}
          listError={listError}
          loadingList={loadingList}
          filter={filter}
          selected={selected}
          detail={detail}
          detailError={detailError}
          loadingDetail={loadingDetail}
          allNames={allNames}
          onFilterChange={setFilter}
          onNavigatePokedexHome={() => navigate({ view: 'pokedex' })}
          onSelectPokemon={(name) =>
            navigate({ view: 'pokedex', pokemon: name })
          }
          onOpenMove={(key) => navigate({ view: 'move', key })}
          onOpenLocation={(region, routeName) =>
            navigate({ view: 'location', region, route: routeName })
          }
          mobileSidebarOpen={mobilePokedexSidebarOpen}
          onCloseSidebar={() => setMobilePokedexSidebarOpen(false)}
        />
      )}

      {route.view === 'moves' && (
        <MovesView
          moveList={moveList}
          moveListError={moveListError}
          loadingMoveList={loadingMoveList}
          moveFilter={moveFilter}
          onMoveFilterChange={setMoveFilter}
          onNavigateMovesHome={() => navigate({ view: 'moves' })}
          onOpenMove={(key) => navigate({ view: 'move', key })}
          mobileSidebarOpen={mobileMovesSidebarOpen}
          onCloseSidebar={() => setMobileMovesSidebarOpen(false)}
        />
      )}

      {route.view === 'move' && (
        <MovesView
          moveList={moveList}
          moveListError={moveListError}
          loadingMoveList={loadingMoveList}
          moveFilter={moveFilter}
          onMoveFilterChange={setMoveFilter}
          onNavigateMovesHome={() => navigate({ view: 'moves' })}
          onOpenMove={(key) => navigate({ view: 'move', key })}
          mobileSidebarOpen={mobileMovesSidebarOpen}
          onCloseSidebar={() => setMobileMovesSidebarOpen(false)}
        >
          <MoveDetailView
            moveDetail={moveDetail}
            moveDetailError={moveDetailError}
            loadingMoveDetail={loadingMoveDetail}
            moveList={moveList}
            onOpenMove={(key) => navigate({ view: 'move', key })}
          />
        </MovesView>
      )}
      {route.view === 'about' && (
        <AboutView
          version={aboutVersion}
          lastSynced={lastSynced}
          loadingAbout={loadingAbout}
        />
      )}
      {route.view === 'save' && <SaveView />}
      {(route.view === 'locations' || route.view === 'location') && (
        <LocationsLayout
          routes={filteredLocationRoutes}
          loading={loadingEncounterRoutes}
          error={encounterRoutesError}
          locationFilter={locationFilter}
          onLocationFilterChange={setLocationFilter}
          onOpenLocation={(region, routeName) =>
            navigate({ view: 'location', region, route: routeName })
          }
          onNavigateLocationsHome={() => navigate({ view: 'locations' })}
          mobileSidebarOpen={mobileLocationsSidebarOpen}
          onCloseSidebar={() => setMobileLocationsSidebarOpen(false)}
        >
          {route.view === 'locations' ? (
            <LocationsView
              routes={filteredLocationRoutes}
              loading={loadingEncounterRoutes}
              error={encounterRoutesError}
              allRoutes={encounterRoutes}
              onOpenLocation={(region, routeName) =>
                navigate({ view: 'location', region, route: routeName })
              }
            />
          ) : (
            <LocationDetailView
              routeDetail={
                encounterRoutes.find(
                  (routeEntry) =>
                    routeEntry.region.toLowerCase() ===
                      route.region.toLowerCase() &&
                    routeEntry.route.toUpperCase() ===
                      route.route.toUpperCase(),
                ) ?? null
              }
              allRoutes={encounterRoutes}
              loading={loadingEncounterRoutes}
              error={encounterRoutesError}
              allNames={allNames}
              onBack={() => navigate({ view: 'locations' })}
              onOpenLocation={(region, routeName) =>
                navigate({ view: 'location', region, route: routeName })
              }
              onSelectPokemon={(name: string) =>
                navigate({ view: 'pokedex', pokemon: name })
              }
            />
          )}
        </LocationsLayout>
      )}
    </div>
  )
}
