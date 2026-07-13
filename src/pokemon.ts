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

export interface Move {
  level: number
  move: string
}

export interface PokemonDetail {
  name: string
  region: string
  stats: PokemonStats
  evolutions: Evolution[]
  moves: Move[]
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

// Sprites live in gfx/pokemon/<name>/{front,back}.png (folder name matches the
// Pokémon's file name, including mega/alt suffixes like charizardx or agolem).
const GFX_BASE =
  'https://raw.githubusercontent.com/aaronjeter/CrystalShireEngine/LevelScaling/gfx/pokemon'

export function spriteUrl(name: string, kind: 'front' | 'back'): string {
  return `${GFX_BASE}/${name}/${kind}.png`
}

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
