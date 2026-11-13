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
import { PNG } from 'pngjs'

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
const SPRITE_CONSTANTS_PATH = 'constants/sprite_constants.asm'
const SPRITE_DATA_PATH = 'data/sprites/sprites.asm'
const NPC_PALETTES_PATH = 'gfx/overworld/npc_sprites.pal'

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

// A trainer fought with a different party depending on the player's progress:
// gym leaders scale with the badge count and the League uses rematch teams.
export interface TrainerVariant {
  label: string
  minBadges: number | null
  maxBadges: number | null
  order: number
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
  // Overworld sprite sheet (first frame is the front-facing pose).
  spriteUrl: string | null
  // Three hex colors (skin, clothes, outline) the overworld sprite is tinted with.
  spritePalette: string | null
  // `<CLASS>/<ID>` of the primary variant this trainer is grouped under.
  group: string
  variant: TrainerVariant | null
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
  sprite?: string
  palette?: string
  variant?: TrainerVariant
}

const MAX_BADGES = 24
const BADGE_VAR_RE = /^\s*readvar\s+VAR_BADGES\b/
const LABEL_RE = /^(\.[A-Za-z_]\w*):?\s*$|^([A-Za-z_]\w*)::?\s*$/
const LOADTRAINER_RE = /^\s*loadtrainer\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)/
const BADGE_BRANCH_RE =
  /^\s*(ifgreater|ifless|ifequal|sjump)\s+(?:(\d+)\s*,\s*)?(\.\w+)/

function badgeRangeLabel(min: number, max: number): string {
  if (max >= MAX_BADGES) return `${min}+ badges`
  return min === max ? `${min} badges` : `${min}–${max} badges`
}

// Works out which party each loadtrainer ID is used for. Scripts pick a party
// either from the badge count (readvar VAR_BADGES + ifgreater ladders) or, for
// the Elite Four and Champion, from LeagueRematchCheckScript. A loadtrainer not
// reached through either is a follow-up battle in the same fight.
function findScriptVariants(source: string): Map<string, TrainerVariant> {
  const usesLeague = source.includes('LeagueRematchCheckScript')
  const result = new Map<string, TrainerVariant>()
  if (!usesLeague && !/readvar\s+VAR_BADGES/.test(source)) return result

  const lines = source.split('\n')
  const loads: { line: number; key: string; label: string }[] = []
  let currentLabel = ''
  lines.forEach((text, line) => {
    const label = LABEL_RE.exec(text)
    if (label) currentLabel = label[1] ?? label[2]
    const load = LOADTRAINER_RE.exec(text)
    if (load) {
      loads.push({ line, key: `${load[1]}/${load[2]}`, label: currentLabel })
    }
  })
  const firstLoadAfter = (line: number, label: string) =>
    loads.find((l) => l.line > line && l.label === label)

  const badgeRanges = new Map<string, [number, number]>()
  lines.forEach((text, line) => {
    if (!BADGE_VAR_RE.test(text)) return
    const labelForBadges: (string | null)[] = Array(MAX_BADGES + 1).fill(null)
    for (let i = line + 1; i < lines.length; i += 1) {
      const m = BADGE_BRANCH_RE.exec(lines[i])
      if (!m) break
      const n = m[2] === undefined ? 0 : Number(m[2])
      for (let badges = 0; badges <= MAX_BADGES; badges += 1) {
        if (labelForBadges[badges] !== null) continue
        const hit =
          m[1] === 'sjump' ||
          (m[1] === 'ifgreater' && badges > n) ||
          (m[1] === 'ifless' && badges < n) ||
          (m[1] === 'ifequal' && badges === n)
        if (hit) labelForBadges[badges] = m[3]
      }
    }
    labelForBadges.forEach((label, badges) => {
      if (!label) return
      const load = firstLoadAfter(line, label)
      if (!load) return
      const range = badgeRanges.get(load.key)
      badgeRanges.set(
        load.key,
        range
          ? [Math.min(range[0], badges), Math.max(range[1], badges)]
          : [badges, badges],
      )
    })
  })
  for (const [key, [min, max]] of badgeRanges) {
    result.set(key, {
      label: badgeRangeLabel(min, max),
      minBadges: min,
      maxBadges: max,
      order: min,
    })
  }

  if (usesLeague) {
    const rematchLabels = new Set<string>()
    const firstLabels = new Set<string>()
    lines.forEach((text, line) => {
      if (!/callstd\s+LeagueRematchCheckScript/.test(text)) return
      for (let i = line + 1; i < Math.min(lines.length, line + 4); i += 1) {
        const rematch = /^\s*iftrue\s+(\.\w+)/.exec(lines[i])
        if (rematch) rematchLabels.add(rematch[1])
        const first = /^\s*sjump\s+(\.\w+)/.exec(lines[i])
        if (first) firstLabels.add(first[1])
      }
    })
    for (const load of loads) {
      if (result.has(load.key)) continue
      const variant = rematchLabels.has(load.label)
        ? { label: 'League rematch', order: 1 }
        : firstLabels.has(load.label)
          ? { label: 'First League run', order: 0 }
          : { label: 'Second battle', order: 2 }
      result.set(load.key, { ...variant, minBadges: null, maxBadges: null })
    }
  }
  return result
}

// SPRITE_* constant -> default palette name, from the OverworldSprites table
// (entries follow the order of the SPRITE_* constants).
function parseSpriteDefaultPalettes(
  constantsSource: string,
  dataSource: string,
): Map<string, string> {
  const constants = [...constantsSource.matchAll(/^\s*const\s+(SPRITE_\w+)/gm)]
  const pals = [
    ...dataSource.matchAll(/^\s*overworld_sprite\s+.*,\s*PAL_OW_(\w+)\s*$/gm),
  ]
  const result = new Map<string, string>()
  // SPRITE_NONE is index 0 and has no table entry.
  pals.forEach((m, i) => {
    const constant = constants[i + 1]?.[1]
    if (constant) result.set(constant, m[1])
  })
  return result
}

// Palette name -> `RRGGBB,RRGGBB,RRGGBB` for color slots 1-3 (slot 0 is the
// transparent background), taken from the daytime set.
function parseNpcPalettes(source: string): Map<string, string> {
  const palettes = new Map<string, string>()
  let section = ''
  for (const line of source.split('\n')) {
    const header = /^;\s*(\w+)\s*$/.exec(line.trim())
    if (header) {
      section = header[1].toLowerCase()
      continue
    }
    if (section !== 'day') continue
    const row = /^\s*RGB\s+(.*?)\s*;\s*(.+?)\s*$/.exec(line)
    if (!row) continue
    const values = row[1].split(',').map((v) => Number(v.trim()))
    if (values.length < 12) continue
    const hex = (start: number) =>
      values
        .slice(start, start + 3)
        .map((v) =>
          Math.round((v * 255) / 31)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    palettes.set(
      row[2].toUpperCase().replace(/\s+/g, '_'),
      [hex(3), hex(6), hex(9)].join(','),
    )
  }
  return palettes
}

// Script label -> SPRITE_* constant for every object event in a map.
function parseObjectSprites(source: string): Map<string, string> {
  const sprites = new Map<string, string>()
  for (const m of source.matchAll(/^\s*object_event\s+(.*)$/gm)) {
    const fields = m[1].split(',').map((field) => field.trim())
    const sprite = fields.find((field) => field.startsWith('SPRITE_'))
    const label = fields.at(-2)
    if (sprite && label && /^[A-Za-z_]\w*$/.test(label)) {
      sprites.set(label, sprite)
    }
  }
  return sprites
}

// Gym trainers have an easier and a harder copy of each object event. The
// engine hides one of them by badge count (UpdateWorldLevelsScript).
const HIDE_FLAG_VARIANTS: Record<string, TrainerVariant> = {
  EVENT_HIDE_EASY_TRAINERS: {
    label: badgeRangeLabel(0, 3),
    minBadges: 0,
    maxBadges: 3,
    order: 0,
  },
  EVENT_HIDE_MEDIUM_TRAINERS: {
    label: badgeRangeLabel(4, MAX_BADGES),
    minBadges: 4,
    maxBadges: MAX_BADGES,
    order: 4,
  },
}

// Script label -> EVENT_HIDE_* flag that hides the object event.
function parseObjectHideFlags(source: string): Map<string, string> {
  const flags = new Map<string, string>()
  for (const m of source.matchAll(/^\s*object_event\s+(.*)$/gm)) {
    const fields = m[1].split(',').map((field) => field.trim())
    const flag = fields.at(-1)
    const label = fields.at(-2)
    if (flag && label && flag in HIDE_FLAG_VARIANTS) flags.set(label, flag)
  }
  return flags
}

// Script label -> PAL_NPC_* override of its object event, if any.
function parseObjectPalettes(source: string): Map<string, string> {
  const palettes = new Map<string, string>()
  for (const m of source.matchAll(/^\s*object_event\s+(.*)$/gm)) {
    const fields = m[1].split(',').map((field) => field.trim())
    const pal = fields.find((field) => field.startsWith('PAL_NPC_'))
    const label = fields.at(-2)
    if (pal && label && pal !== 'PAL_NPC_DEFAULT') {
      palettes.set(label, pal.replace(/^PAL_NPC_/, ''))
    }
  }
  return palettes
}

// Leader fights live in helper scripts (`scall RoxanneFight`), so walk up from
// the script holding the loadtrainer to the one an object event points at.
function findObjectScript(
  source: string,
  start: string,
  objectLabels: Set<string>,
): string | undefined {
  const blocks = [...source.matchAll(/^([A-Za-z_]\w*)::?\s*$/gm)].map(
    (m, i, all) => ({
      label: m[1],
      body: source.slice(
        (m.index ?? 0) + m[0].length,
        all[i + 1]?.index ?? source.length,
      ),
    }),
  )
  const seen = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const label = queue.shift() as string
    if (objectLabels.has(label)) return label
    const wordRe = new RegExp(`\\b${label}\\b`)
    for (const block of blocks) {
      if (seen.has(block.label) || !wordRe.test(block.body)) continue
      seen.add(block.label)
      queue.push(block.label)
    }
  }
  return undefined
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
    const objectSprites = parseObjectSprites(source)
    const hideFlags = parseObjectHideFlags(source)
    const objectPalettes = parseObjectPalettes(source)
    const objectLabels = new Set(objectSprites.keys())
    const variants = findScriptVariants(source)
    const topLabels = [...source.matchAll(/^([A-Za-z_]\w*)::?\s*$/gm)]

    for (const m of source.matchAll(TRAINER_REF_RE)) {
      const key = `${m[1]}/${m[2]}`
      const placement = placements.get(key) ?? { locations: [], category }
      const enclosing = topLabels
        .filter((l) => (l.index ?? 0) < (m.index ?? 0))
        .at(-1)
      const objectLabel = enclosing
        ? findObjectScript(source, enclosing[1], objectLabels)
        : undefined
      const sprite = objectLabel ? objectSprites.get(objectLabel) : undefined
      if (sprite && !placement.sprite) {
        placement.sprite = sprite
        placement.palette = objectPalettes.get(objectLabel as string)
      }
      const hideFlag = enclosing ? hideFlags.get(enclosing[1]) : undefined
      const variant =
        variants.get(key) ??
        (hideFlag ? HIDE_FLAG_VARIANTS[hideFlag] : undefined)
      if (variant && !placement.variant) placement.variant = variant
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

const SPRITE_FRAME = 16
const GRAY_THRESHOLDS = [212, 128, 43]

// Tints the first (front-facing) frame of a 2-bit grayscale overworld sheet
// with its palette and returns it as a transparent PNG data URL.
function renderPalettedSprite(sheet: Buffer, palette: string): string {
  const source = PNG.sync.read(sheet)
  const colors = palette
    .split(',')
    .map((hex) =>
      [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)),
    )
  const out = new PNG({ width: SPRITE_FRAME, height: SPRITE_FRAME })
  for (let y = 0; y < SPRITE_FRAME; y += 1) {
    for (let x = 0; x < SPRITE_FRAME; x += 1) {
      const from = (y * source.width + x) * 4
      const to = (y * SPRITE_FRAME + x) * 4
      const found = GRAY_THRESHOLDS.findIndex((t) => source.data[from] >= t)
      const slot = found === -1 ? 3 : found
      if (slot === 0 || source.data[from + 3] === 0) continue
      const [r, g, b] = colors[slot - 1]
      out.data[to] = r
      out.data[to + 1] = g
      out.data[to + 2] = b
      out.data[to + 3] = 255
    }
  }
  return `data:image/png;base64,${PNG.sync.write(out).toString('base64')}`
}

// Replaces each sprite sheet URL with a ready-to-display tinted frame so the
// client needs no image processing.
async function renderTrainerSprites(trainers: TrainerDef[]) {
  const sheets = new Map<string, Promise<Buffer | null>>()
  const load = (url: string) => {
    let sheet = sheets.get(url)
    if (!sheet) {
      sheet = fetch(url, { headers: { 'User-Agent': 'crystaldex-pokedex' } })
        .then(async (res) =>
          res.ok ? Buffer.from(await res.arrayBuffer()) : null,
        )
        .catch(() => null)
      sheets.set(url, sheet)
    }
    return sheet
  }
  const rendered = new Map<string, Promise<string | null>>()
  for (const t of trainers) {
    if (!t.spriteUrl) continue
    const sheetUrl = t.spriteUrl
    const palette = t.spritePalette ?? '9a9a9a,5a5a5a,000000'
    const id = `${sheetUrl}|${palette}`
    if (!rendered.has(id)) {
      rendered.set(
        id,
        load(sheetUrl).then((sheet) => {
          try {
            return sheet ? renderPalettedSprite(sheet, palette) : null
          } catch {
            return null
          }
        }),
      )
    }
    t.spriteUrl = (await rendered.get(id)) ?? null
  }
}

// Trainers without an object event of their own (e.g. fought via loadtrainer
// from a script) borrow the most common sprite used by their class.
function fillClassSprites(trainers: TrainerDef[]) {
  const counts = new Map<string, Map<string, number>>()
  for (const t of trainers) {
    if (!t.spriteUrl) continue
    const byUrl = counts.get(t.classKey) ?? new Map<string, number>()
    byUrl.set(t.spriteUrl, (byUrl.get(t.spriteUrl) ?? 0) + 1)
    counts.set(t.classKey, byUrl)
  }
  for (const t of trainers) {
    if (t.spriteUrl) continue
    const byUrl = counts.get(t.classKey)
    if (!byUrl) continue
    t.spriteUrl = [...byUrl.entries()].sort((a, b) => b[1] - a[1])[0][0]
    t.spritePalette =
      trainers.find((o) => o.spriteUrl === t.spriteUrl)?.spritePalette ?? null
  }
}

// Variants of one fight (same class and name, picked by a script) are grouped
// under the earliest variant.
function groupTrainerVariants(trainers: TrainerDef[]) {
  const byGroup = new Map<string, TrainerDef[]>()
  for (const t of trainers) {
    if (!t.variant) continue
    const groupId = `${t.classKey}|${t.name}|${t.locations.map((l) => l.route).join(',')}`
    byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), t])
  }
  for (const members of byGroup.values()) {
    if (members.length < 2) {
      for (const t of members) t.variant = null
      continue
    }
    members.sort((a, b) => (a.variant?.order ?? 0) - (b.variant?.order ?? 0))
    for (const t of members) t.group = members[0].key
  }
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
    spriteConstantsSource,
    spriteDataSource,
    npcPalettesSource,
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
    fetchRaw(SPRITE_CONSTANTS_PATH),
    fetchRaw(SPRITE_DATA_PATH),
    fetchRaw(NPC_PALETTES_PATH),
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
  const spriteFiles = new Set(
    tree
      .map((node) => /^gfx\/sprites\/(.+)\.png$/.exec(node.path)?.[1])
      .filter((name): name is string => !!name),
  )
  const spriteUrlFor = (constant: string | undefined): string | null => {
    const name = constant?.replace(/^SPRITE_/, '').toLowerCase()
    return name && spriteFiles.has(name)
      ? `${TRAINER_PIC_BASE}/gfx/sprites/${name}.png`
      : null
  }

  const defaultPalettes = parseSpriteDefaultPalettes(
    spriteConstantsSource,
    spriteDataSource,
  )
  const npcPalettes = parseNpcPalettes(npcPalettesSource)
  const paletteFor = (
    constant: string | undefined,
    override: string | undefined,
  ): string | null =>
    npcPalettes.get(
      override ?? (constant ? (defaultPalettes.get(constant) ?? '') : ''),
    ) ?? null

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

  // Trainers whose object event uses the generic `ObjectEvent` script.
  const spriteOverrides: Record<string, [string, string]> = {
    'MYSTICALMAN/EUSINE': ['SPRITE_SUPER_NERD', 'BLUE'],
  }
  const spriteFor = (
    classKey: string,
    id: string,
    placement: TrainerPlacement,
  ) => {
    const override = spriteOverrides[`${classKey}/${id}`]
    const candidates: [string, string | undefined][] = [
      ...(override ? [override as [string, string]] : []),
      [placement.sprite ?? '', placement.palette],
      [`SPRITE_${classKey}`, undefined],
      [`SPRITE_${classKey.replace(/\d+$/, '')}`, undefined],
      [`SPRITE_${id.replace(/_?\d+$/, '')}`, undefined],
    ]
    for (const [constant, override] of candidates) {
      const url = spriteUrlFor(constant || undefined)
      if (url) {
        return { spriteUrl: url, spritePalette: paletteFor(constant, override) }
      }
    }
    return { spriteUrl: null, spritePalette: null }
  }

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
        ...spriteFor(classKey, party.id, placement),
        group: key,
        variant: placement.variant ?? null,
        locations: placement.locations,
        normal,
        hard: party.hard ? resolveTeam(party.hard) : null,
      })
    }
  })

  fillClassSprites(trainers)
  groupTrainerVariants(trainers)
  await renderTrainerSprites(trainers)
  return { classes, trainers }
}
