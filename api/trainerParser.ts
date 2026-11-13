// Trainer parsing: parties, classes and the maps each trainer appears in.

import {
  FIXED_ENCOUNTER_REGION_OVERRIDES,
  REF,
  REPO,
  fetchMapSources,
  fetchRaw,
  isExcludedRouteToken,
  mapNameToRouteToken,
  normalizeKey,
  type PokemonEntry,
  type TreeNode,
} from './parser.js'

const TRAINER_CONSTANTS_PATH = 'constants/trainer_constants.asm'
const TRAINER_CLASS_NAMES_PATH = 'data/trainers/class_names.asm'
const TRAINER_PARTIES_PATH = 'data/trainers/parties.asm'
const TRAINER_PARTY_POINTERS_PATH = 'data/trainers/party_pointers.asm'
const TRAINER_PIC_POINTERS_PATH = 'data/trainers/pic_pointers.asm'
const TRAINER_ATTRIBUTES_PATH = 'data/trainers/attributes.asm'
const TRAINER_DVS_PATH = 'data/trainers/dvs.asm'
const TRAINER_CLASS_EVS_PATH = 'data/trainers/class_evs.asm'
const TRAINER_RANDOM_PARTIES_PATH = 'data/trainers/random_parties.asm'
const TRAINER_PICS_PATH = 'gfx/pics.asm'
const MAPS_PATH = 'data/maps/maps.asm'

export const TRAINER_PIC_BASE = `https://raw.githubusercontent.com/${REPO}/${REF}`

// Top-level maps with no region folder, on top of the wild-encounter overrides.
const TRAINER_REGION_OVERRIDES: Record<string, string> = {
  ...FIXED_ENCOUNTER_REGION_OVERRIDES,
  SEAFOAM_GYM: 'kanto',
}

export type TrainerCategory =
  'gym' | 'elite_four' | 'dungeon' | 'route' | 'battle_tower'

export interface TrainerDvs {
  atk: number
  def: number
  spd: number
  spc: number
}

export interface TrainerMon {
  // Added to the engine's scaling base level (wBaseLevel).
  levelOffset: number
  // Species as a pokemon-table name (lowercased base_stats filename).
  species: string
  item: string | null
  ability: string | null
  // null: the Pokémon uses its level-up moves.
  moves: string[] | null
  // Explicit DVs; a preset name (e.g. PERFECT) is resolved to numbers when known.
  dvs: TrainerDvs | null
  dvsPreset: string | null
  // 1-based index of an EVS_* preset, or null for the class default.
  evSpread: number | null
  nickname: string | null
  shiny: boolean
}

export interface TrainerTeam {
  mons: TrainerMon[]
  // Set for random teams: `count` Pokémon are drawn from `mons`.
  randomCount: number | null
}

export interface TrainerLocation {
  region: string
  route: string
}

export interface TrainerClassInfo {
  key: string
  name: string
  picUrl: string | null
  items: string[]
  baseReward: number
  dvs: TrainerDvs
  // EV tier (0 route, 1 elite, 2 boss) and the 1-based EVS_* preset shape.
  evTier: number
  evShape: number
}

export interface TrainerDef {
  // `<CLASS>/<ID>`, e.g. YOUNGSTER/JOEY.
  key: string
  classKey: string
  id: string
  name: string
  double: boolean
  category: TrainerCategory
  region: string
  locations: TrainerLocation[]
  normal: TrainerTeam
  hard: TrainerTeam | null
}

export interface TrainerData {
  classes: TrainerClassInfo[]
  trainers: TrainerDef[]
}

function stripComment(line: string): string {
  const index = line.indexOf(';')
  return (index === -1 ? line : line.slice(0, index)).trim()
}

function codeLines(source: string): string[] {
  return source.split('\n').map(stripComment)
}

function toMonKey(species: string): string {
  return normalizeKey(species)
}

function displayClassName(raw: string): string {
  return raw
    .replace(/#mon/gi, 'Pokémon')
    .replace(/#maniac/gi, 'Pokémaniac')
    .replace(/<PKMN>/g, 'Pokémon')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function parseTrainerClassKeys(source: string): string[] {
  const keys: string[] = []
  for (const line of codeLines(source)) {
    const m = line.match(/^trainerclass\s+([A-Z0-9_]+)/)
    if (m) keys.push(m[1])
  }
  // Index 0 is TRAINER_NONE; table rows start at the first real class.
  return keys.slice(1)
}

function parseClassNames(source: string): string[] {
  return [...source.matchAll(/^\s*li\s+"([^"]*)"/gm)].map((m) =>
    displayClassName(m[1]),
  )
}

function parseDbaLabels(source: string): string[] {
  return [...source.matchAll(/^\s*dba\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1])
}

function parsePicFiles(source: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const m of source.matchAll(
    /^([A-Za-z0-9_]+Pic):\s*INCBIN\s+"(gfx\/trainers\/[^"]+?)\.2bpp\.lz"/gm,
  )) {
    files.set(m[1], `${m[2]}.png`)
  }
  return files
}

interface ClassAttributes {
  items: string[]
  baseReward: number
}

function parseClassAttributes(source: string): ClassAttributes[] {
  const rows: ClassAttributes[] = []
  let current: ClassAttributes | null = null
  for (const line of source.split('\n')) {
    const items = line.match(
      /^\s*dw\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)\s*;\s*items/,
    )
    if (items) {
      current = {
        items: [items[1], items[2]].filter((item) => item !== 'NO_ITEM'),
        baseReward: 0,
      }
      rows.push(current)
      continue
    }
    const reward = line.match(/^\s*db\s+(\d+)\s*;\s*base reward/)
    if (reward && current) current.baseReward = Number(reward[1])
  }
  return rows
}

function parseClassDvs(source: string): TrainerDvs[] {
  return [
    ...source.matchAll(/^\s*dn\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gm),
  ].map((m) => ({
    atk: Number(m[1]),
    def: Number(m[2]),
    spd: Number(m[3]),
    spc: Number(m[4]),
  }))
}

const EV_TIERS = ['ROUTE', 'ELITE', 'BOSS', 'MAX']
const EV_PRESETS = [
  'ATK_SPE',
  'SAT_SPE',
  'HP_ATK',
  'HP_SAT',
  'HP_DEF',
  'HP_SDF',
  'ALL',
]

function parseClassEvs(source: string): { tier: number; shape: number }[] {
  return [...source.matchAll(/^\s*class_evs\s+([A-Z]+)\s*,\s*([A-Z_]+)/gm)].map(
    (m) => ({
      tier: Math.max(0, EV_TIERS.indexOf(m[1])),
      shape: EV_PRESETS.indexOf(m[2]) + 1,
    }),
  )
}

// Hidden Power / perfect presets are named rather than numeric; the numeric
// ones can be resolved with the same constants the engine uses.
function presetDvs(name: string): TrainerDvs | null {
  if (name === 'PERFECT') return { atk: 15, def: 15, spd: 15, spc: 13 }
  return null
}

interface RandomList {
  mons: TrainerMon[]
}

function emptyMon(levelOffset: number, species: string): TrainerMon {
  return {
    levelOffset,
    species,
    item: null,
    ability: null,
    moves: null,
    dvs: null,
    dvsPreset: null,
    evSpread: null,
    nickname: null,
    shiny: false,
  }
}

// Applies one optional `item`/`ability`/`moves`/`dvs`/`ev_spread`/`nickname`/
// `shiny` line to the Pokémon being built. Returns false for other lines.
function applyMonOption(mon: TrainerMon, line: string): boolean {
  const m = line.match(/^([a-z_]+)\s*(.*)$/)
  if (!m) return false
  const [, keyword, rest] = m
  switch (keyword) {
    case 'item':
      mon.item = rest.trim() || null
      return true
    case 'ability':
      mon.ability = rest.trim() || null
      return true
    case 'moves':
      mon.moves = rest
        .split(',')
        .map((move) => move.trim())
        .filter(Boolean)
      return true
    case 'dvs': {
      const numbers = rest.split(',').map((part) => part.trim())
      if (numbers.length === 4 && numbers.every((n) => /^\d+$/.test(n))) {
        mon.dvs = {
          atk: Number(numbers[0]),
          def: Number(numbers[1]),
          spd: Number(numbers[2]),
          spc: Number(numbers[3]),
        }
      } else {
        mon.dvsPreset = rest.trim()
        mon.dvs = presetDvs(mon.dvsPreset)
      }
      return true
    }
    case 'ev_spread': {
      const index = EV_PRESETS.indexOf(rest.trim().replace(/^EVS_/, ''))
      mon.evSpread = index === -1 ? null : index + 1
      return true
    }
    case 'nickname':
      mon.nickname = rest.match(/"([^"]*)"/)?.[1] ?? null
      return true
    case 'shiny':
      mon.shiny = true
      return true
    default:
      return false
  }
}

function parseRandomLists(source: string): Map<string, RandomList> {
  const lists = new Map<string, RandomList>()
  let current: RandomList | null = null
  let mon: TrainerMon | null = null
  for (const line of codeLines(source)) {
    const start = line.match(/^random_list\s+([A-Z0-9_]+)/)
    if (start) {
      current = { mons: [] }
      lists.set(start[1], current)
      mon = null
      continue
    }
    if (line.startsWith('end_random_list')) {
      current = null
      mon = null
      continue
    }
    if (!current) continue
    const monLine = line.match(/^mon\s+(\d+)\s*,\s*([A-Z0-9_]+)/)
    if (monLine) {
      mon = emptyMon(Number(monLine[1]), toMonKey(monLine[2]))
      current.mons.push(mon)
    } else if (mon) {
      applyMonOption(mon, line)
    }
  }
  return lists
}

interface RawParty {
  id: string
  name: string
  double: boolean
  normal: TrainerTeam
  hard: TrainerTeam | null
}

// Parses every `<Class>Group:` block: each `party ID, "Name"` ... `end_party`.
function parseParties(
  source: string,
  randomLists: Map<string, RandomList>,
): Map<string, RawParty[]> {
  const groups = new Map<string, RawParty[]>()
  let group: RawParty[] | null = null
  let party: RawParty | null = null
  let team: TrainerTeam | null = null
  let mon: TrainerMon | null = null

  for (const line of codeLines(source)) {
    if (!line) continue
    const label = line.match(/^([A-Za-z0-9_]+Group):$/)
    if (label) {
      group = []
      groups.set(label[1], group)
      continue
    }
    const partyStart = line.match(/^party\s+([A-Z0-9_]+)\s*,\s*"([^"]*)"(.*)$/)
    if (partyStart && group) {
      team = { mons: [], randomCount: null }
      party = {
        id: partyStart[1],
        name: partyStart[2],
        double: /DOUBLES/.test(partyStart[3]),
        normal: team,
        hard: null,
      }
      group.push(party)
      mon = null
      continue
    }
    if (!party) continue
    if (line.startsWith('end_party')) {
      party = null
      team = null
      mon = null
      continue
    }
    if (line === 'hard') {
      team = { mons: [], randomCount: null }
      party.hard = team
      mon = null
      continue
    }
    const random = line.match(/^random_mons\s+(\d+)\s*,\s*([A-Z0-9_]+)/)
    if (random && team) {
      team.randomCount = Number(random[1])
      team.mons = randomLists.get(random[2])?.mons ?? []
      mon = null
      continue
    }
    const monLine = line.match(/^mon\s+(\d+)\s*,\s*([A-Z0-9_]+)/)
    if (monLine && team) {
      mon = emptyMon(Number(monLine[1]), toMonKey(monLine[2]))
      team.mons.push(mon)
    } else if (mon) {
      applyMonOption(mon, line)
    }
  }
  return groups
}

interface MapInfo {
  environment: string
  music: string
}

function parseMapInfo(source: string): Map<string, MapInfo> {
  const info = new Map<string, MapInfo>()
  for (const m of source.matchAll(
    /^\s*map\s+([A-Za-z0-9_]+)\s*,\s*[A-Z0-9_]+\s*,\s*([A-Z0-9_]+)\s*,\s*[A-Z0-9_]+\s*,\s*([A-Z0-9_]+)/gm,
  )) {
    info.set(m[1], { environment: m[2], music: m[3] })
  }
  return info
}

function categorizeMap(
  mapName: string,
  info: MapInfo | undefined,
): TrainerCategory {
  if (/Gym(\d+F)?$/.test(mapName) || info?.music === 'MUSIC_GYM') return 'gym'
  if (info?.music === 'MUSIC_INDIGO_PLATEAU' && /Room$/.test(mapName))
    return 'elite_four'
  if (
    info &&
    (info.environment === 'CAVE' ||
      info.environment === 'DUNGEON' ||
      info.environment === 'INDOOR')
  )
    return 'dungeon'
  return 'route'
}

const CATEGORY_RANK: Record<TrainerCategory, number> = {
  elite_four: 0,
  gym: 1,
  dungeon: 2,
  route: 3,
  battle_tower: 4,
}

// Challenge facility and tower parties are fought through engine scripts, not
// map scripts, so they are identified by their ID prefix.
function battleTowerPlacement(id: string): TrainerPlacement | null {
  const match = /^(?:FACILITY_([A-Z]+)_\d+|TOWER_[A-Z_0-9]+)$/.exec(id)
  if (!match) return null
  return {
    locations: [],
    category: 'battle_tower',
    region: match[1]?.toLowerCase() ?? '',
  }
}

const TRAINER_REF_RE =
  /^\s*(?:trainer|loadtrainer)\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/gm

interface TrainerPlacement {
  locations: TrainerLocation[]
  category: TrainerCategory
  region?: string
}

function findTrainerPlacements(
  mapSources: { path: string; source: string }[],
  mapInfo: Map<string, MapInfo>,
): Map<string, TrainerPlacement> {
  const placements = new Map<string, TrainerPlacement>()
  for (const { path, source } of mapSources) {
    const segments = path.split('/')
    const mapName = (segments.at(-1) ?? '').replace(/\.asm$/, '')
    const route = mapNameToRouteToken(mapName)
    if (isExcludedRouteToken(route)) continue
    const region =
      segments.length > 2
        ? segments[1]
        : (TRAINER_REGION_OVERRIDES[route] ?? '')
    const category = categorizeMap(mapName, mapInfo.get(mapName))

    for (const m of source.matchAll(TRAINER_REF_RE)) {
      const key = `${m[1]}/${m[2]}`
      const placement = placements.get(key) ?? { locations: [], category }
      if (
        !placement.locations.some(
          (location) => location.region === region && location.route === route,
        )
      ) {
        placement.locations.push({ region, route })
      }
      // A trainer fought in several maps takes its most prominent category.
      if (CATEGORY_RANK[category] < CATEGORY_RANK[placement.category])
        placement.category = category
      placements.set(key, placement)
    }
  }
  return placements
}

export async function fetchTrainerData(
  tree: TreeNode[],
  pokemonEntries: PokemonEntry[],
): Promise<TrainerData> {
  const [
    constantsSource,
    classNamesSource,
    partiesSource,
    pointersSource,
    picPointersSource,
    attributesSource,
    dvsSource,
    classEvsSource,
    randomSource,
    picsSource,
    mapsSource,
    mapSources,
  ] = await Promise.all([
    fetchRaw(TRAINER_CONSTANTS_PATH),
    fetchRaw(TRAINER_CLASS_NAMES_PATH),
    fetchRaw(TRAINER_PARTIES_PATH),
    fetchRaw(TRAINER_PARTY_POINTERS_PATH),
    fetchRaw(TRAINER_PIC_POINTERS_PATH),
    fetchRaw(TRAINER_ATTRIBUTES_PATH),
    fetchRaw(TRAINER_DVS_PATH),
    fetchRaw(TRAINER_CLASS_EVS_PATH),
    fetchRaw(TRAINER_RANDOM_PARTIES_PATH),
    fetchRaw(TRAINER_PICS_PATH),
    fetchRaw(MAPS_PATH),
    fetchMapSources(tree),
  ])

  const classKeys = parseTrainerClassKeys(constantsSource)
  const classNames = parseClassNames(classNamesSource)
  const groupLabels = parseDbaLabels(pointersSource)
  const picLabels = parseDbaLabels(picPointersSource)
  const picFiles = parsePicFiles(picsSource)
  const attributes = parseClassAttributes(attributesSource)
  const classDvs = parseClassDvs(dvsSource)
  const classEvs = parseClassEvs(classEvsSource)

  const randomLists = parseRandomLists(randomSource)
  const groups = parseParties(partiesSource, randomLists)
  const placements = findTrainerPlacements(mapSources, parseMapInfo(mapsSource))

  const validSpecies = new Set(pokemonEntries.map((e) => normalizeKey(e.name)))
  const speciesName = new Map(
    pokemonEntries.map((e) => [normalizeKey(e.name), e.name]),
  )
  const resolveMon = (mon: TrainerMon): TrainerMon | null => {
    if (!validSpecies.has(mon.species)) return null
    return { ...mon, species: speciesName.get(mon.species) ?? mon.species }
  }
  const resolveTeam = (team: TrainerTeam): TrainerTeam => ({
    ...team,
    mons: team.mons.map(resolveMon).filter((m): m is TrainerMon => m !== null),
  })

  const classes: TrainerClassInfo[] = []
  const trainers: TrainerDef[] = []

  classKeys.forEach((classKey, index) => {
    const picFile = picFiles.get(picLabels[index] ?? '')
    const evs = classEvs[index]
    classes.push({
      key: classKey,
      name: classNames[index] ?? classKey,
      picUrl: picFile ? `${TRAINER_PIC_BASE}/${picFile}` : null,
      items: attributes[index]?.items ?? [],
      baseReward: attributes[index]?.baseReward ?? 0,
      dvs: classDvs[index] ?? { atk: 8, def: 8, spd: 8, spc: 8 },
      evTier: evs?.tier ?? 0,
      evShape: evs?.shape ?? 0,
    })

    for (const party of groups.get(groupLabels[index] ?? '') ?? []) {
      const key = `${classKey}/${party.id}`
      const placement = placements.get(key) ?? battleTowerPlacement(party.id)
      // Remaining unplaced parties are unused or test data.
      if (!placement) continue
      const normal = resolveTeam(party.normal)
      if (normal.mons.length === 0) continue
      trainers.push({
        key,
        classKey,
        id: party.id,
        name: party.name,
        double: party.double,
        category: placement.category,
        region: placement.region ?? placement.locations[0]?.region ?? '',
        locations: placement.locations,
        normal,
        hard: party.hard ? resolveTeam(party.hard) : null,
      })
    }
  })

  return { classes, trainers }
}
