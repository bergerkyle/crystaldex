import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { AboutView } from './views/AboutView'
import { MoveDetailView } from './views/MoveDetailView'
import { MovesView } from './views/MovesView'
import { PokedexView } from './views/PokedexView'
import { type MoveCatalogItem, type PokemonDetail, type PokemonListItem } from './pokemon'

type Route =
  | { view: 'pokedex'; pokemon?: string }
  | { view: 'moves' }
  | { view: 'move'; key: string }
  | { view: 'about' }

function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search)
  const pokemonFromQuery = params.get('pokemon')?.trim()
  const moveFromQuery = params.get('move')?.trim()

  if (pathname.startsWith('/moves/')) {
    const key = decodeURIComponent(pathname.slice('/moves/'.length)).trim().toUpperCase()
    if (key) return { view: 'move', key }
  }
  if (pathname === '/moves') {
    if (moveFromQuery) return { view: 'move', key: moveFromQuery.toUpperCase() }
    return { view: 'moves' }
  }

  if (pathname.startsWith('/pokedex/')) {
    const pokemon = decodeURIComponent(pathname.slice('/pokedex/'.length)).trim().toLowerCase()
    if (pokemon) return { view: 'pokedex', pokemon }
  }
  if (pathname === '/pokedex' && pokemonFromQuery) {
    return { view: 'pokedex', pokemon: pokemonFromQuery.toLowerCase() }
  }

  if (moveFromQuery) return { view: 'move', key: moveFromQuery.toUpperCase() }
  if (pokemonFromQuery) return { view: 'pokedex', pokemon: pokemonFromQuery.toLowerCase() }

  return { view: 'pokedex' }
}

function routePath(route: Route): string {
  if (route.view === 'about') return '/about'
  if (route.view === 'moves') return '/moves'
  if (route.view === 'move') return `/moves/${encodeURIComponent(route.key.toUpperCase())}`
  if (route.pokemon) return `/pokedex/${encodeURIComponent(route.pokemon.toUpperCase())}`
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
  const [mobilePokedexSidebarOpen, setMobilePokedexSidebarOpen] = useState(false)

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

  const selected = route.view === 'pokedex' ? route.pokemon ?? null : null

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
    if (route.view !== 'pokedex' || !selected) return
    setLoadingDetail(true)
    setDetailError(null)
    setDetail(null)
    fetch(`/api/pokemon/${encodeURIComponent(selected)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${selected} (${res.status})`)
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
        setMoveDetailError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoadingMoveDetail(false))
  }, [route])

  useEffect(() => {
    if (route.view !== 'about') return
    setLoadingAbout(true)
    fetch('/api/about')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load about (${res.status})`)
        return res.json() as Promise<{ version: string; lastSynced: string | null }>
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

  const allNames = useMemo(
    () => new Set(list.map((p) => p.name.toLowerCase())),
    [list],
  )

  return (
    <div className="app-shell">
      <AppHeader
        active={route.view === 'pokedex' ? 'pokedex' : route.view === 'about' ? 'about' : 'moves'}
        onNavigateHome={() => navigate({ view: 'pokedex' })}
        onNavigatePokedex={() => navigate({ view: 'pokedex' })}
        onNavigateMoves={() => navigate({ view: 'moves' })}
        onNavigateAbout={() => navigate({ view: 'about' })}
        mobileSidebarOpen={
          route.view === 'pokedex' ? mobilePokedexSidebarOpen : mobileMovesSidebarOpen
        }
        onToggleSidebar={route.view === 'about' ? undefined : () => {
          if (route.view === 'pokedex') {
            setMobilePokedexSidebarOpen((isOpen) => !isOpen)
          } else {
            setMobileMovesSidebarOpen((isOpen) => !isOpen)
          }
        }}
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
          onSelectPokemon={(name) => navigate({ view: 'pokedex', pokemon: name })}
          onOpenMove={(key) => navigate({ view: 'move', key })}
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
        <AboutView version={aboutVersion} lastSynced={lastSynced} loadingAbout={loadingAbout} />
      )}
    </div>
  )
}
