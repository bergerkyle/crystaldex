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

// Assign an item to a single category. Order matters: the first matching rule
// wins, so more specific rules are checked before broader ones.
export function categorizeItem(item: ItemListItem): ItemCategoryId {
  const name = item.name.trim()
  const lowerName = name.toLowerCase()
  const desc = item.description.trim()
  const lowerDesc = desc.toLowerCase()
  const key = item.key.toUpperCase()

  if (lowerName.includes('berry')) return 'berry'
  if (/mail$/i.test(name)) return 'mail'
  if (lowerName.includes('apricorn')) return 'apricorn'
  if (lowerName.includes('fossil') || key === 'OLD_AMBER') return 'fossil'

  if (
    /^x\s/i.test(name) ||
    /\(1\s*btl\)[.\s]*$/i.test(desc) ||
    key === 'BERSERK_GENE' ||
    key === 'BESERK_GENE'
  )
    return 'battle'

  // HARD_STONE ends in "stone" but is a held item, not an evolution item.
  if (
    key !== 'HARD_STONE' &&
    (/stone$/i.test(name) ||
      /ite\s+[xy]$/i.test(name) ||
      lowerDesc.includes('evolve'))
  )
    return 'evolution'

  if (/\(hold\)[.\s]*$/i.test(desc)) return 'hold'
  if (/^raises\b/i.test(desc)) return 'vitamin'
  if (/restore|revive|heals|cure/i.test(lowerDesc)) return 'medicine'

  return 'other'
}
