interface AppHeaderProps {
  active: 'pokedex' | 'moves' | 'about'
  onNavigateHome: () => void
  onNavigatePokedex: () => void
  onNavigateMoves: () => void
  onNavigateAbout: () => void
  mobileSidebarOpen?: boolean
  onToggleSidebar?: () => void
}

export function AppHeader({
  active,
  onNavigateHome,
  onNavigatePokedex,
  onNavigateMoves,
  onNavigateAbout,
  mobileSidebarOpen,
  onToggleSidebar,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      {onToggleSidebar && (
        <button
          className="mobile-nav-launcher"
          onClick={onToggleSidebar}
          aria-label={
            mobileSidebarOpen
              ? `Close ${active === 'moves' ? 'moves' : 'Pokédex'} sidebar`
              : `Open ${active === 'moves' ? 'moves' : 'Pokédex'} sidebar`
          }
        >
          <span className="mobile-nav-launcher-icon" aria-hidden="true">
            <span className="mobile-nav-launcher-line" />
            <span className="mobile-nav-launcher-line" />
            <span className="mobile-nav-launcher-line" />
          </span>
        </button>
      )}
      <button className="brand" onClick={onNavigateHome} aria-label="Go to Pokédex home">
        <img className="brand-crystal" src="/crystal.png" alt="" aria-hidden="true" />
        CRYSTAL DEX
      </button>
      <nav className="topnav">
        <button
          className={active === 'pokedex' ? 'active' : ''}
          onClick={onNavigatePokedex}
        >
          Pokédex
        </button>
        <button
          className={active === 'moves' ? 'active' : ''}
          onClick={onNavigateMoves}
        >
          Moves
        </button>
        <button
          className={active === 'about' ? 'active' : ''}
          onClick={onNavigateAbout}
        >
          About
        </button>
      </nav>
    </header>
  )
}
