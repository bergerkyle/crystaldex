// Maps our items onto PokemonDB item icon sprites.
//   - Regular items: https://img.pokemondb.net/sprites/items/<name-slug>.png
//   - TMs/HMs: a single type-colored disc per move type (tm-<type>.png)
// PokemonDB sprites are © Nintendo/Game Freak; only re-host if your use allows it.

const POKEMONDB_ITEMS = 'https://img.pokemondb.net/sprites/items'

// Engine item names that don't slugify to the PokemonDB filename. Keyed by the
// item constant. Extend this as the sync script reports unmatched (404) items.
const SLUG_OVERRIDES: Record<string, string> = {
  BRIGHTPOWDER: 'bright-powder',
  SILVERPOWDER: 'silver-powder',
  TINYMUSHROOM: 'tiny-mushroom',
  BLU_APRICORN: 'blue-apricorn',
  YLW_APRICORN: 'yellow-apricorn',
  GRN_APRICORN: 'green-apricorn',
  BLK_APRICORN: 'black-apricorn',
  WHT_APRICORN: 'white-apricorn',
  PNK_APRICORN: 'pink-apricorn',
  EXP_SHARE: 'exp-share',
  ELIXER: 'elixir',
  MAX_ELIXER: 'max-elixir',
  NEVERMELTICE: 'never-melt-ice',
  TWISTEDSPOON: 'twisted-spoon',
  BLACKGLASSES: 'black-glasses',
  BLACKBELT: 'black-belt',
  POKE_DOLL: 'poke-doll',
  SLOWPOKETAIL: 'slowpoke-tail',
  ENERGYPOWDER: 'energy-powder',
  ENERGYROOT: 'energy-root',
  HEALPOWDER: 'heal-powder',
  REVIVALHERB: 'revival-herb',
  RAGECANDYBAR: 'rage-candy-bar',
  MOOMOO_MILK: 'moomoo-milk',
  // Gen II berries mapped to their Gen III PokemonDB equivalents
  BERRY: 'oran-berry',
  GOLD_BERRY: 'sitrus-berry',
  PRZCUREBERRY: 'cheri-berry',
  MINT_BERRY: 'chesto-berry',
  ICE_BERRY: 'aspear-berry',
  BITTER_BERRY: 'persim-berry',
  BURNT_BERRY: 'rawst-berry',
  PSNCUREBERRY: 'pecha-berry',
  MIRACLEBERRY: 'lum-berry',
  MYSTERYBERRY: 'leppa-berry',
}

export const POKEMON_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

export function slugifyItemName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: é -> e
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// TMs and HMs share one type-colored icon per move type.
export function tmHmIconSourceUrl(type: string): string {
  return `${POKEMONDB_ITEMS}/tm-${type.toLowerCase()}.png`
}

// The PokemonDB source URL for an item. Pass the TM/HM move's type to get the
// type-colored machine icon; otherwise the icon is derived from the item name.
export function itemIconSourceUrl(
  key: string,
  name: string,
  tmType?: string | null,
): string | null {
  if (tmType) return tmHmIconSourceUrl(tmType)
  const slug = SLUG_OVERRIDES[key.toUpperCase()] ?? slugifyItemName(name)
  return slug ? `${POKEMONDB_ITEMS}/${slug}.png` : null
}
