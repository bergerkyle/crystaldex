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

interface TreeNode {
  path: string
  type: string
  sha: string
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
  const res = await fetch(url, { headers: { 'User-Agent': 'crystaldex-pokedex' } })
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

function resolveTarget(species: string, entries: PokemonEntry[]): EvolutionTarget {
  const key = normalizeKey(species)
  const entry = entries.find((e) => normalizeKey(e.name) === key)
  return entry
    ? { name: entry.name, region: entry.region }
    : { name: species.toLowerCase(), region: '' }
}

function parseEvolution(line: string, entries: PokemonEntry[]): Evolution | null {
  const trimmed = line.trim()
  if (trimmed.startsWith(';')) return null

  let m: RegExpMatchArray | null

  if ((m = trimmed.match(/^dbbw\s+EVOLVE_LEVEL\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)/))) {
    return { method: 'level', level: Number(m[1]), to: resolveTarget(m[2], entries) }
  }
  if ((m = trimmed.match(/^dbww\s+EVOLVE_ITEM\s*,\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/))) {
    return { method: 'item', item: m[1], to: resolveTarget(m[2], entries) }
  }
  if ((m = trimmed.match(/^dbww\s+EVOLVE_TRADE\s*,\s*(-1|[A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/))) {
    return {
      method: 'trade',
      item: m[1] === '-1' ? undefined : m[1],
      to: resolveTarget(m[2], entries),
    }
  }
  if ((m = trimmed.match(/^dbbw\s+EVOLVE_HAPPINESS\s*,\s*([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/))) {
    return { method: 'happiness', condition: m[1], to: resolveTarget(m[2], entries) }
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
  const labels = [...source.matchAll(/^\s*dw\s+([A-Za-z0-9_]+Description)\b/gm)].map(
    (m) => m[1],
  )

  const textByLabel = new Map<string, string>()
  let currentLabel: string | null = null
  let currentText = ''

  const appendDescriptionFragment = (base: string, fragment: string): string => {
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
  const [constSource, statsSource, namesSource, descSource] = await Promise.all([
    fetchRaw(MOVE_CONSTANTS_PATH),
    fetchRaw(MOVES_ASM_PATH),
    fetchRaw(MOVE_NAMES_PATH),
    fetchRaw(MOVE_DESCRIPTIONS_PATH),
  ])
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
  const count = Math.min(keys.length, stats.length, names.length, descriptions.length)
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
export function spriteUrl(name: string, kind: 'front' | 'back', sha?: string): string {
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
function parseAbilityMons(source: string): { abilityKey: string; mons: string[] }[] {
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
