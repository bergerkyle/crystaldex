interface AppHeaderProps {
  active: 'pokedex' | 'moves'
  onNavigateHome: () => void
  onNavigatePokedex: () => void
  onNavigateMoves: () => void
  mobilePokedexSidebarOpen?: boolean
  onTogglePokedexSidebar?: () => void
}

export function AppHeader({
  active,
  onNavigateHome,
  onNavigatePokedex,
  onNavigateMoves,
  mobilePokedexSidebarOpen,
  onTogglePokedexSidebar,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      {active === 'pokedex' && onTogglePokedexSidebar && (
        <button
          className="mobile-nav-launcher"
          onClick={onTogglePokedexSidebar}
          aria-label={mobilePokedexSidebarOpen ? 'Close pokedex list' : 'Open pokedex list'}
        >
          <span className="mobile-nav-launcher-icon" aria-hidden="true">
            <span className="mobile-nav-launcher-line" />
            <span className="mobile-nav-launcher-line" />
            <span className="mobile-nav-launcher-line" />
          </span>
        </button>
      )}
      <button className="brand" onClick={onNavigateHome} aria-label="Go to pokedex home">
        CRYSTAL DEX
      </button>
      <nav className="topnav">
        <button
          className={active === 'pokedex' ? 'active' : ''}
          onClick={onNavigatePokedex}
        >
          Pokedex
        </button>
        <button
          className={active === 'moves' ? 'active' : ''}
          onClick={onNavigateMoves}
        >
          Moves
        </button>
      </nav>
    </header>
  )
}
