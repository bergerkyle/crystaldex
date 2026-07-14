export interface PokemonStats {
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}

export interface PokemonListItem {
  name: string
  region: string
  frontSprite: string
  types: string[]
}

export interface EvolutionTarget {
  name: string
  region: string
}

export interface Evolution {
  method: 'level' | 'item' | 'trade' | 'happiness' | 'stat'
  level?: number
  item?: string
  condition?: string
  to: EvolutionTarget
}

export interface EvolutionSource {
  method: Evolution['method']
  level?: number
  item?: string
  condition?: string
  from: EvolutionTarget
}

export interface Move {
  level: number
  key: string
  name: string
  description: string
  power: number
  type: string
  category: string
  accuracy: number
  pp: number
}

export interface TmMove {
  label: string
  key: string
  name: string
  description: string
  power: number
  type: string
  category: string
  accuracy: number
  pp: number
}

export interface MoveCatalogItem {
  key: string
  name: string
  description: string
  power: number
  type: string
  category: string
  accuracy: number
  pp: number
}

export interface Sprites {
  front: string
  back: string
}

export interface Ability {
  name: string
  description: string
}

export type EncounterMethod = 'grass' | 'water'

export type EncounterTime = 'morn' | 'day' | 'nite'

export interface EncounterPokemon {
  name: string
  region: string
}

export interface EncounterRate {
  pokemon: EncounterPokemon
  rate: number
}

export interface RouteGrassEncounters {
  time: EncounterTime
  encounters: EncounterRate[]
}

export interface RouteEncounter {
  region: string
  route: string
  grass: RouteGrassEncounters[]
  water: EncounterRate[]
}

export interface PokemonEncounter {
  region: string
  route: string
  method: EncounterMethod
  rate: number
  time?: EncounterTime
}

export interface PokemonDetail {
  name: string
  region: string
  types: string[]
  stats: PokemonStats
  evolutions: Evolution[]
  evolutionSources: EvolutionSource[]
  moves: Move[]
  tmMoves: TmMove[]
  sprites: Sprites
  ability: Ability | null
  encounters: PokemonEncounter[]
}

// Display order and colors requested for the stat bars.
export const STAT_DISPLAY: {
  key: keyof PokemonStats
  label: string
  color: string
}[] = [
  { key: 'hp', label: 'HP', color: '#e53935' }, // red
  { key: 'attack', label: 'Attack', color: '#fb8c00' }, // orange
  { key: 'defense', label: 'Defense', color: '#1e88e5' }, // blue
  { key: 'specialAttack', label: 'Special Attack', color: '#8e24aa' }, // purple
  { key: 'specialDefense', label: 'Special Defense', color: '#43a047' }, // green
  { key: 'speed', label: 'Speed', color: '#fbc02d' }, // yellow
]

// Highest possible base stat, used to scale the bar widths.
export const MAX_STAT = 255

// Alternate-form regional variants (in the `alt` folder) are stored as the
// base species name prefixed with a single letter.
const REGIONAL_FORMS: Record<string, string> = {
  a: 'Alolan',
  g: 'Galarian',
  h: 'Hisuian',
}

export function formatName(
  raw: string,
  region?: string,
  allNames?: Set<string>,
): string {
  let base = raw
  let suffix = ''
  let prefix = ''

  // Mega forms are stored as `<name><x|y|z>` (e.g. charizardx, gardevoiry).
  // Display them as "Charizard X", "Gardevoir Y", etc.
  if (region === 'mega' && /[xyz]$/i.test(base)) {
    suffix = ` ${base.slice(-1).toUpperCase()}`
    base = base.slice(0, -1)
  }

  // Regional forms live in the `alt` folder as the base species with a
  // one-letter prefix: a=Alolan, g=Galarian, h=Hisuian (e.g. `agolem` ->
  // "Alolan Golem"). Only treat it as a regional form when the un-prefixed
  // species actually exists, so unrelated alt entries stay untouched.
  if (region === 'alt' && base.length > 1) {
    const label = REGIONAL_FORMS[base[0].toLowerCase()]
    const candidate = base.slice(1).toLowerCase()
    if (label && allNames?.has(candidate)) {
      prefix = `${label} `
      base = base.slice(1)
    }
  }

  return (
    prefix +
    base
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) +
    suffix
  )
}

// Turn an ALL_CAPS constant like HOENNITE_X or QUICK_ATTACK into "Hoennite X".
export function formatConstant(raw: string): string {
  return raw
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatLocation(raw: string): string {
  return raw
    .split('_')
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+[a-z]$/i.test(segment)) return segment.toUpperCase()
      if (/^[A-Z]?[0-9]+[A-Z]$/i.test(segment)) return segment.toUpperCase()
      const lower = segment.toLowerCase()
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

export function formatEncounterMethod(method: EncounterMethod): string {
  return method === 'grass' ? 'Grass' : 'Surf'
}

export function formatEncounterTime(time?: EncounterTime): string {
  if (!time) return 'Any'
  if (time === 'morn') return 'Morning'
  if (time === 'nite') return 'Night'
  return 'Day'
}

const REGION_DISPLAY_ORDER = ['kanto', 'johto', 'hoenn'] as const

export function compareRegionOrder(left: string, right: string): number {
  const leftIndex = REGION_DISPLAY_ORDER.indexOf(
    left.toLowerCase() as (typeof REGION_DISPLAY_ORDER)[number],
  )
  const rightIndex = REGION_DISPLAY_ORDER.indexOf(
    right.toLowerCase() as (typeof REGION_DISPLAY_ORDER)[number],
  )
  const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
  const normalizedRight =
    rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
  return normalizedLeft !== normalizedRight
    ? normalizedLeft - normalizedRight
    : left.localeCompare(right)
}

export function compareLocationOrder(left: string, right: string): number {
  return formatLocation(left).localeCompare(formatLocation(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

// Human-readable description of an evolution's trigger (without the target name).
export function evolutionMethodText(evo: Evolution): string {
  switch (evo.method) {
    case 'level':
      return `at Lv. ${evo.level}`
    case 'item':
      return `with ${evo.item ? formatConstant(evo.item) : 'an item'}`
    case 'trade':
      return evo.item
        ? `when traded holding ${formatConstant(evo.item)}`
        : 'when traded'
    case 'happiness':
      return 'with high friendship'
    case 'stat':
      return `at Lv. ${evo.level} (${evo.condition ? formatConstant(evo.condition) : ''})`
    default:
      return ''
  }
}

export function evolutionSourceMethodText(evo: EvolutionSource): string {
  return evolutionMethodText({
    method: evo.method,
    level: evo.level,
    item: evo.item,
    condition: evo.condition,
    to: evo.from,
  })
}
