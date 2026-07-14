import express from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Load local env files for dev; on Vercel the env vars are injected directly.
// `process.loadEnvFile()` with no argument only reads `.env`, so load the
// common local filenames explicitly (later files do not override earlier ones).
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile?.(file)
  } catch {
    // File missing — try the next one / rely on the process environment.
  }
}

const app = express()

app.use(express.json())

const REPO = 'aaronjeter/CrystalShireEngine'
const REF = 'LevelScaling'
const BASE_STATS_DIR = 'data/pokemon/base_stats'

// Lazily created Supabase client using the service-role key (server-side only).
let supabaseClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient
  const url = process.env.NEXT_PUBLIC_CRYSTAL_SUPABASE_URL
  const key = process.env.CRYSTAL_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_CRYSTAL_SUPABASE_URL or CRYSTAL_SUPABASE_SERVICE_ROLE_KEY environment variable',
    )
  }
  supabaseClient = createClient(url, key, { auth: { persistSession: false } })
  return supabaseClient
}

interface PokemonStats {
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}

interface PokemonTypes {
  primary: string
  secondary: string
}

interface PokemonEntry {
  name: string
  region: string
  path: string
}

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

interface TreeNode {
  path: string
  type: string
  sha: string
}

// Fetch the full repo file tree. Each blob carries its git SHA, which lets us
// detect when an individual file has been edited between cache refreshes.
async function fetchTree(): Promise<TreeNode[]> {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) {
    throw new Error(`GitHub tree request failed (${res.status})`)
  }
  const data = (await res.json()) as { tree?: TreeNode[] }
  return data.tree ?? []
}

function entriesFromTree(tree: TreeNode[]): PokemonEntry[] {
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

// The base stats line looks like: `db  80, 105,  65, 130,  60,  75`
// in file order: hp, attack, defense, speed, special attack, special defense.
const STAT_LINE =
  /^\s*db\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/m

function parseStats(source: string): PokemonStats | null {
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

function parseTypes(source: string): PokemonTypes | null {
  const match = source.match(TYPE_LINE)
  if (!match) return null
  return {
    primary: normalizeType(match[1]),
    secondary: normalizeType(match[2]),
  }
}

interface EvolutionTarget {
  name: string
  region: string
}

interface Evolution {
  method: 'level' | 'item' | 'trade' | 'happiness' | 'stat'
  level?: number
  item?: string
  condition?: string
  to: EvolutionTarget
}

interface Move {
  level: number
  move: string
}

interface EvosAttacks {
  evolutions: Evolution[]
  moves: Move[]
}

// Normalize a species/label into a key that matches base_stats filenames,
// e.g. "SceptileX" and "sceptilex" both become "sceptilex".
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveTarget(species: string, entries: PokemonEntry[]): EvolutionTarget {
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
function parseEvosAttacksFile(
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

// --- Raw content fetchers -------------------------------------------------

async function fetchRaw(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`
  const res = await fetch(url, { headers: { 'User-Agent': 'crystaldex-pokedex' } })
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`)
  return res.text()
}

async function fetchEvosAttacks(
  region: string,
  entries: PokemonEntry[],
): Promise<Map<string, EvosAttacks>> {
  const source = await fetchRaw(`data/pokemon/evos_attacks_${region}.asm`)
  return parseEvosAttacksFile(source, entries)
}

// --- Move catalog ---------------------------------------------------------

const MOVES_ASM_PATH = 'data/moves/moves.asm'
const MOVE_NAMES_PATH = 'data/moves/names.asm'
const MOVE_CONSTANTS_PATH = 'constants/move_constants.asm'
const MOVE_DESCRIPTIONS_PATH = 'data/moves/descriptions.asm'
const ITEM_CONSTANTS_PATH = 'constants/item_constants.asm'

interface MoveDef {
  key: string
  name: string
  description: string
  power: number
  type: string
  category: 'physical' | 'special' | 'status'
  accuracy: number
  pp: number
}

// A move line looks like (effect, power, type, category, accuracy, pp, chance):
//   move EFFECT_NORMAL_HIT, 40, NORMAL, PHYSICAL, 100, 35, 0   ;POUND
const MOVE_LINE =
  /^\s*move\s+\w+\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)\s*,\s*(PHYSICAL|SPECIAL|STATUS)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*\d+/

type MoveStats = Omit<MoveDef, 'name' | 'key' | 'description'>

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
async function fetchMoveCatalog(): Promise<MoveDef[]> {
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

// --- TM / HM learnset -----------------------------------------------------

interface TmHmDef {
  move: string
  label: string
  sort: number
}

// Parse the add_tm / add_hm / add_mt list from item_constants.asm into an
// ordered mapping of move constant -> TM/HM label (tutor moves get no label).
function parseTmHm(source: string): TmHmDef[] {
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
function parseTmHmLearnset(source: string): string[] {
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
const SPRITE_BASE = `https://raw.githubusercontent.com/${REPO}/${REF}/gfx/pokemon`

function spriteUrl(name: string, kind: 'front' | 'back', sha?: string): string {
  const url = `${SPRITE_BASE}/${name}/${kind}.png`
  return sha ? `${url}?v=${sha.slice(0, 8)}` : url
}

// Run async work over a list with a bounded number of concurrent workers.
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        await fn(items[index++])
      }
    },
  )
  await Promise.all(workers)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

// Row shape stored in the `pokemon` table (snake_case columns).
interface PokemonRow {
  name: string
  region: string
  type_1: string
  type_2: string
  hp: number
  attack: number
  defense: number
  special_attack: number
  special_defense: number
  speed: number
  front_sprite: string
  back_sprite: string
  stats_sha: string | null
  evos_sha: string | null
  front_sha: string | null
  back_sha: string | null
}

interface ExistingRow {
  name: string
  stats_sha: string | null
  evos_sha: string | null
  front_sha: string | null
  back_sha: string | null
}

// Fetch the dataset from GitHub and fully refresh Supabase every run.
// This intentionally does not do incremental SHA-based diffing.
async function syncDatabase(): Promise<{
  total: number
  changed: number
  removed: number
}> {
  const syncStartedAt = Date.now()
  console.log('[sync] start')

  const supabase = getSupabase()
  const tree = await fetchTree()
  const entries = entriesFromTree(tree)
  console.log(`[sync] fetched tree: ${tree.length} nodes, ${entries.length} pokemon entries`)

  // Index blobs we need for parsing and sprite cache busting.
  const spriteShaByPath = new Map<string, string>()
  const evosShaByRegion = new Map<string, string>()
  for (const node of tree) {
    if (node.type !== 'blob') continue
    if (
      node.path.startsWith('gfx/pokemon/') &&
      node.path.endsWith('.png')
    ) {
      spriteShaByPath.set(node.path, node.sha)
    } else {
      const evo = node.path.match(
        /^data\/pokemon\/evos_attacks_([a-z0-9]+)\.asm$/,
      )
      if (evo) evosShaByRegion.set(evo[1], node.sha)
    }
  }
  console.log(
    `[sync] indexed assets: sprites=${spriteShaByPath.size}, evo_files=${evosShaByRegion.size}`,
  )

  const catalog = await fetchMoveCatalog()
  const validMoveKeys = new Set(catalog.map((c) => c.key))
  console.log(`[sync] parsed move catalog: ${catalog.length} moves`)

  // Build the TM/HM label map (move constant -> TM##/HM## + display order).
  const tmhmDefs = parseTmHm(await fetchRaw(ITEM_CONSTANTS_PATH))
  const tmhmMap = new Map(
    tmhmDefs.map((d) => [d.move, { label: d.label, sort: d.sort }]),
  )
  console.log(`[sync] parsed tm/hm mapping: ${tmhmDefs.length} entries`)

  // Parse all region evolution/learnset files on every sync.
  const regionsToParse = new Set<string>()
  for (const entry of entries) {
    if (entry.region) regionsToParse.add(entry.region)
  }

  const evosBlocks = new Map<string, Map<string, EvosAttacks>>()
  await mapLimit([...regionsToParse], 8, async (region) => {
    if (!evosShaByRegion.has(region)) return
    evosBlocks.set(region, await fetchEvosAttacks(region, entries))
  })
  console.log(`[sync] parsed evo/attack files for ${evosBlocks.size} regions`)

  // Build full write sets from source files.
  const upserts: PokemonRow[] = []
  const evoWrites: { name: string; evolutions: Evolution[]; moves: Move[] }[] = []
  const tmhmWrites: {
    name: string
    rows: { move_key: string; label: string; sort: number }[]
  }[] = []

  await mapLimit(entries, 16, async (entry) => {
    const frontSha =
      spriteShaByPath.get(`gfx/pokemon/${entry.name}/front.png`) ?? null
    const backSha =
      spriteShaByPath.get(`gfx/pokemon/${entry.name}/back.png`) ?? null
    const block = entry.region
      ? evosBlocks.get(entry.region === 'beta' ? 'alt' : entry.region)?.get(normalizeKey(entry.name))
      : undefined
    evoWrites.push({
      name: entry.name,
      evolutions: block?.evolutions ?? [],
      moves: block?.moves ?? [],
    })

    // Read base_stats file for stats and tm/hm learnset.
    const source = await fetchRaw(entry.path)
    const stats = parseStats(source)
    if (!stats) throw new Error(`Could not parse base stats for ${entry.path}`)
    const types = parseTypes(source)
    if (!types) throw new Error(`Could not parse types for ${entry.path}`)

    upserts.push({
      name: entry.name,
      region: entry.region,
      type_1: types.primary,
      type_2: types.secondary,
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      special_attack: stats.specialAttack,
      special_defense: stats.specialDefense,
      speed: stats.speed,
      front_sprite: spriteUrl(entry.name, 'front', frontSha ?? undefined),
      back_sprite: spriteUrl(entry.name, 'back', backSha ?? undefined),
      stats_sha: null,
      evos_sha: null,
      front_sha: null,
      back_sha: null,
    })

    const rows = parseTmHmLearnset(source)
      .filter((mv) => validMoveKeys.has(mv))
      .map((mv) => {
        const info = tmhmMap.get(mv)
        return {
          move_key: mv,
          label: info?.label ?? '',
          sort: info?.sort ?? 9999,
        }
      })
    tmhmWrites.push({ name: entry.name, rows })
  })
  console.log(
    `[sync] built write sets: pokemon=${upserts.length}, evo_sets=${evoWrites.length}, tmhm_sets=${tmhmWrites.length}`,
  )

  // Full refresh: clear tables, then repopulate from source.
  console.log('[sync] clearing database tables')
  const clearTmhm = await supabase.from('pokemon_tmhm').delete().gt('id', 0)
  if (clearTmhm.error) throw new Error(`Clear tm/hm failed: ${clearTmhm.error.message}`)
  const clearPokeMoves = await supabase.from('pokemon_moves').delete().gt('id', 0)
  if (clearPokeMoves.error) {
    throw new Error(`Clear learnset failed: ${clearPokeMoves.error.message}`)
  }
  const clearEvos = await supabase.from('evolutions').delete().gt('id', 0)
  if (clearEvos.error) throw new Error(`Clear evolutions failed: ${clearEvos.error.message}`)
  const clearPokemon = await supabase.from('pokemon').delete().neq('name', '')
  if (clearPokemon.error) throw new Error(`Clear pokemon failed: ${clearPokemon.error.message}`)
  const clearMoves = await supabase.from('moves').delete().neq('key', '')
  if (clearMoves.error) throw new Error(`Clear moves failed: ${clearMoves.error.message}`)
  console.log('[sync] clear complete')

  console.log('[sync] inserting move catalog')
  for (const batch of chunk(catalog, 500)) {
    const { error } = await supabase.from('moves').insert(batch)
    if (error) throw new Error(`Insert moves catalog failed: ${error.message}`)
  }

  console.log('[sync] inserting pokemon rows')
  for (const batch of chunk(upserts, 500)) {
    const { error } = await supabase.from('pokemon').insert(batch)
    if (error) throw new Error(`Insert pokemon failed: ${error.message}`)
  }

  const evoRows = evoWrites.flatMap((e) =>
    e.evolutions.map((ev) => ({
      pokemon_name: e.name,
      method: ev.method,
      level: ev.level ?? null,
      item: ev.item ?? null,
      condition: ev.condition ?? null,
      to_name: ev.to.name,
      to_region: ev.to.region,
    })),
  )
  for (const batch of chunk(evoRows, 500)) {
    const { error } = await supabase.from('evolutions').insert(batch)
    if (error) throw new Error(`Insert evolutions failed: ${error.message}`)
  }
  console.log(`[sync] inserted evolutions: ${evoRows.length} rows`)

  // Learnset rows link a Pokémon to a move in the shared catalog.
  let skippedMoves = 0
  const learnsetRows = evoWrites.flatMap((e) =>
    e.moves
      .filter((mv) => {
        const known = validMoveKeys.has(mv.move)
        if (!known) skippedMoves++
        return known
      })
      .map((mv) => ({
        pokemon_name: e.name,
        move_key: mv.move,
        level: mv.level,
      })),
  )
  for (const batch of chunk(learnsetRows, 500)) {
    const { error } = await supabase.from('pokemon_moves').insert(batch)
    if (error) throw new Error(`Insert learnset failed: ${error.message}`)
  }
  console.log(`[sync] inserted level-up learnset rows: ${learnsetRows.length}`)
  if (skippedMoves > 0) {
    console.warn(`Skipped ${skippedMoves} learnset entries with unknown moves.`)
  }

  const tmhmRows = tmhmWrites.flatMap((t) =>
    t.rows.map((r) => ({
      pokemon_name: t.name,
      move_key: r.move_key,
      label: r.label,
      sort: r.sort,
    })),
  )
  for (const batch of chunk(tmhmRows, 500)) {
    const { error } = await supabase.from('pokemon_tmhm').insert(batch)
    if (error) throw new Error(`Insert tm/hm failed: ${error.message}`)
  }
  console.log(`[sync] inserted tm/hm rows: ${tmhmRows.length}`)

  const durationMs = Date.now() - syncStartedAt
  console.log(`[sync] complete in ${durationMs}ms`)

  return {
    total: entries.length,
    changed: upserts.length,
    removed: 0,
  }
}

// List all Pokémon (name + region) from the database.
app.get('/api/pokemon', async (_req, res) => {
  const startedAt = Date.now()
  console.log('[pokemon:list] request start')
  try {
    const supabase = getSupabase()
    console.log('[pokemon:list] querying pokemon table')
    const { data, error } = await supabase
      .from('pokemon')
      .select('name, region, front_sprite, type_1, type_2')
      .order('name')
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      name: string
      region: string
      front_sprite: string
      type_1: string
      type_2: string
    }[]
    const payload = rows.map((row) => ({
      name: row.name,
      region: row.region,
      frontSprite: row.front_sprite,
      types: row.type_1 === row.type_2 ? [row.type_1] : [row.type_1, row.type_2],
    }))
    console.log(`[pokemon:list] returning ${data?.length ?? 0} rows in ${Date.now() - startedAt}ms`)
    res.json(payload)
  } catch (err) {
    console.error(
      `[pokemon:list] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    )
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load Pokémon list',
    })
  }
})

// Full detail for a single Pokémon from the database.
app.get('/api/pokemon/:name', async (req, res) => {
  const startedAt = Date.now()
  try {
    const supabase = getSupabase()
    const name = req.params.name.toLowerCase()
    console.log(`[pokemon:detail] request start for ${name}`)

    console.log(`[pokemon:detail] fetching base pokemon row for ${name}`)
    const { data: p, error } = await supabase
      .from('pokemon')
      .select('*')
      .eq('name', name)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!p) {
      console.log(`[pokemon:detail] not found: ${name}`)
      res.status(404).json({ error: 'Pokémon not found' })
      return
    }

    console.log(`[pokemon:detail] fetching evo + move key data for ${name}`)
    const [evoRes, moveRes, tmhmRes] = await Promise.all([
      supabase.from('evolutions').select('*').eq('pokemon_name', name).order('id'),
      supabase
        .from('pokemon_moves')
        .select('level, move_key')
        .eq('pokemon_name', name)
        .order('level'),
      supabase
        .from('pokemon_tmhm')
        .select('label, sort, move_key')
        .eq('pokemon_name', name)
        .order('sort'),
    ])
    if (evoRes.error) throw new Error(evoRes.error.message)
    if (moveRes.error) throw new Error(moveRes.error.message)
    if (tmhmRes.error) throw new Error(tmhmRes.error.message)

    const moveKeys = new Set<string>()
    for (const row of moveRes.data ?? []) moveKeys.add(row.move_key)
    for (const row of tmhmRes.data ?? []) moveKeys.add(row.move_key)

    const moveDefsByKey = new Map<string, MoveDef>()
    if (moveKeys.size > 0) {
      console.log(`[pokemon:detail] fetching ${moveKeys.size} move definitions`)
      const { data: defs, error: defsError } = await supabase
        .from('moves')
        .select('key, name, description, power, type, category, accuracy, pp')
        .in('key', [...moveKeys])
      if (defsError) throw new Error(defsError.message)
      for (const def of defs ?? []) {
        moveDefsByKey.set(def.key, def as MoveDef)
      }
    }

    console.log(
      `[pokemon:detail] response for ${name}: evolutions=${evoRes.data?.length ?? 0}, level_moves=${moveRes.data?.length ?? 0}, tmhm_moves=${tmhmRes.data?.length ?? 0}, ${Date.now() - startedAt}ms`,
    )

    res.json({
      name: p.name,
      region: p.region,
      types: p.type_1 === p.type_2 ? [p.type_1] : [p.type_1, p.type_2],
      stats: {
        hp: p.hp,
        attack: p.attack,
        defense: p.defense,
        specialAttack: p.special_attack,
        specialDefense: p.special_defense,
        speed: p.speed,
      },
      evolutions: (evoRes.data ?? []).map((e) => ({
        method: e.method,
        level: e.level ?? undefined,
        item: e.item ?? undefined,
        condition: e.condition ?? undefined,
        to: { name: e.to_name, region: e.to_region },
      })),
      moves: (moveRes.data ?? []).map((row) => {
        const move = moveDefsByKey.get(row.move_key)
        return {
          level: row.level,
          key: row.move_key,
          name: move?.name ?? row.move_key,
          description: move?.description ?? '',
          power: move?.power ?? 0,
          type: move?.type ?? '',
          category: move?.category ?? '',
          accuracy: move?.accuracy ?? 0,
          pp: move?.pp ?? 0,
        }
      }),
      tmMoves: (tmhmRes.data ?? []).map((row) => {
        const move = moveDefsByKey.get(row.move_key)
        return {
          label: row.label,
          key: row.move_key,
          name: move?.name ?? row.move_key,
          description: move?.description ?? '',
          power: move?.power ?? 0,
          type: move?.type ?? '',
          category: move?.category ?? '',
          accuracy: move?.accuracy ?? 0,
          pp: move?.pp ?? 0,
        }
      }),
      sprites: { front: p.front_sprite, back: p.back_sprite },
    })
  } catch (err) {
    console.error(
      `[pokemon:detail] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    )
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load Pokémon',
    })
  }
})

// List all moves in the catalog.
app.get('/api/moves', async (_req, res) => {
  const startedAt = Date.now()
  console.log('[moves:list] request start')
  try {
    const supabase = getSupabase()
    console.log('[moves:list] querying moves table')
    const { data, error } = await supabase
      .from('moves')
      .select('key, name, description, power, type, category, accuracy, pp')
      .order('name')
    if (error) throw new Error(error.message)
    console.log(
      `[moves:list] returning ${data?.length ?? 0} rows in ${Date.now() - startedAt}ms`,
    )
    res.json(data ?? [])
  } catch (err) {
    console.error(
      `[moves:list] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    )
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load moves',
    })
  }
})

// Full detail for a single move.
app.get('/api/moves/:key', async (req, res) => {
  const startedAt = Date.now()
  try {
    const supabase = getSupabase()
    const key = req.params.key.toUpperCase()
    console.log(`[moves:detail] request start for ${key}`)

    console.log(`[moves:detail] querying move ${key}`)
    const { data, error } = await supabase
      .from('moves')
      .select('key, name, description, power, type, category, accuracy, pp')
      .eq('key', key)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) {
      console.log(`[moves:detail] not found: ${key}`)
      res.status(404).json({ error: 'Move not found' })
      return
    }

    console.log(`[moves:detail] success for ${key} in ${Date.now() - startedAt}ms`)
    res.json(data)
  } catch (err) {
    console.error(
      `[moves:detail] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    )
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load move',
    })
  }
})

// Sync the database from GitHub. Triggered by the Vercel daily cron (which
// sends `Authorization: Bearer <CRON_SECRET>`) or manually with the same token.
app.get('/api/sync', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (secret && req.header('authorization') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const result = await syncDatabase()
    res.json({ status: 'ok', ...result })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Sync failed',
    })
  }
})

// About: version + last sync time
app.get('/api/about', async (_req, res) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('pokemon')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    res.json({
      version: '0.7.13',
      lastSynced: data?.updated_at ?? null,
    })
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load about info',
    })
  }
})

// Health check
app.get('/api/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Local dev only: run a standalone server so Vite can proxy to it. On Vercel the
// exported app is used directly as the serverless handler, and the daily sync is
// driven by the Vercel cron hitting /api/sync.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 8080
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`)
  })
}

export default app
