import { useEffect, useRef, useState } from 'react'
import { type MoveCatalogItem } from '../pokemon'

interface MoveAutocompleteProps {
  moveList: MoveCatalogItem[]
  onSelectMove: (key: string) => void
}

export function MoveAutocomplete({
  moveList,
  onSelectMove,
}: MoveAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim().toLowerCase()
  const suggestions = trimmed
    ? moveList.filter((m) => m.name.toLowerCase().startsWith(trimmed))
    : []

  const handleSelect = (key: string) => {
    onSelectMove(key)
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
    <div className="move-autocomplete" ref={containerRef}>
      <input
        className="search move-autocomplete-input"
        type="text"
        placeholder="Search moves..."
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
        aria-label="Search for a move"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
      />
      {open && suggestions.length > 0 && (
        <ul className="move-autocomplete-dropdown" role="listbox">
          {suggestions.map((m) => (
            <li key={m.key} role="option">
              <button
                className="move-autocomplete-option"
                onPointerDown={(e) => {
                  // Prevent the input blur from closing the dropdown before click fires
                  e.preventDefault()
                }}
                onClick={() => handleSelect(m.key)}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
