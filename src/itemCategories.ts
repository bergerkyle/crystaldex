import { type ItemListItem } from './pokemon'

export type ItemCategoryId =
  | 'medicine'
  | 'vitamin'
  | 'battle'
  | 'hold'
  | 'berry'
  | 'evolution'
  | 'fossil'
  | 'apricorn'
  | 'tmhm'
  | 'sell'
  | 'mail'
  | 'other'

export const ITEM_CATEGORIES: { id: ItemCategoryId; label: string }[] = [
  { id: 'medicine', label: 'Medicine' },
  { id: 'vitamin', label: 'Vitamins' },
  { id: 'battle', label: 'Battle Items' },
  { id: 'hold', label: 'Hold Items' },
  { id: 'berry', label: 'Berries' },
  { id: 'evolution', label: 'Evolution Items' },
  { id: 'fossil', label: 'Fossils' },
  { id: 'apricorn', label: 'Apricorns' },
  { id: 'tmhm', label: 'TMs & HMs' },
  { id: 'sell', label: 'Sell Items' },
  { id: 'mail', label: 'Mail' },
  { id: 'other', label: 'Other' },
]

const CATEGORY_LABELS = new Map(ITEM_CATEGORIES.map((c) => [c.id, c.label]))
const CATEGORY_RANK = new Map(ITEM_CATEGORIES.map((c, i) => [c.id, i]))

export function categoryLabel(id: ItemCategoryId): string {
  return CATEGORY_LABELS.get(id) ?? 'Other'
}

export function categoryRank(id: ItemCategoryId): number {
  return CATEGORY_RANK.get(id) ?? ITEM_CATEGORIES.length
}

// Items labeled "Teru-Sama" are placeholder/unused entries and are hidden.
export function isHiddenItem(item: ItemListItem): boolean {
  return /^teru-?sama$/i.test(item.name.trim())
}

// Local /public fallback icons for items PokemonDB doesn't provide a sprite for.
const LOCAL_ICON_BY_KEY: Record<string, string> = {
  POLKADOT_BOW: '/bow.png',
  PINK_BOW: '/bow.png',
  NORMAL_BOX: '/box.png',
  GORGEOUS_BOX: '/box.png',
  BRICK_PIECE: '/brick.png',
  MARVEL_SCALE: '/scale.png',
  PARLYZ_HEAL: '/heal.png',
  X_SPECIAL: '/x-sp-atk.png',
  X_DEFEND: '/x%20defend.png',
  SILVER_LEAF: '/leaf.png',
  GOLD_LEAF: '/leaf.png',
  BERSERK_GENE: '/x-attack.png',
  BLACKBELT_I: '/black-belt.png',
  THUNDERSTONE: '/thunderstone.png',
  KANTOITE_X: '/kantox.png',
  KANTOITE_Y: '/kantoy.png',
  JOHTOITE_X: '/johtox.png',
  HOENNITE_X: '/hoennite.png',
}

// Resolve an item's icon. Explicit local overrides win, then the synced
// PokemonDB sprite, then category-based local fallbacks.
export function itemIconUrl(item: ItemListItem): string | null {
  const key = item.key.toUpperCase()
  if (LOCAL_ICON_BY_KEY[key]) return LOCAL_ICON_BY_KEY[key]
  if (item.iconUrl) return item.iconUrl
  if (item.name.toLowerCase().includes('box')) return '/box.png'

  const category = categorizeItem(item)
  if (category === 'fossil') return '/fossil.png'
  if (category === 'mail') return '/mail.png'
  if (category === 'berry') return '/berry.png'

  return null
}

// Item-specific overrides where the generic rules don't fit.
const FORCED_HOLD_KEYS = new Set(['LUCKY_PUNCH'])
const FORCED_BATTLE_KEYS = new Set(['POKE_DOLL', 'BERSERK_GENE', 'BESERK_GENE'])
const FORCED_MEDICINE_KEYS = new Set(['ICE_HEAL', 'AWAKENING', 'FULL_HEAL'])
const FORCED_EVOLUTION_KEYS = new Set(['DRAGON_SCALE', 'UP_GRADE'])
const EVOLUTION_EXCLUDED_KEYS = new Set(['HARD_STONE', 'EVERSTONE'])

// Assign an item to a single category. Order matters: the first matching rule
// wins, so more specific rules are checked before broader ones.
export function categorizeItem(item: ItemListItem): ItemCategoryId {
  const name = item.name.trim()
  const lowerName = name.toLowerCase()
  const desc = item.description.trim()
  const lowerDesc = desc.toLowerCase()
  const key = item.key.toUpperCase()

  if (/^(tm|hm)\d/i.test(key)) return 'tmhm'
  if (lowerName.includes('berry')) return 'berry'
  if (/mail$/i.test(name)) return 'mail'
  if (lowerName.includes('apricorn')) return 'apricorn'
  if (lowerName.includes('fossil') || key === 'OLD_AMBER') return 'fossil'

  if (FORCED_HOLD_KEYS.has(key)) return 'hold'
  if (FORCED_MEDICINE_KEYS.has(key)) return 'medicine'
  if (FORCED_EVOLUTION_KEYS.has(key)) return 'evolution'

  if (
    FORCED_BATTLE_KEYS.has(key) ||
    /^x\s/i.test(name) ||
    /\(1\s*btl\)[.\s]*$/i.test(desc)
  )
    return 'battle'

  // HARD_STONE / EVER_STONE end in "stone" but are held items, not evolution.
  if (
    !EVOLUTION_EXCLUDED_KEYS.has(key) &&
    (/stone$/i.test(name) ||
      /ite\s+[xy]$/i.test(name) ||
      lowerDesc.includes('evolve'))
  )
    return 'evolution'

  if (/\(hold\)[.\s]*$/i.test(desc)) return 'hold'
  if (/^raises\b/i.test(desc)) return 'vitamin'
  if (/restore|revive|heals|cure/i.test(lowerDesc)) return 'medicine'
  if (lowerDesc.includes('sell')) return 'sell'

  return 'other'
}
