import { useEffect, useMemo, useRef, useState } from 'react'
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
  speciesAbilities: Record<string, (string | null)[]>
  abilities: Record<string, { name: string; description: string }>
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

interface PickerOption {
  key: string
  label: string
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

// Search dropdown that opens when the pencil is clicked and closes once an
// option is chosen (or on Escape / outside click).
function EditablePicker({
  options,
  onSelect,
  label,
  placeholder,
  showAll = false,
  children,
}: {
  options: PickerOption[]
  onSelect: (key: string) => void
  label: string
  placeholder: string
  showAll?: boolean
  children: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const trimmed = query.trim().toLowerCase()
  const suggestions = (
    trimmed
      ? options.filter((o) => o.label.toLowerCase().includes(trimmed))
      : showAll
        ? options
        : []
  ).slice(0, 50)

  const close = () => {
    setEditing(false)
    setQuery('')
  }

  useEffect(() => {
    if (!editing) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [editing])

  if (!editing) {
    return (
      <span className="save-editable">
        {children}
        <button
          className="save-edit-btn"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
          title={`Edit ${label}`}
        >
          <PencilIcon />
        </button>
      </span>
    )
  }

  return (
    <div className="move-autocomplete save-autocomplete" ref={ref}>
      <input
        className="search move-autocomplete-input"
        type="text"
        autoFocus
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
        aria-label={`Search for ${label}`}
      />
      {suggestions.length > 0 && (
        <ul className="move-autocomplete-dropdown" role="listbox">
          {suggestions.map((o) => (
            <li key={o.key} role="option">
              <button
                className="move-autocomplete-option"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(o.key)
                  close()
                }}
              >
                {o.label}
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
  const itemOptions = useMemo(
    () =>
      itemList
        .filter((i) => itemIndex.has(i.key))
        .map((i) => ({ key: i.key, label: i.name })),
    [itemList, itemIndex],
  )
  const moveOptions = useMemo(
    () =>
      moveList
        .filter((m) => moveIndex.has(m.key))
        .map((m) => ({ key: m.key, label: m.name })),
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

  // Unchecking restores the EVs from the uploaded file (zeroed if they were
  // already maxed there, so the checkbox can actually be cleared).
  const setMaxEvs = (i: number, checked: boolean) => {
    const original = save?.party[i].evs ?? []
    const originalMaxed = original.every((ev) => ev === MAX_EV)
    update(i, {
      evs: checked
        ? original.map(() => MAX_EV)
        : originalMaxed
          ? original.map(() => 0)
          : [...original],
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
                const itemName =
                  mon.item === 0
                    ? 'None'
                    : (item?.name ??
                      formatConstant(constants.items[mon.item] ?? '?'))
                const maxed = mon.evs.every((ev) => ev === MAX_EV)

                // A slot pointing at NO_ABILITY falls back to ability 1.
                const slots =
                  constants.speciesAbilities[normalizeKey(key)] ?? []
                const abilityOptions = [0, 1, 2]
                  .filter((slot) => slots[slot])
                  .map((slot) => ({
                    key: String(slot),
                    label: `${constants.abilities[slots[slot]!]?.name ?? formatConstant(slots[slot]!)}${slot === 2 ? ' (Hidden)' : ''}`,
                  }))
                const abilityKey = slots[mon.abilitySlot] ?? slots[0]
                const ability = abilityKey
                  ? constants.abilities[abilityKey]
                  : undefined

                return (
                  <li key={i}>
                    <details className="save-mon">
                      <summary>
                        <strong>{name}</strong>
                        <span className="meta-text"> Lv. {mon.level}</span>
                      </summary>
                      <div className="save-mon-body">
                        {entry && (
                          <div className="sprites">
                            <AnimatedFrontSprite
                              front={entry.frontSprite}
                              className="sprite sprite-front"
                              ariaLabel={name}
                              shinyPalette={entry.shinyPalette}
                            />
                          </div>
                        )}

                        <dl className="save-fields">
                          <dt>Level</dt>
                          <dd>{mon.level}</dd>

                          <dt>Ability</dt>
                          <dd>
                            {abilityOptions.length === 0 ? (
                              'None'
                            ) : (
                              <EditablePicker
                                options={abilityOptions}
                                showAll
                                label="ability"
                                placeholder="Search abilities..."
                                onSelect={(k) =>
                                  update(i, { abilitySlot: Number(k) })
                                }
                              >
                                <span>
                                  <strong>
                                    {ability?.name ??
                                      (abilityKey
                                        ? formatConstant(abilityKey)
                                        : 'None')}
                                  </strong>
                                  {mon.abilitySlot === 2 && (
                                    <span className="ability-hidden-tag">
                                      Hidden
                                    </span>
                                  )}
                                  {ability?.description && (
                                    <span className="meta-text save-desc">
                                      {ability.description}
                                    </span>
                                  )}
                                </span>
                              </EditablePicker>
                            )}
                          </dd>

                          <dt>Held item</dt>
                          <dd>
                            <EditablePicker
                              options={itemOptions}
                              label="held item"
                              placeholder="Search items..."
                              onSelect={(k) =>
                                update(i, {
                                  item: itemIndex.get(k) ?? mon.item,
                                })
                              }
                            >
                              <strong>{itemName}</strong>
                            </EditablePicker>
                          </dd>

                          <dt>EVs</dt>
                          <dd>
                            <label className="shiny-toggle">
                              <input
                                type="checkbox"
                                checked={maxed}
                                onChange={(e) => setMaxEvs(i, e.target.checked)}
                              />
                              <span>Max EVs ({MAX_EV} in every stat)</span>
                            </label>
                          </dd>
                        </dl>

                        <h3>Moves</h3>
                        <ul className="move-list">
                          {Array.from({ length: NUM_MOVES }, (_, slot) => {
                            const moveKey = constants.moves[mon.moves[slot]]
                            const m = moveKey
                              ? moveByKey.get(moveKey)
                              : undefined
                            return (
                              <li key={slot} className="mb-2">
                                <EditablePicker
                                  options={moveOptions}
                                  label={`move ${slot + 1}`}
                                  placeholder="Search moves..."
                                  onSelect={(k) => setMove(i, slot, k)}
                                >
                                  <span className="move-link">
                                    {m
                                      ? m.name
                                      : moveKey
                                        ? formatConstant(moveKey)
                                        : '— empty —'}
                                  </span>
                                </EditablePicker>
                                {m && (
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
                                    <span className="meta-text">PP {m.pp}</span>
                                  </span>
                                )}
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
