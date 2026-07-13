import { formatConstant } from '../pokemon'

export const TYPE_HEADER_COLORS: Record<string, string> = {
  normal: '#9FA19F',
  fighting: '#FF8000',
  flying: '#81B9EF',
  poison: '#9141CB',
  ground: '#915121',
  rock: '#AFA981',
  bug: '#91A119',
  ghost: '#704170',
  steel: '#60A1B8',
  fire: '#E62829',
  water: '#2980EF',
  grass: '#3FA129',
  electric: '#FAC000',
  psychic: '#EF4179',
  ice: '#3DCEF3',
  dragon: '#5060E1',
  dark: '#624D4E',
  fairy: '#EF70EF',
}

export const TYPE_ICONS: Record<string, string> = {
  normal: '/20px-Normal_icon.png',
  fighting: '/20px-Fighting_icon.png',
  flying: '/20px-Flying_icon.png',
  poison: '/20px-Poison_icon.png',
  ground: '/20px-Ground_icon.png',
  rock: '/20px-Rock_icon.png',
  bug: '/20px-Bug_icon.png',
  ghost: '/20px-Ghost_icon.png',
  steel: '/20px-Steel_icon.png',
  fire: '/20px-Fire_icon.png',
  water: '/20px-Water_icon.png',
  grass: '/20px-Grass_icon.png',
  electric: '/20px-Electric_icon.png',
  psychic: '/20px-Psychic_icon.png',
  ice: '/20px-Ice_icon.png',
  dragon: '/20px-Dragon_icon.png',
  dark: '/20px-Dark_icon.png',
  fairy: '/20px-Fairy_icon.png',
}

export const CATEGORY_ICONS: Record<string, string> = {
  physical: '/Physical.png',
  special: '/Special.png',
  status: '/Status.png',
}

export const TYPE_ORDER = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
] as const

export function headerTextColor(hex: string): string {
  const color = hex.replace('#', '')
  const r = parseInt(color.slice(0, 2), 16)
  const g = parseInt(color.slice(2, 4), 16)
  const b = parseInt(color.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#111' : '#fff'
}

export function TypeMetaChip({ type }: { type: string }) {
  const key = type.toLowerCase()
  return (
    <span
      className="meta-chip meta-chip-type"
      style={{ backgroundColor: TYPE_HEADER_COLORS[key] ?? '#666', color: '#fff' }}
    >
      {TYPE_ICONS[key] && (
        <img
          className="meta-icon"
          src={TYPE_ICONS[key]}
          alt=""
          width={14}
          height={14}
          aria-hidden="true"
        />
      )}
      {formatConstant(type)}
    </span>
  )
}

export function CategoryMetaChip({ category }: { category: string }) {
  const key = category.toLowerCase()
  return (
    <span className="meta-chip meta-chip-category">
      {CATEGORY_ICONS[key] && (
        <img
          className="meta-icon meta-icon-category"
          src={CATEGORY_ICONS[key]}
          alt=""
          width={14}
          height={14}
          aria-hidden="true"
        />
      )}
      {formatConstant(category)}
    </span>
  )
}
