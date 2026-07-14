// All GitHub fetch helpers and ASM parsing logic.

export const REPO = 'aaronjeter/CrystalShireEngine'
export const REF = 'LevelScaling'
export const BASE_STATS_DIR = 'data/pokemon/base_stats'

const MOVES_ASM_PATH = 'data/moves/moves.asm'
const MOVE_NAMES_PATH = 'data/moves/names.asm'
const MOVE_CONSTANTS_PATH = 'constants/move_constants.asm'
const MOVE_DESCRIPTIONS_PATH = 'data/moves/descriptions.asm'
export const ITEM_CONSTANTS_PATH = 'constants/item_constants.asm'
const ABILITIES_ASM_PATH = 'data/abilities/abilities.asm'
const ABILITIES_DESCRIPTIONS_PATH = 'data/abilities/descriptions.asm'
const WILD_PROBABILITIES_PATH = 'data/wild/probabilities.asm'
const WILD_GRASS_PATHS = [
  'data/wild/hoenn_grass.asm',
  'data/wild/kanto_grass.asm',
  'data/wild/johto_grass.asm',
] as const
const WILD_WATER_PATHS = [
  'data/wild/hoenn_water.asm',
  'data/wild/kanto_water.asm',
  'data/wild/johto_water.asm',
] as const
const WILD_FISH_PATH = 'data/wild/fish.asm'
const MAPS_PATH = 'data/maps/maps.asm'

export const SPRITE_BASE = `https://raw.githubusercontent.com/${REPO}/${REF}/gfx/pokemon`

// ---------------------------------------------------------------------------
// Shared interfaces
// ---------------------------------------------------------------------------

export interface PokemonStats {
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}

export interface PokemonTypes {
  primary: string
  secondary: string
}

export interface PokemonEntry {
  name: string
  region: string
  path: string
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

export interface EvosAttacks {
  evolutions: Evolution[]
  moves: Move[]
}

export interface MoveDef {
  key: string
  name: string
  description: string
  power: number
  type: string
  category: 'physical' | 'special' | 'status'
  accuracy: number
  pp: number
}

export type MoveStats = Omit<MoveDef, 'name' | 'key' | 'description'>

export interface TmHmDef {
  move: string
  label: string
  sort: number
}

export interface AbilityDef {
  key: string
  name: string
  description: string
}

export type EncounterMethod = 'grass' | 'water' | 'fishing'

export type FishingRod = 'old' | 'good' | 'super'

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
  fishing: RouteFishingEncounters[]
}

export interface RouteFishingEncounters {
  rod: FishingRod
  time?: EncounterTime
  encounters: EncounterRate[]
}

export interface PokemonEncounter {
  region: string
  route: string
  method: EncounterMethod
  rate: number
  time?: EncounterTime
  rod?: FishingRod
}

export interface WildEncounterData {
  routes: RouteEncounter[]
  pokemon: Map<string, PokemonEncounter[]>
}

interface TreeNode {
  path: string
  type: string
  sha: string
}

let wildEncounterDataPromise: Promise<WildEncounterData> | null = null

export function resetWildEncounterCache(): void {
  wildEncounterDataPromise = null
}

// ---------------------------------------------------------------------------
// GitHub fetch helpers
// ---------------------------------------------------------------------------

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'crystaldex-pokedex',
    Accept: 'application/vnd.github+json',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

// Fetch the full repo file tree. Each blob carries its git SHA, which lets us
// detect when an individual file has been edited between cache refreshes.
export async function fetchTree(): Promise<TreeNode[]> {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) {
    throw new Error(`GitHub tree request failed (${res.status})`)
  }
  const data = (await res.json()) as { tree?: TreeNode[] }
  return data.tree ?? []
}

export async function fetchRaw(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'crystaldex-pokedex' },
  })
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`)
  return res.text()
}

// ---------------------------------------------------------------------------
// Tree / entry helpers
// ---------------------------------------------------------------------------

export function entriesFromTree(tree: TreeNode[]): PokemonEntry[] {
  return tree
    .filter(
      (node) =>
        node.type === 'blob' &&
        node.path.startsWith(`${BASE_STATS_DIR}/`) &&
        node.path.endsWith('.asm'),
    )
    .map((node) => {
      const relative = node.path.slice(BASE_STATS_DIR.length + 1)
      const segments = relative.split('/')
      const file = segments.pop() ?? relative
      return {
        name: file.replace(/\.asm$/, ''),
        region: segments.join('/'),
        path: node.path,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Base stats / type parsers
// ---------------------------------------------------------------------------

// The base stats line looks like: `db  80, 105,  65, 130,  60,  75`
// in file order: hp, attack, defense, speed, special attack, special defense.
const STAT_LINE =
  /^\s*db\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/m

export function parseStats(source: string): PokemonStats | null {
  const match = source.match(STAT_LINE)
  if (!match) return null
  return {
    hp: Number(match[1]),
    attack: Number(match[2]),
    defense: Number(match[3]),
    speed: Number(match[4]),
    specialAttack: Number(match[5]),
    specialDefense: Number(match[6]),
  }
}

const TYPE_LINE = /^\s*db\s+([A-Z][A-Z_]*)\s*,\s*([A-Z][A-Z_]*)/m

function normalizeType(value: string): string {
  return value.replace(/_TYPE$/, '').toLowerCase()
}

export function parseTypes(source: string): PokemonTypes | null {
  const match = source.match(TYPE_LINE)
  if (!match) return null
  return {
    primary: normalizeType(match[1]),
    secondary: normalizeType(match[2]),
  }
}

// ---------------------------------------------------------------------------
// Evolution / learnset parsers
// ---------------------------------------------------------------------------

// Normalize a species/label into a key that matches base_stats filenames,
// e.g. "SceptileX" and "sceptilex" both become "sceptilex".
export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveTarget(
  species: string,
  entries: PokemonEntry[],
): EvolutionTarget {
  const key = normalizeKey(species)
  const entry = entries.find((e) => normalizeKey(e.name) === key)
  return entry
    ? { name: entry.name, region: entry.region }
    : { name: species.toLowerCase(), region: '' }
}

function parseEvolution(
  line: string,
  entries: PokemonEntry[],
): Evolution | null {
  const trimmed = line.trim()
  if (trimmed.startsWith(';')) return null

  let m: RegExpMatchArray | null

  if (
    (m = trimmed.match(/^dbbw\s+EVOLVE_LEVEL\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)/))
  ) {
    return {
      method: 'level',
      level: Number(m[1]),
      to: resolveTarget(m[2], entries),
    }
  }
  if (
    (m = trimmed.match(
      /^dbww\s+EVOLVE_ITEM\s*,\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/,
    ))
  ) {
    return { method: 'item', item: m[1], to: resolveTarget(m[2], entries) }
  }
  if (
    (m = trimmed.match(
      /^dbww\s+EVOLVE_TRADE\s*,\s*(-1|[A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/,
    ))
  ) {
    return {
      method: 'trade',
      item: m[1] === '-1' ? undefined : m[1],
      to: resolveTarget(m[2], entries),
    }
  }
  if (
    (m = trimmed.match(
      /^dbbw\s+EVOLVE_HAPPINESS\s*,\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/,
    ))
  ) {
    return {
      method: 'happiness',
      condition: m[1],
      to: resolveTarget(m[2], entries),
    }
  }
  if (
    (m = trimmed.match(
      /^dbbbw\s+EVOLVE_STAT\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/,
    ))
  ) {
    return {
      method: 'stat',
      level: Number(m[1]),
      condition: m[2],
      to: resolveTarget(m[3], entries),
    }
  }
  return null
}

// Split an evos_attacks_<region>.asm file into blocks keyed by normalized name.
export function parseEvosAttacksFile(
  source: string,
  entries: PokemonEntry[],
): Map<string, EvosAttacks> {
  const result = new Map<string, EvosAttacks>()
  let key: string | null = null
  let current: EvosAttacks | null = null

  for (const line of source.split('\n')) {
    const label = line.match(/^(\w+)EvosAttacks:/)
    if (label) {
      key = normalizeKey(label[1])
      current = { evolutions: [], moves: [] }
      result.set(key, current)
      continue
    }
    if (!current) continue

    const move = line.match(/^\s*dbw\s+(\d+)\s*,\s*([A-Z0-9_]+)/)
    if (move) {
      current.moves.push({ level: Number(move[1]), move: move[2] })
      continue
    }

    const evo = parseEvolution(line, entries)
    if (evo) current.evolutions.push(evo)
  }

  return result
}

export async function fetchEvosAttacks(
  region: string,
  entries: PokemonEntry[],
): Promise<Map<string, EvosAttacks>> {
  const source = await fetchRaw(`data/pokemon/evos_attacks_${region}.asm`)
  return parseEvosAttacksFile(source, entries)
}

// ---------------------------------------------------------------------------
// Move catalog parsers
// ---------------------------------------------------------------------------

// A move line looks like (effect, power, type, category, accuracy, pp, chance):
//   move EFFECT_NORMAL_HIT, 40, NORMAL, PHYSICAL, 100, 35, 0   ;POUND
const MOVE_LINE =
  /^\s*move\s+\w+\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)\s*,\s*(PHYSICAL|SPECIAL|STATUS)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\d+/

function parseMoveStats(source: string): MoveStats[] {
  const moves: MoveStats[] = []
  for (const line of source.split('\n')) {
    const m = line.match(MOVE_LINE)
    if (!m) continue
    moves.push({
      power: Number(m[1]),
      // Type constants like PSYCHIC_TYPE / CURSE_TYPE drop the _TYPE suffix.
      type:
        m[2] === 'CURSE_TYPE'
          ? 'ghost'
          : m[2].replace(/_TYPE$/, '').toLowerCase(),
      category: m[3].toLowerCase() as MoveDef['category'],
      accuracy: Number(m[4]),
      pp: Number(m[5]),
    })
  }
  return moves
}

// Ordered move id constants from move_constants.asm (drops NO_MOVE). These are
// the canonical keys referenced by learnsets and TM/HM lists, and they are
// index-aligned with moves.asm and names.asm.
function parseMoveConstants(source: string): string[] {
  const keys: string[] = []
  let started = false
  for (const line of source.split('\n')) {
    if (!started) {
      if (/^\s*const_def\b/.test(line)) started = true
      continue
    }
    if (/\bNUM_ATTACKS\b/.test(line)) break
    const m = line.match(/^\s*const\s+([A-Z0-9_]+)/)
    if (m && m[1] !== 'NO_MOVE') keys.push(m[1])
  }
  return keys
}

function parseMoveNames(source: string): string[] {
  const names: string[] = []
  for (const line of source.split('\n')) {
    const m = line.match(/^\s*li\s+"([^"]*)"/)
    if (m) names.push(m[1])
  }
  return names
}

function parseMoveDescriptions(source: string): string[] {
  const labels = [
    ...source.matchAll(/^\s*dw\s+([A-Za-z0-9_]+Description)\b/gm),
  ].map((m) => m[1])

  const textByLabel = new Map<string, string>()
  let currentLabel: string | null = null
  let currentText = ''

  const appendDescriptionFragment = (
    base: string,
    fragment: string,
  ): string => {
    const clean = fragment.replace(/@/g, '').trim()
    if (!clean) return base
    if (!base) return clean
    if (/^[,.;:!?)]/.test(clean) || /[(/-]$/.test(base)) {
      return `${base}${clean}`
    }
    return `${base} ${clean}`
  }

  for (const line of source.split('\n')) {
    const label = line.match(/^([A-Za-z0-9_]+Description):/)
    if (label) {
      if (currentLabel) textByLabel.set(currentLabel, currentText)
      currentLabel = label[1]
      currentText = ''
      continue
    }

    if (!currentLabel) continue
    if (!/^\s*(db|next)\b/.test(line)) continue

    for (const quoted of line.matchAll(/"([^"]*)"/g)) {
      currentText = appendDescriptionFragment(currentText, quoted[1])
    }
  }
  if (currentLabel) textByLabel.set(currentLabel, currentText)

  return labels.map((label) => textByLabel.get(label) ?? '')
}

// Move constants, stats (moves.asm), names (names.asm), and descriptions
// (descriptions.asm) are parallel ordered lists.
export async function fetchMoveCatalog(): Promise<MoveDef[]> {
  const [constSource, statsSource, namesSource, descSource] = await Promise.all(
    [
      fetchRaw(MOVE_CONSTANTS_PATH),
      fetchRaw(MOVES_ASM_PATH),
      fetchRaw(MOVE_NAMES_PATH),
      fetchRaw(MOVE_DESCRIPTIONS_PATH),
    ],
  )
  const keys = parseMoveConstants(constSource)
  const stats = parseMoveStats(statsSource)
  const names = parseMoveNames(namesSource)
  const descriptions = parseMoveDescriptions(descSource)
  if (
    keys.length !== stats.length ||
    stats.length !== names.length ||
    names.length !== descriptions.length
  ) {
    console.warn(
      `Move data length mismatch: constants=${keys.length}, stats=${stats.length}, names=${names.length}, descriptions=${descriptions.length}`,
    )
  }
  const count = Math.min(
    keys.length,
    stats.length,
    names.length,
    descriptions.length,
  )
  const catalog: MoveDef[] = []
  for (let i = 0; i < count; i++) {
    catalog.push({
      key: keys[i],
      name: names[i] ?? keys[i],
      description: descriptions[i] ?? '',
      ...stats[i],
    })
  }
  return catalog
}

// ---------------------------------------------------------------------------
// TM / HM learnset parsers
// ---------------------------------------------------------------------------

// Parse the add_tm / add_hm / add_mt list from item_constants.asm into an
// ordered mapping of move constant -> TM/HM label (tutor moves get no label).
export function parseTmHm(source: string): TmHmDef[] {
  const defs: TmHmDef[] = []
  let started = false
  let tm = 0
  let hm = 0
  let sort = 0
  const pad = (n: number) => String(n).padStart(2, '0')
  for (const line of source.split('\n')) {
    if (!started) {
      if (/^\s*DEF\s+TM01\s+EQU/.test(line)) started = true
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^\s*add_tm\s+([A-Z0-9_]+)/))) {
      tm++
      sort++
      defs.push({ move: m[1], label: `TM${pad(tm)}`, sort })
    } else if ((m = line.match(/^\s*add_hm\s+([A-Z0-9_]+)/))) {
      hm++
      sort++
      defs.push({ move: m[1], label: `HM${pad(hm)}`, sort })
    } else if ((m = line.match(/^\s*add_mt\s+([A-Z0-9_]+)/))) {
      sort++
      defs.push({ move: m[1], label: '', sort })
    }
  }
  return defs
}

function parseProbabilityTable(source: string, label: string): number[] {
  const tableMatch = source.match(
    new RegExp(`${label}:([\\s\\S]*?)assert_table_length`, 'm'),
  )
  if (!tableMatch) {
    throw new Error(`Could not parse ${label} from wild probabilities`)
  }

  const rates: number[] = []
  let previous = 0
  for (const line of tableMatch[1].split('\n')) {
    const match = line.match(/mon_prob\s+(\d+)\s*,\s*\d+/)
    if (!match) continue
    const cumulative = Number(match[1])
    rates.push(cumulative - previous)
    previous = cumulative
  }
  return rates
}

function resolveEncounterPokemon(
  rawSpecies: string,
  entriesByKey: Map<string, PokemonEntry>,
): EncounterPokemon {
  const key = normalizeKey(rawSpecies)
  const entry = entriesByKey.get(key)
  return entry
    ? { name: entry.name, region: entry.region }
    : { name: key, region: '' }
}

function mergeEncounterRates(
  species: string[],
  rates: number[],
  entriesByKey: Map<string, PokemonEntry>,
): EncounterRate[] {
  const totals = new Map<string, EncounterRate>()
  for (let index = 0; index < Math.min(species.length, rates.length); index++) {
    const pokemon = resolveEncounterPokemon(species[index], entriesByKey)
    const key = `${pokemon.region}:${pokemon.name}`
    const existing = totals.get(key)
    if (existing) {
      existing.rate += rates[index]
      continue
    }
    totals.set(key, { pokemon, rate: rates[index] })
  }
  return [...totals.values()].sort(
    (a, b) => b.rate - a.rate || a.pokemon.name.localeCompare(b.pokemon.name),
  )
}

function wildRegionFromPath(path: string): string {
  const match = path.match(/\/([a-z0-9]+)_(grass|water)\.asm$/)
  return match?.[1] ?? ''
}

function parseGrassWildFile(
  sourceRegion: string,
  source: string,
  grassRates: number[],
  entriesByKey: Map<string, PokemonEntry>,
): RouteEncounter[] {
  const routes: RouteEncounter[] = []
  for (const block of source.matchAll(
    /def_grass_wildmons\s+([A-Z0-9_]+)([\s\S]*?)end_grass_wildmons/g,
  )) {
    const route = block[1]
    const body = block[2]
    const slotsByTime: Record<EncounterTime, string[]> = {
      morn: [],
      day: [],
      nite: [],
    }
    let currentTime: EncounterTime | null = null

    for (const line of body.split('\n')) {
      const timeMatch = line.match(/^\s*;\s*(morn|day|nite)\b/)
      if (timeMatch) {
        currentTime = timeMatch[1] as EncounterTime
        continue
      }
      const monMatch = line.match(/^\s*dbw\s+\d+\s*,\s*([A-Z0-9_]+)/)
      if (currentTime && monMatch) {
        slotsByTime[currentTime].push(monMatch[1])
      }
    }

    routes.push({
      region: sourceRegion,
      route,
      grass: (['morn', 'day', 'nite'] as const).map((time) => ({
        time,
        encounters: mergeEncounterRates(
          slotsByTime[time],
          grassRates,
          entriesByKey,
        ),
      })),
      water: [],
      fishing: [],
    })
  }
  return routes
}

function parseWaterWildFile(
  sourceRegion: string,
  source: string,
  waterRates: number[],
  entriesByKey: Map<string, PokemonEntry>,
): RouteEncounter[] {
  const routes: RouteEncounter[] = []
  for (const block of source.matchAll(
    /def_water_wildmons\s+([A-Z0-9_]+)([\s\S]*?)end_water_wildmons/g,
  )) {
    const route = block[1]
    const species = [
      ...block[2].matchAll(/^\s*dbw\s+\d+\s*,\s*([A-Z0-9_]+)/gm),
    ].map((match) => match[1])
    routes.push({
      region: sourceRegion,
      route,
      grass: [],
      water: mergeEncounterRates(species, waterRates, entriesByKey),
      fishing: [],
    })
  }
  return routes
}

interface FishRodEntry {
  cumulativeRate: number
  level: number
  species: string
}

interface TimeFishEntry {
  day: { level: number; species: string }
  nite: { level: number; species: string }
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseRateValue(raw: string): number {
  const match = raw.match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

function parseTimeFishGroups(source: string): Map<number, TimeFishEntry> {
  const result = new Map<number, TimeFishEntry>()
  const blockMatch = source.match(/TimeFishGroups:([\s\S]*)/)
  if (!blockMatch) return result

  for (const line of blockMatch[1].split('\n')) {
    const m = line.match(
      /^\s*dbwbw\s+(\d+)\s*,\s*([A-Z0-9_]+)\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)\s*;\s*(\d+)/,
    )
    if (!m) continue
    const groupIndex = Number(m[5])
    result.set(groupIndex, {
      day: { level: Number(m[1]), species: m[2] },
      nite: { level: Number(m[3]), species: m[4] },
    })
  }

  return result
}

function parseFishRodTable(
  source: string,
  tableLabel: string,
  visited: Set<string> = new Set(),
): FishRodEntry[] {
  if (visited.has(tableLabel)) return []
  visited.add(tableLabel)

  const rows: FishRodEntry[] = []
  const blockMatch = source.match(
    new RegExp(`\\.${tableLabel}:([\\s\\S]*?)(?=\\n\\.[A-Za-z0-9_]+:|$)`),
  )
  if (!blockMatch) return rows

  for (const line of blockMatch[1].split('\n')) {
    const m = line.match(/^\s*dbbw\s+([^,]+)\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)/)
    if (!m) continue
    rows.push({
      cumulativeRate: parseRateValue(m[1]),
      level: Number(m[2]),
      species: m[3],
    })
  }

  if (rows.length > 0) return rows

  const aliasLabel = blockMatch[1].match(/^\s*\.([A-Za-z0-9_]+):/m)?.[1]
  if (!aliasLabel || aliasLabel === tableLabel) return rows
  return parseFishRodTable(source, aliasLabel, visited)
}

function slotRatesFromCumulative(entries: FishRodEntry[]): number[] {
  const rates: number[] = []
  let previous = 0
  for (const entry of entries) {
    rates.push(Math.max(0, entry.cumulativeRate - previous))
    previous = entry.cumulativeRate
  }
  return rates
}

function mapNameToRouteToken(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Za-z])([0-9]+)/g, '$1_$2')
    .replace(/([0-9])([A-Za-z])/g, '$1_$2')
    .toUpperCase()
}

function parseFishGroups(source: string): Map<
  string,
  {
    old: FishRodEntry[]
    good: FishRodEntry[]
    super: FishRodEntry[]
  }
> {
  const groups = new Map<
    string,
    {
      old: FishRodEntry[]
      good: FishRodEntry[]
      super: FishRodEntry[]
    }
  >()

  const tableMatch = source.match(/FishGroups:([\s\S]*?)assert_table_length/m)
  if (!tableMatch) return groups

  for (const m of tableMatch[1].matchAll(
    /fishgroup\s+[^,]+,\s*\.([A-Za-z0-9_]+)_Old\s*,\s*\.([A-Za-z0-9_]+)_Good\s*,\s*\.([A-Za-z0-9_]+)_Super/g,
  )) {
    const oldLabel = m[1]
    const goodLabel = m[2]
    const superLabel = m[3]
    const key = normalizeToken(oldLabel)

    groups.set(key, {
      old: parseFishRodTable(source, `${oldLabel}_Old`),
      good: parseFishRodTable(source, `${goodLabel}_Good`),
      super: parseFishRodTable(source, `${superLabel}_Super`),
    })
  }

  return groups
}

function parseMapFishingGroups(source: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const line of source.split('\n')) {
    const m = line.match(
      /^\s*map\s+([A-Za-z0-9_]+)\s*,[\s\S]*?,\s*FISHGROUP_([A-Z0-9_]+)/,
    )
    if (!m) continue
    const route = mapNameToRouteToken(m[1])
    result.set(route, m[2])
  }
  return result
}

function expandFishRodEncounters(
  rod: FishingRod,
  rodEntries: FishRodEntry[],
  timeGroups: Map<number, TimeFishEntry>,
  entriesByKey: Map<string, PokemonEntry>,
): RouteFishingEncounters[] {
  const slotRates = slotRatesFromCumulative(rodEntries)
  const byTime = new Map<EncounterTime | 'any', EncounterRate[]>()

  for (let index = 0; index < rodEntries.length; index++) {
    const entry = rodEntries[index]
    const slotRate = slotRates[index] ?? 0
    if (slotRate <= 0) continue

    if (entry.species === 'TIME_GROUP') {
      const timeGroup = timeGroups.get(entry.level)
      if (!timeGroup) continue

      const dayPokemon = resolveEncounterPokemon(
        timeGroup.day.species,
        entriesByKey,
      )
      const nitePokemon = resolveEncounterPokemon(
        timeGroup.nite.species,
        entriesByKey,
      )
      byTime.set('day', [
        ...(byTime.get('day') ?? []),
        { pokemon: dayPokemon, rate: slotRate },
      ])
      byTime.set('nite', [
        ...(byTime.get('nite') ?? []),
        { pokemon: nitePokemon, rate: slotRate },
      ])
      continue
    }

    const pokemon = resolveEncounterPokemon(entry.species, entriesByKey)
    byTime.set('any', [
      ...(byTime.get('any') ?? []),
      { pokemon, rate: slotRate },
    ])
  }

  const merged: RouteFishingEncounters[] = []
  for (const [time, rows] of byTime) {
    const totals = new Map<string, EncounterRate>()
    for (const row of rows) {
      const key = `${row.pokemon.region}:${row.pokemon.name}`
      const existing = totals.get(key)
      if (existing) {
        existing.rate += row.rate
      } else {
        totals.set(key, { pokemon: row.pokemon, rate: row.rate })
      }
    }

    merged.push({
      rod,
      time: time === 'any' ? undefined : time,
      encounters: [...totals.values()].sort(
        (a, b) =>
          b.rate - a.rate || a.pokemon.name.localeCompare(b.pokemon.name),
      ),
    })
  }

  return merged
}

function buildPokemonEncounterIndex(
  routes: RouteEncounter[],
): Map<string, PokemonEncounter[]> {
  const encountersByPokemon = new Map<string, PokemonEncounter[]>()

  const pushEncounter = (
    pokemon: EncounterPokemon,
    encounter: PokemonEncounter,
  ) => {
    const list = encountersByPokemon.get(pokemon.name) ?? []
    list.push(encounter)
    encountersByPokemon.set(pokemon.name, list)
  }

  for (const route of routes) {
    for (const grass of route.grass) {
      for (const encounter of grass.encounters) {
        pushEncounter(encounter.pokemon, {
          region: route.region,
          route: route.route,
          method: 'grass',
          time: grass.time,
          rate: encounter.rate,
        })
      }
    }
    for (const encounter of route.water) {
      pushEncounter(encounter.pokemon, {
        region: route.region,
        route: route.route,
        method: 'water',
        rate: encounter.rate,
      })
    }
    for (const fishing of route.fishing) {
      for (const encounter of fishing.encounters) {
        pushEncounter(encounter.pokemon, {
          region: route.region,
          route: route.route,
          method: 'fishing',
          rod: fishing.rod,
          time: fishing.time,
          rate: encounter.rate,
        })
      }
    }
  }

  return encountersByPokemon
}

export async function fetchWildEncounterData(): Promise<WildEncounterData> {
  if (wildEncounterDataPromise) return wildEncounterDataPromise

  wildEncounterDataPromise = (async () => {
    const [tree, probabilitiesSource, fishSource, mapsSource, ...wildSources] =
      await Promise.all([
        fetchTree(),
        fetchRaw(WILD_PROBABILITIES_PATH),
        fetchRaw(WILD_FISH_PATH),
        fetchRaw(MAPS_PATH),
        ...WILD_GRASS_PATHS.map((path) => fetchRaw(path)),
        ...WILD_WATER_PATHS.map((path) => fetchRaw(path)),
      ])

    const entriesByKey = new Map(
      entriesFromTree(tree).map((entry) => [normalizeKey(entry.name), entry]),
    )
    const grassRates = parseProbabilityTable(
      probabilitiesSource,
      'GrassMonProbTable',
    )
    const waterRates = parseProbabilityTable(
      probabilitiesSource,
      'WaterMonProbTable',
    )

    const routesByKey = new Map<string, RouteEncounter>()
    const mergeRoute = (route: RouteEncounter) => {
      const routeKey = `${route.region}:${route.route}`
      const existing = routesByKey.get(routeKey)
      if (!existing) {
        routesByKey.set(routeKey, route)
        return
      }
      if (route.grass.length > 0) existing.grass = route.grass
      if (route.water.length > 0) existing.water = route.water
      if (route.fishing.length > 0) existing.fishing = route.fishing
    }

    for (const [index, source] of wildSources
      .slice(0, WILD_GRASS_PATHS.length)
      .entries()) {
      for (const route of parseGrassWildFile(
        wildRegionFromPath(WILD_GRASS_PATHS[index]),
        source,
        grassRates,
        entriesByKey,
      ))
        mergeRoute(route)
    }
    for (const [index, source] of wildSources
      .slice(WILD_GRASS_PATHS.length)
      .entries()) {
      for (const route of parseWaterWildFile(
        wildRegionFromPath(WILD_WATER_PATHS[index]),
        source,
        waterRates,
        entriesByKey,
      ))
        mergeRoute(route)
    }

    const routeRegions = new Map<string, Set<string>>()
    for (const route of routesByKey.values()) {
      const regions = routeRegions.get(route.route) ?? new Set<string>()
      regions.add(route.region)
      routeRegions.set(route.route, regions)
    }

    const fishGroups = parseFishGroups(fishSource)
    const timeGroups = parseTimeFishGroups(fishSource)
    const routeFishingGroups = parseMapFishingGroups(mapsSource)

    for (const [route, fishGroupRaw] of routeFishingGroups) {
      if (fishGroupRaw === 'NONE') continue
      const regions = routeRegions.get(route)
      if (!regions || regions.size === 0) continue

      const fishGroup = fishGroups.get(normalizeToken(fishGroupRaw))
      if (!fishGroup) continue

      const rods: Array<{ rod: FishingRod; rows: FishRodEntry[] }> = [
        { rod: 'old', rows: fishGroup.old },
        { rod: 'good', rows: fishGroup.good },
        { rod: 'super', rows: fishGroup.super },
      ]

      const fishing = rods.flatMap((rodInfo) =>
        expandFishRodEncounters(
          rodInfo.rod,
          rodInfo.rows,
          timeGroups,
          entriesByKey,
        ),
      )

      for (const region of regions) {
        mergeRoute({
          region,
          route,
          grass: [],
          water: [],
          fishing,
        })
      }
    }

    const routes = [...routesByKey.values()]
    return {
      routes,
      pokemon: buildPokemonEncounterIndex(routes),
    }
  })()

  return wildEncounterDataPromise
}

// The `tmhm` macro line in a base_stats file lists the move constants a Pokémon
// can learn from TMs/HMs (and move tutors).
export function parseTmHmLearnset(source: string): string[] {
  const m = source.match(/^\s*tmhm\s+(.+)$/m)
  if (!m) return []
  return m[1]
    .split(';')[0]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9_]+$/.test(s))
}

// Sprite URLs point straight at GitHub's CDN (already cached by the browser and
// GitHub). When a sprite file is edited its git SHA changes, so we append it as
// a version query to bust stale browser caches without proxying the bytes.
export function spriteUrl(
  name: string,
  kind: 'front' | 'back',
  sha?: string,
): string {
  const url = `${SPRITE_BASE}/${name}/${kind}.png`
  return sha ? `${url}?v=${sha.slice(0, 8)}` : url
}

// ---------------------------------------------------------------------------
// Ability catalog parsers
// ---------------------------------------------------------------------------

// Convert CamelCase ability key to a display name with spaces.
// e.g. "ElementalFist" -> "Elemental Fist", "SwiftSwim" -> "Swift Swim"
function abilityKeyToName(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2')
}

// Parse XxxDesc: db/next lines from descriptions.asm.
// Returns Map<abilityKey, description> with "@" stripped.
function parseAbilityDescriptions(source: string): Map<string, string> {
  const result = new Map<string, string>()
  let currentKey: string | null = null
  let currentText = ''

  for (const line of source.split('\n')) {
    const label = line.match(/^([A-Za-z0-9_]+)Desc:/)
    if (label) {
      if (currentKey) result.set(currentKey, currentText)
      currentKey = label[1]
      currentText = ''
      continue
    }
    if (!currentKey) continue
    if (!/^\s*(db|next)\b/.test(line)) continue
    for (const quoted of line.matchAll(/"([^"]*)"/g)) {
      const fragment = quoted[1].replace(/@/g, '').trim()
      if (!fragment) continue
      currentText = currentText ? `${currentText} ${fragment}` : fragment
    }
  }
  if (currentKey) result.set(currentKey, currentText)

  return result
}

// Parse XxxMons:: dw POKEMON ... dw -1 blocks from abilities.asm.
// Returns [{abilityKey, mons[]}] in file order (pokemon names are lowercased).
function parseAbilityMons(
  source: string,
): { abilityKey: string; mons: string[] }[] {
  const result: { abilityKey: string; mons: string[] }[] = []
  let current: { abilityKey: string; mons: string[] } | null = null

  for (const line of source.split('\n')) {
    const label = line.match(/^([A-Za-z0-9_]+)Mons::/)
    if (label) {
      current = { abilityKey: label[1], mons: [] }
      result.push(current)
      continue
    }
    if (!current) continue
    const dw = line.match(/^\s*dw\s+([A-Z][A-Z0-9_]*)/)
    if (dw) {
      current.mons.push(dw[1].toLowerCase())
    }
  }
  return result
}

export async function fetchAbilityCatalog(): Promise<{
  abilities: AbilityDef[]
  pokemonAbilityMap: Map<string, string>
}> {
  const [abilitiesSource, descriptionsSource] = await Promise.all([
    fetchRaw(ABILITIES_ASM_PATH),
    fetchRaw(ABILITIES_DESCRIPTIONS_PATH),
  ])

  const descriptions = parseAbilityDescriptions(descriptionsSource)
  const abilityMons = parseAbilityMons(abilitiesSource)

  // Build deduplicated ability catalog preserving file order.
  const seen = new Set<string>()
  const abilities: AbilityDef[] = []
  for (const { abilityKey } of abilityMons) {
    if (seen.has(abilityKey)) continue
    seen.add(abilityKey)
    abilities.push({
      key: abilityKey,
      name: abilityKeyToName(abilityKey),
      description: descriptions.get(abilityKey) ?? '',
    })
  }

  // Build pokemon -> ability map; first ability encountered in file order wins.
  const pokemonAbilityMap = new Map<string, string>()
  for (const { abilityKey, mons } of abilityMons) {
    for (const mon of mons) {
      if (!pokemonAbilityMap.has(mon)) {
        pokemonAbilityMap.set(mon, abilityKey)
      }
    }
  }

  return { abilities, pokemonAbilityMap }
}
