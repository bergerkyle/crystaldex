import { useEffect, useRef, useState } from 'react'
import { formatLocation, formatName, type RouteEncounter } from '../pokemon'

interface LocationAutocompleteProps {
  routes: RouteEncounter[]
  onSelectLocation: (region: string, route: string) => void
}

export function LocationAutocomplete({
  routes,
  onSelectLocation,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim().toLowerCase()
  const suggestions = trimmed
    ? routes.filter((route) => {
        const location = formatLocation(route.route).toLowerCase()
        const region = formatName(route.region).toLowerCase()
        return location.startsWith(trimmed) || region.startsWith(trimmed)
      })
    : []

  const handleSelect = (region: string, route: string) => {
    onSelectLocation(region, route)
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
    }
  }

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  return (
    <div className="location-autocomplete" ref={containerRef}>
      <input
        className="search location-autocomplete-input"
        type="text"
        placeholder="Search locations..."
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (trimmed) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        aria-label="Search for a location"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
      />
      {open && suggestions.length > 0 && (
        <ul className="location-autocomplete-dropdown" role="listbox">
          {suggestions.map((route) => (
            <li key={`${route.region}/${route.route}`} role="option">
              <button
                className="location-autocomplete-option"
                onPointerDown={(e) => {
                  e.preventDefault()
                }}
                onClick={() => handleSelect(route.region, route.route)}
              >
                {formatLocation(route.route)}
                <span className="location-autocomplete-region">
                  {' '}
                  ({formatName(route.region)})
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
