import type { PokemonStats } from './pokemon'

export type TrainerCategory =
  'gym' | 'elite_four' | 'dungeon' | 'route' | 'battle_tower'

// Engine badge count -> level mod (engine/events/std_scripts.asm). The
// scaling base level is the mod + 5.
const BADGE_LEVEL_MODS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 42, 44, 46, 48, 50, 52, 54, 56, 57, 58, 59,
  60, 61, 62, 63, 64,
]

export const MAX_BADGES = BADGE_LEVEL_MODS.length - 1

// The engine adds +2 to the base level for each Rocket event completed.
export const ROCKET_EVENTS = [
  { key: 'mahogany', label: 'Mahogany' },
  { key: 'radio', label: 'Radio Tower' },
  { key: 'mauville', label: 'Mauville' },
  { key: 'mtmoon', label: 'Mt. Moon' },
] as const

export function baseLevelFor(badges: number, rocketEvents: number): number {
  return (BADGE_LEVEL_MODS[badges] ?? 0) + 5 + 2 * rocketEvents
}

export const TRAINER_CATEGORY_ORDER: TrainerCategory[] = [
  'gym',
  'elite_four',
  'dungeon',
  'route',
  'battle_tower',
]

// Dungeon and route trainers are only listed on their location pages.
export const TRAINERS_PAGE_CATEGORIES: TrainerCategory[] = [
  'gym',
  'elite_four',
  'battle_tower',
]

export const TRAINER_CATEGORY_LABELS: Record<TrainerCategory, string> = {
  gym: 'Gyms',
  elite_four: 'Elite Four',
  dungeon: 'Dungeons & Buildings',
  route: 'Routes & Towns',
  battle_tower: 'Battle Tower & Facility',
}

export interface TrainerLocation {
  region: string
  route: string
}

export interface TrainerListItem {
  key: string
  name: string
  classKey: string
  className: string
  category: TrainerCategory
  region: string
  locations: TrainerLocation[]
  picUrl: string | null
  spriteUrl: string | null
  double: boolean
  partySize: number
  variantCount: number
}

export interface TrainerDvs {
  atk: number
  def: number
  spd: number
  spc: number
}

export interface TrainerItemInfo {
  key: string
  name: string
  iconUrl: string | null
}

export interface TrainerMon {
  levelOffset: number
  species: string
  speciesRegion: string
  frontSprite: string | null
  types: string[]
  baseStats: PokemonStats | null
  item: string | null
  itemInfo: TrainerItemInfo | null
  ability: string | null
  moves: string[] | null
  learnset: { level: number; move: string }[]
  dvs: TrainerDvs | null
  dvsPreset: string | null
  evSpread: number | null
  nickname: string | null
  shiny: boolean
}

export interface TrainerTeam {
  mons: TrainerMon[]
  randomCount: number | null
}

export interface TrainerVariantInfo {
  label: string
  minBadges: number | null
  maxBadges: number | null
  order: number
}

export interface TrainerVariantDetail {
  key: string
  variant: TrainerVariantInfo | null
  normal: TrainerTeam
  hard: TrainerTeam | null
}

export interface TrainerDetail extends Omit<
  TrainerListItem,
  'partySize' | 'variantCount'
> {
  baseReward: number
  classDvs: TrainerDvs
  evTier: number
  evShape: number
  classItems: TrainerItemInfo[]
  moves: Record<
    string,
    {
      name: string
      type: string
      category: string
      power: number
      accuracy: number
      pp: number
      target: string
    }
  >
  // One entry per party the trainer can use, ordered by progression.
  variants: TrainerVariantDetail[]
}

export function trainerPath(key: string): string {
  return `/trainers/${key.split('/').map(encodeURIComponent).join('/')}`
}

// Trainers sharing a name within a class (rematches) get a numeric suffix.
export function trainerLabel(
  trainer: Pick<TrainerListItem, 'key' | 'name'>,
  all: Pick<TrainerListItem, 'key' | 'name' | 'classKey'>[],
): string {
  const classKey = trainer.key.split('/')[0]
  const clashes = all.filter(
    (other) => other.classKey === classKey && other.name === trainer.name,
  )
  if (clashes.length < 2) return trainer.name
  const number = trainer.key.match(/(\d+)$/)?.[1]
  return number ? `${trainer.name} (${number})` : trainer.name
}

// Rows of the engine's TrainerEVSpreads (data/trainers/ev_spreads.asm):
// hp, atk, def, spd, sat, sdf. Index 0 is EVS_ATK_SPE.
const EV_SPREADS = [
  [6, 252, 0, 252, 0, 0],
  [6, 0, 0, 252, 252, 0],
  [252, 252, 0, 6, 0, 0],
  [252, 0, 0, 6, 252, 0],
  [252, 0, 252, 0, 0, 6],
  [252, 0, 6, 0, 0, 252],
  [85, 85, 85, 85, 85, 85],
]
const EVS_ALL = 7
const CLASS_OFF_STAT_EV = 126
const CLASS_ALL_STAT_EV = 168
const MAX_EV = 252

// Class default EVs (engine .DefaultEVs): the preset shape with its off-stats
// raised, scaled by the class tier and the Pokémon's level.
function defaultEvs(
  shape: number,
  tier: number,
  level: number,
  hard: boolean,
): number[] {
  if (shape <= 0) return [0, 0, 0, 0, 0, 0]
  const effectiveTier = tier + (hard ? 1 : 0)
  if (effectiveTier >= 3) return Array(6).fill(MAX_EV)
  const off = shape === EVS_ALL ? CLASS_ALL_STAT_EV : CLASS_OFF_STAT_EV
  const ratio =
    effectiveTier === 2
      ? 255
      : Math.min(255, Math.floor((level * 3) / (effectiveTier === 0 ? 2 : 1)))
  return EV_SPREADS[shape - 1].map((ev) =>
    Math.floor(((ev < 128 ? off : ev) * (ratio + 1)) / 256),
  )
}

export interface TrainerMonStats {
  level: number
  stats: PokemonStats
}

// Gen 2 style stat formula as implemented by the engine's CalcMonStatC, with
// EVs counted in quarters.
export function computeMonStats(
  mon: TrainerMon,
  trainer: Pick<TrainerDetail, 'classDvs' | 'evTier' | 'evShape'>,
  baseLevel: number,
  hard: boolean,
): TrainerMonStats | null {
  if (!mon.baseStats) return null
  const level = Math.min(100, Math.max(1, baseLevel + mon.levelOffset))
  const dvs = mon.dvs ?? trainer.classDvs
  const evs =
    mon.evSpread !== null
      ? EV_SPREADS[mon.evSpread - 1]
      : defaultEvs(trainer.evShape, trainer.evTier, level, hard)
  const hpDv =
    ((dvs.atk & 1) << 3) |
    ((dvs.def & 1) << 2) |
    ((dvs.spd & 1) << 1) |
    (dvs.spc & 1)
  const calc = (base: number, dv: number, ev: number, isHp: boolean) => {
    const core = Math.floor(
      (((base + dv) * 2 + Math.floor(ev / 4)) * level) / 100,
    )
    return Math.min(999, core + (isHp ? level + 10 : 5))
  }
  const b = mon.baseStats
  return {
    level,
    stats: {
      hp: calc(b.hp, hpDv, evs[0], true),
      attack: calc(b.attack, dvs.atk, evs[1], false),
      defense: calc(b.defense, dvs.def, evs[2], false),
      speed: calc(b.speed, dvs.spd, evs[3], false),
      specialAttack: calc(b.specialAttack, dvs.spc, evs[4], false),
      specialDefense: calc(b.specialDefense, dvs.spc, evs[5], false),
    },
  }
}

// A Pokémon without explicit moves knows its last four level-up moves.
export function monMoves(mon: TrainerMon, level: number): string[] {
  if (mon.moves) return mon.moves
  const learned: string[] = []
  for (const entry of mon.learnset) {
    if (entry.level > level) continue
    const existing = learned.indexOf(entry.move)
    if (existing !== -1) learned.splice(existing, 1)
    learned.push(entry.move)
  }
  return learned.slice(-4)
}
