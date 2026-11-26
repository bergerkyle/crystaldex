import { fetchAbilityCatalog, fetchRaw, normalizeKey } from './parser.js'

// Numeric ids of the upstream species/move/item constants. Saves store these
// as 16-bit indexes, so the save editor needs them to translate to names.
export interface SaveConstants {
  species: Record<number, string>
  moves: Record<number, string>
  items: Record<number, string>
  // normalizeKey(species constant) -> [ability 1, ability 2, hidden] keys
  speciesAbilities: Record<string, (string | null)[]>
  abilities: Record<string, { name: string; description: string }>
}

// Walks `const_def` / `const` / `const_skip` / `const_next` lines the way
// rgbasm would, stopping at the line matching `stop`.
export function parseConstantIndexes(
  source: string,
  stop: RegExp,
): Record<number, string> {
  const out: Record<number, string> = {}
  let started = false
  let value = 0
  let inc = 1
  for (const line of source.split('\n')) {
    const code = line.split(';')[0]
    if (!started) {
      const def = code.match(/^\s*const_def\b\s*(-?\w+)?\s*(?:,\s*(-?\w+))?/)
      if (def) {
        started = true
        value = def[1] ? Number(def[1]) : 0
        inc = def[2] ? Number(def[2]) : 1
      }
      continue
    }
    if (stop.test(code)) break
    let m = code.match(/^\s*const\s+([A-Za-z0-9_]+)/)
    if (m) {
      out[value] = m[1]
      value += inc
      continue
    }
    m = code.match(/^\s*const_skip\b\s*(\d+)?/)
    if (m) {
      value += inc * (m[1] ? Number(m[1]) : 1)
      continue
    }
    m = code.match(/^\s*const_next\s+(\d+)/)
    if (m) {
      value = Number(m[1])
      continue
    }
    m = code.match(/^\s*const_align\s+(\d+)/)
    if (m) {
      const unit = 1 << Number(m[1])
      value = Math.ceil(value / unit) * unit
    }
  }
  return out
}

const TTL_MS = 60 * 60 * 1000
let cache: { at: number; value: SaveConstants } | null = null

export async function fetchSaveConstants(): Promise<SaveConstants> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const [pokemon, moves, items, abilityCatalog] = await Promise.all([
    fetchRaw('constants/pokemon_constants.asm'),
    fetchRaw('constants/move_constants.asm'),
    fetchRaw('constants/item_constants.asm'),
    fetchAbilityCatalog(),
  ])
  const value: SaveConstants = {
    species: parseConstantIndexes(pokemon, /^\s*DEF\s+NUM_POKEMON\b/),
    moves: parseConstantIndexes(moves, /^\s*DEF\s+NUM_ATTACKS\b/),
    items: parseConstantIndexes(items, /^\s*DEF\s+NUM_ITEMS\b/),
    speciesAbilities: Object.fromEntries(
      [...abilityCatalog.speciesAbilities].map(([species, a]) => [
        normalizeKey(species),
        [a.ability1, a.ability2, a.hidden],
      ]),
    ),
    abilities: Object.fromEntries(
      abilityCatalog.abilities.map((a) => [
        a.key,
        { name: a.name, description: a.description },
      ]),
    ),
  }
  cache = { at: Date.now(), value }
  return value
}
