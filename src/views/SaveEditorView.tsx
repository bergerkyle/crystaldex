import { useEffect, useMemo, useRef, useState } from 'react'
import { MoveAutocomplete } from '../components/MoveAutocomplete'
import {
  formatConstant,
  formatName,
  moveAccuracy,
  type ItemListItem,
  type MoveCatalogItem,
  type PokemonListItem,
} from '../pokemon'
import {
  MAX_EV,
  NUM_MOVES,
  parseSave,
  writeSave,
  type PartyMon,
  type SaveFile,
} from '../saveFile'
import { AnimatedFrontSprite } from '../PokemonSprite'
import { CategoryMetaChip, TypeMetaChip } from './moveMeta'

interface SaveConstants {
  species: Record<number, string>
  moves: Record<number, string>
  items: Record<number, string>
}

interface SaveEditorViewProps {
  pokemonList: PokemonListItem[]
  moveList: MoveCatalogItem[]
  itemList: ItemListItem[]
}

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '')

function invert(map: Record<number, string>): Map<string, number> {
  return new Map(
    Object.entries(map).map(([index, key]) => [key, Number(index)]),
  )
}

function ItemAutocomplete({
  items,
  onSelect,
}: {
  items: ItemListItem[]
  onSelect: (key: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trimmed = query.trim().toLowerCase()
  const suggestions = trimmed
    ? items.filter((i) => i.name.toLowerCase().includes(trimmed)).slice(0, 50)
    : []

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  return (
    <div className="move-autocomplete save-autocomplete" ref={ref}>
      <input
        className="search move-autocomplete-input"
        type="text"
        placeholder="Search items..."
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('')
            setOpen(false)
          }
        }}
        aria-label="Search for an item"
      />
      {open && suggestions.length > 0 && (
        <ul className="move-autocomplete-dropdown" role="listbox">
          {suggestions.map((i) => (
            <li key={i.key} role="option">
              <button
                className="move-autocomplete-option"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(i.key)
                  setQuery('')
                  setOpen(false)
                }}
              >
                {i.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SaveEditorView({
  pokemonList,
  moveList,
  itemList,
}: SaveEditorViewProps) {
  const [constants, setConstants] = useState<SaveConstants | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [save, setSave] = useState<SaveFile | null>(null)
  const [party, setParty] = useState<PartyMon[]>([])
  const [fileName, setFileName] = useState('save.sav')

  useEffect(() => {
    fetch('/api/save-constants')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load constants (${res.status})`)
        return res.json() as Promise<SaveConstants>
      })
      .then(setConstants)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Unknown error'),
      )
  }, [])

  const moveIndex = useMemo(
    () => (constants ? invert(constants.moves) : new Map<string, number>()),
    [constants],
  )
  const itemIndex = useMemo(
    () => (constants ? invert(constants.items) : new Map<string, number>()),
    [constants],
  )
  const moveByKey = useMemo(
    () => new Map(moveList.map((m) => [m.key, m])),
    [moveList],
  )
  const itemByKey = useMemo(
    () => new Map(itemList.map((i) => [i.key, i])),
    [itemList],
  )
  const selectableItems = useMemo(
    () => itemList.filter((i) => itemIndex.has(i.key)),
    [itemList, itemIndex],
  )
  const selectableMoves = useMemo(
    () => moveList.filter((m) => moveIndex.has(m.key)),
    [moveList, moveIndex],
  )
  const allNames = useMemo(
    () => new Set(pokemonList.map((p) => p.name.toLowerCase())),
    [pokemonList],
  )

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const parsed = parseSave(await file.arrayBuffer())
      setSave(parsed)
      setParty(parsed.party.map((m) => ({ ...m })))
      setFileName(file.name)
    } catch (err) {
      setSave(null)
      setParty([])
      setError(err instanceof Error ? err.message : 'Could not read save')
    }
  }

  const update = (i: number, patch: Partial<PartyMon>) =>
    setParty((prev) => prev.map((m, n) => (n === i ? { ...m, ...patch } : m)))

  const setMove = (i: number, slot: number, key: string) => {
    const index = moveIndex.get(key)
    const move = moveByKey.get(key)
    if (index === undefined || !move) return
    const mon = party[i]
    update(i, {
      moves: mon.moves.map((m, s) => (s === slot ? index : m)),
      pp: mon.pp.map((p, s) => (s === slot ? move.pp : p)),
    })
  }

  const download = () => {
    if (!save) return
    try {
      const bytes = writeSave(save, party)
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write save')
    }
  }

  const ready = constants !== null

  return (
    <main className="about-page">
      <div className="about-content save-editor">
        <h1 className="about-title">Save Editor</h1>
        <p className="about-description">
          Upload your <code>.sav</code> file, edit your party, then download the
          modified save. Keep a backup of your original file.
        </p>
        <input
          type="file"
          accept=".sav,.srm,.gbc,application/octet-stream"
          disabled={!ready}
          onChange={(e) => void onFile(e.target.files?.[0])}
          aria-label="Upload save file"
        />
        {!ready && !error && <p>Loading game data…</p>}
        {error && <p className="error">{error}</p>}

        {save && constants && (
          <>
            <ul className="save-party">
              {party.map((mon, i) => {
                const key = constants.species[mon.species] ?? ''
                const entry = pokemonList.find(
                  (p) => normalizeKey(p.name) === normalizeKey(key),
                )
                const name = entry
                  ? formatName(entry.name, entry.region, allNames)
                  : key
                    ? formatConstant(key)
                    : `Unknown (#${mon.species})`
                const item = itemByKey.get(constants.items[mon.item] ?? '')
                const maxed = mon.evs.every((ev) => ev === MAX_EV)
                return (
                  <li key={i}>
                    <details className="save-mon">
                      <summary>
                        <strong>{name}</strong>
                        <span className="meta-text"> Lv. {mon.level}</span>
                      </summary>
                      <div className="save-mon-body">
                        {entry && (
                          <AnimatedFrontSprite
                            front={entry.frontSprite}
                            ariaLabel={name}
                          />
                        )}
                        <p>Level {mon.level}</p>
                        <button
                          className="move-link"
                          disabled={maxed}
                          onClick={() =>
                            update(i, { evs: mon.evs.map(() => MAX_EV) })
                          }
                        >
                          {maxed ? 'EVs maxed' : `Set EVs to max (${MAX_EV})`}
                        </button>

                        <h3>Held item</h3>
                        <p>
                          {mon.item === 0
                            ? 'None'
                            : (item?.name ??
                              formatConstant(constants.items[mon.item] ?? '?'))}
                          {mon.item !== 0 && (
                            <>
                              {' '}
                              <button
                                className="move-link"
                                onClick={() => update(i, { item: 0 })}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </p>
                        <ItemAutocomplete
                          items={selectableItems}
                          onSelect={(k) =>
                            update(i, { item: itemIndex.get(k) ?? mon.item })
                          }
                        />

                        <h3>Moves</h3>
                        <ul className="move-list">
                          {Array.from({ length: NUM_MOVES }, (_, slot) => {
                            const moveKey = constants.moves[mon.moves[slot]]
                            const m = moveKey
                              ? moveByKey.get(moveKey)
                              : undefined
                            return (
                              <li key={slot} className="mb-2">
                                {m ? (
                                  <>
                                    <span className="move-level">
                                      {slot + 1}
                                    </span>
                                    <span className="mb-1">{m.name}</span>
                                    <span className="move-meta">
                                      <TypeMetaChip type={m.type} />
                                      <CategoryMetaChip category={m.category} />
                                      <span className="meta-text">
                                        Pow {m.power > 0 ? m.power : '-'}
                                      </span>
                                      <span className="meta-text">
                                        Acc{' '}
                                        {moveAccuracy(m) > 0
                                          ? moveAccuracy(m)
                                          : '-'}
                                      </span>
                                      <span className="meta-text">
                                        PP {m.pp}
                                      </span>
                                    </span>
                                  </>
                                ) : (
                                  <span className="move-level">
                                    {slot + 1} — empty
                                  </span>
                                )}
                                <MoveAutocomplete
                                  moveList={selectableMoves}
                                  onSelectMove={(k) => setMove(i, slot, k)}
                                />
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
            <button className="move-link" onClick={download}>
              Download save
            </button>
          </>
        )}
      </div>
    </main>
  )
}
