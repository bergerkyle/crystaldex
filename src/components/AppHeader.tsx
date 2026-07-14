import { useLayoutEffect, useRef } from 'react'

interface AppHeaderProps {
  active: 'pokedex' | 'moves' | 'locations' | 'about'
  onNavigateHome: () => void
  onNavigatePokedex: () => void
  onNavigateMoves: () => void
  onNavigateLocations: () => void
  onNavigateAbout: () => void
  mobileSidebarOpen?: boolean
  onToggleSidebar?: () => void
}

interface NavItem {
  key: 'pokedex' | 'moves' | 'locations' | 'about'
  label: string
  onClick: () => void
}

export function AppHeader({
  active,
  onNavigateHome,
  onNavigatePokedex,
  onNavigateMoves,
  onNavigateLocations,
  onNavigateAbout,
  mobileSidebarOpen,
  onToggleSidebar,
}: AppHeaderProps) {
  const headerRef = useRef<HTMLElement>(null)
  const navItems: NavItem[] = [
    { key: 'pokedex', label: 'Pokédex', onClick: onNavigatePokedex },
    { key: 'moves', label: 'Moves', onClick: onNavigateMoves },
    { key: 'locations', label: 'Locations', onClick: onNavigateLocations },
    { key: 'about', label: 'About', onClick: onNavigateAbout },
  ]
  const primaryNavItems = navItems.filter((item) => item.key !== 'about')
  const aboutNavItem = navItems.find((item) => item.key === 'about')

  useLayoutEffect(() => {
    const root = document.documentElement

    const updateHeaderHeight = () => {
      const height = headerRef.current?.offsetHeight ?? 0
      root.style.setProperty('--app-header-height', `${height}px`)
    }

    updateHeaderHeight()

    const observer = new ResizeObserver(updateHeaderHeight)
    if (headerRef.current) observer.observe(headerRef.current)

    void document.fonts?.ready.then(() => {
      updateHeaderHeight()
    })

    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-header-height')
    }
  }, [])

  return (
    <header className="app-header" ref={headerRef}>
      <div className="topbar">
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
            </span>
          </button>
        )}
        <button
          className="brand"
          onClick={onNavigateHome}
          aria-label="Go to Pokédex home"
        >
          <img
            className="brand-crystal"
            src="/crystal.png"
            alt=""
            aria-hidden="true"
          />
          DEX
        </button>
        <nav className="topnav" aria-label="Primary">
          {primaryNavItems.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? 'active' : ''}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
          {aboutNavItem && (
            <button
              className={
                active === aboutNavItem.key
                  ? 'active topnav-about-inline'
                  : 'topnav-about-inline'
              }
              onClick={aboutNavItem.onClick}
            >
              {aboutNavItem.label}
            </button>
          )}
        </nav>
      </div>
      {aboutNavItem && (
        <nav className="topnav-about-row" aria-label="About">
          <button
            className={active === aboutNavItem.key ? 'active' : ''}
            onClick={aboutNavItem.onClick}
          >
            {aboutNavItem.label}
          </button>
        </nav>
      )}
    </header>
  )
}
