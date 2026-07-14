import { useEffect, useRef, useState } from 'react'
import { formatName, type PokemonListItem } from '../pokemon'

interface PokemonAutocompleteProps {
  list: PokemonListItem[]
  allNames: Set<string>
  onSelectPokemon: (name: string) => void
}

export function PokemonAutocomplete({
  list,
  allNames,
  onSelectPokemon,
}: PokemonAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim().toLowerCase()
  const suggestions = trimmed
    ? list
        .filter((p) => p.name.toLowerCase().startsWith(trimmed))
        .slice(0, 5)
    : []

  const handleSelect = (name: string) => {
    onSelectPokemon(name.toLowerCase())
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
    }
  }

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  return (
    <div className="pokemon-autocomplete" ref={containerRef}>
      <input
        className="search pokemon-autocomplete-input"
        type="text"
        placeholder="Search Pokémon..."
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
        aria-label="Search for a Pokémon"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
      />
      {open && suggestions.length > 0 && (
        <ul className="pokemon-autocomplete-dropdown" role="listbox">
          {suggestions.map((p) => (
            <li key={`${p.region}/${p.name}`} role="option">
              <button
                className="pokemon-autocomplete-option"
                onPointerDown={(e) => {
                  // Prevent the input blur from closing the dropdown before click fires
                  e.preventDefault()
                }}
                onClick={() => handleSelect(p.name)}
              >
                {formatName(p.name, p.region, allNames)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
