// All Supabase database operations: sync and per-endpoint query functions.

import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  type AbilityDef,
  type PokemonEncounter,
  type RouteEncounter,
  type EvosAttacks,
  type Evolution,
  type Move,
  type MoveDef,
  type PokemonEntry,
  ITEM_CONSTANTS_PATH,
  entriesFromTree,
  fetchAbilityCatalog,
  fetchEvosAttacks,
  fetchMoveCatalog,
  fetchWildEncounterData,
  resetWildEncounterCache,
  fetchRaw,
  fetchTree,
  normalizeKey,
  parseStats,
  parseTmHm,
  parseTmHmLearnset,
  parseShinyPalette,
  parseTypes,
  spriteUrl,
} from './parser.js'

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

let supabaseClient: SupabaseClient | null = null

function formatDateVersion(source: string): string | null {
  const parsed = new Date(source)
  if (Number.isNaN(parsed.getTime())) return null
  const year = String(parsed.getUTCFullYear() - 2026)
  const month = String(parsed.getUTCMonth() + 1).padStart(1, '0')
  const day = String(parsed.getUTCDate()).padStart(1, '0')
  return `${year}.${month}.${day}`
}

function resolveCommitDateVersion(): string {
  const envTimestamp =
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP ??
    process.env.GIT_COMMIT_TIMESTAMP ??
    null
  if (envTimestamp) {
    const fromEnv = formatDateVersion(envTimestamp)
    if (fromEnv) return fromEnv
  }

  try {
    const commitIso = execSync('git log -1 --format=%cI', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const fromGit = formatDateVersion(commitIso)
    if (fromGit) return fromGit
  } catch {
    // Fall through to a deterministic fallback when git metadata is unavailable.
  }

  return '0.0.0'
}

const APP_VERSION = resolveCommitDateVersion()

export function getSupabase(): SupabaseClient {
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export async function mapLimit<T>(
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

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

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
  shiny_color_1: string | null
  shiny_color_2: string | null
  stats_sha: string | null
  evos_sha: string | null
  front_sha: string | null
  back_sha: string | null
  ability_id: number | null
}

interface LocationEncounterRow {
  region: string
  route: string
  method: 'grass' | 'water' | 'fishing'
  rod: 'old' | 'good' | 'super' | null
  time: 'morn' | 'day' | 'nite' | null
  pokemon_name: string
  pokemon_region: string
  rate: number
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// Fetch the dataset from GitHub and fully refresh Supabase every run.
// This intentionally does not do incremental SHA-based diffing.
export async function syncDatabase(): Promise<{
  total: number
  changed: number
  removed: number
}> {
  const syncStartedAt = Date.now()
  console.log('[sync] start')

  const supabase = getSupabase()
  const tree = await fetchTree()
  const entries = entriesFromTree(tree)
  console.log(
    `[sync] fetched tree: ${tree.length} nodes, ${entries.length} pokemon entries`,
  )

  // Index blobs we need for parsing and sprite cache busting.
  const spriteShaByPath = new Map<string, string>()
  const evosShaByRegion = new Map<string, string>()
  const shinyPalByPath = new Set<string>()
  for (const node of tree) {
    if (node.type !== 'blob') continue
    if (node.path.startsWith('gfx/pokemon/') && node.path.endsWith('.png')) {
      spriteShaByPath.set(node.path, node.sha)
    } else if (
      node.path.startsWith('gfx/pokemon/') &&
      node.path.endsWith('/shiny.pal')
    ) {
      shinyPalByPath.add(node.path)
    } else {
      const evo = node.path.match(
        /^data\/pokemon\/evos_attacks_([a-z0-9]+)\.asm$/,
      )
      if (evo) evosShaByRegion.set(evo[1], node.sha)
    }
  }
  console.log(
    `[sync] indexed assets: sprites=${spriteShaByPath.size}, shiny_pals=${shinyPalByPath.size}, evo_files=${evosShaByRegion.size}`,
  )

  const [catalog, { abilities: abilityCatalog, pokemonAbilityMap }] =
    await Promise.all([fetchMoveCatalog(), fetchAbilityCatalog()])
  const validMoveKeys = new Set(catalog.map((c) => c.key))
  console.log(
    `[sync] parsed move catalog: ${catalog.length} moves, ability catalog: ${abilityCatalog.length} abilities`,
  )

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

  resetWildEncounterCache()
  const encounterData = await fetchWildEncounterData()
  const encounterRows: LocationEncounterRow[] = []
  for (const route of encounterData.routes) {
    for (const grass of route.grass) {
      for (const encounter of grass.encounters) {
        encounterRows.push({
          region: route.region,
          route: route.route,
          method: 'grass',
          rod: null,
          time: grass.time,
          pokemon_name: encounter.pokemon.name,
          pokemon_region: encounter.pokemon.region,
          rate: encounter.rate,
        })
      }
    }
    for (const encounter of route.water) {
      encounterRows.push({
        region: route.region,
        route: route.route,
        method: 'water',
        rod: null,
        time: null,
        pokemon_name: encounter.pokemon.name,
        pokemon_region: encounter.pokemon.region,
        rate: encounter.rate,
      })
    }
    for (const fishing of route.fishing) {
      for (const encounter of fishing.encounters) {
        encounterRows.push({
          region: route.region,
          route: route.route,
          method: 'fishing',
          rod: fishing.rod,
          time: fishing.time ?? null,
          pokemon_name: encounter.pokemon.name,
          pokemon_region: encounter.pokemon.region,
          rate: encounter.rate,
        })
      }
    }
  }
  console.log(
    `[sync] parsed wild encounters: routes=${encounterData.routes.length}, rows=${encounterRows.length}`,
  )

  // Build full write sets from source files.
  const upserts: PokemonRow[] = []
  const evoWrites: { name: string; evolutions: Evolution[]; moves: Move[] }[] =
    []
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
      ? evosBlocks
          .get(entry.region === 'beta' ? 'alt' : entry.region)
          ?.get(normalizeKey(entry.name))
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

    const shinyPath = `gfx/pokemon/${entry.name}/shiny.pal`
    let shinyColor1: string | null = null
    let shinyColor2: string | null = null
    if (shinyPalByPath.has(shinyPath)) {
      const shinySource = await fetchRaw(shinyPath)
      const shinyPalette = parseShinyPalette(shinySource)
      if (shinyPalette) {
        shinyColor1 = shinyPalette.color1
        shinyColor2 = shinyPalette.color2
      }
    }

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
      shiny_color_1: shinyColor1,
      shiny_color_2: shinyColor2,
      stats_sha: null,
      evos_sha: null,
      front_sha: null,
      back_sha: null,
      ability_id: null, // resolved after abilities are inserted
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
  if (clearTmhm.error)
    throw new Error(`Clear tm/hm failed: ${clearTmhm.error.message}`)
  const clearPokeMoves = await supabase
    .from('pokemon_moves')
    .delete()
    .gt('id', 0)
  if (clearPokeMoves.error)
    throw new Error(`Clear learnset failed: ${clearPokeMoves.error.message}`)
  const clearEvos = await supabase.from('evolutions').delete().gt('id', 0)
  if (clearEvos.error)
    throw new Error(`Clear evolutions failed: ${clearEvos.error.message}`)
  const clearPokemon = await supabase.from('pokemon').delete().neq('name', '')
  if (clearPokemon.error)
    throw new Error(`Clear pokemon failed: ${clearPokemon.error.message}`)
  const clearMoves = await supabase.from('moves').delete().neq('key', '')
  if (clearMoves.error)
    throw new Error(`Clear moves failed: ${clearMoves.error.message}`)
  const clearAbilities = await supabase.from('abilities').delete().gt('id', 0)
  if (clearAbilities.error)
    throw new Error(`Clear abilities failed: ${clearAbilities.error.message}`)
  const clearEncounters = await supabase
    .from('location_encounters')
    .delete()
    .gt('id', 0)
  if (clearEncounters.error)
    throw new Error(
      `Clear location encounters failed: ${clearEncounters.error.message}`,
    )
  console.log('[sync] clear complete')

  console.log('[sync] inserting move catalog')
  for (const batch of chunk(catalog, 500)) {
    const { error } = await supabase.from('moves').insert(batch)
    if (error) throw new Error(`Insert moves catalog failed: ${error.message}`)
  }

  // Insert abilities and build key->id map for linking to pokemon.
  console.log('[sync] inserting abilities')
  const { data: insertedAbilities, error: abilitiesInsertError } =
    await supabase
      .from('abilities')
      .insert(
        abilityCatalog.map((a: AbilityDef) => ({
          name: a.name,
          description: a.description,
        })),
      )
      .select('id, name')
  if (abilitiesInsertError)
    throw new Error(`Insert abilities failed: ${abilitiesInsertError.message}`)
  const abilityIdByName = new Map<string, number>()
  for (const row of insertedAbilities ?? [])
    abilityIdByName.set(row.name, row.id)
  const abilityIdByKey = new Map<string, number>()
  for (const ability of abilityCatalog) {
    const id = abilityIdByName.get(ability.name)
    if (id !== undefined) abilityIdByKey.set(ability.key, id)
  }
  console.log(`[sync] inserted abilities: ${insertedAbilities?.length ?? 0}`)

  // Resolve ability_id for each pokemon upsert row.
  const pokemonInserts = upserts.map((row) => {
    const abilityKey = pokemonAbilityMap.get(row.name)
    return {
      ...row,
      ability_id: abilityKey ? (abilityIdByKey.get(abilityKey) ?? null) : null,
    }
  })

  console.log('[sync] inserting pokemon rows')
  for (const batch of chunk(pokemonInserts, 500)) {
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

  for (const batch of chunk(encounterRows, 500)) {
    const { error } = await supabase.from('location_encounters').insert(batch)
    if (error)
      throw new Error(`Insert location encounters failed: ${error.message}`)
  }
  console.log(
    `[sync] inserted location encounter rows: ${encounterRows.length}`,
  )

  const durationMs = Date.now() - syncStartedAt
  console.log(`[sync] complete in ${durationMs}ms`)

  return { total: entries.length, changed: upserts.length, removed: 0 }
}

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export interface PokemonListItem {
  name: string
  region: string
  frontSprite: string
  shinyPalette: { color1: string; color2: string } | null
  types: string[]
}

export async function listPokemon(): Promise<PokemonListItem[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pokemon')
    .select('name, region, front_sprite, type_1, type_2, shiny_color_1, shiny_color_2')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    name: row.name,
    region: row.region,
    frontSprite: row.front_sprite,
    shinyPalette:
      row.shiny_color_1 && row.shiny_color_2
        ? { color1: row.shiny_color_1, color2: row.shiny_color_2 }
        : null,
    types: row.type_1 === row.type_2 ? [row.type_1] : [row.type_1, row.type_2],
  }))
}

export interface PokemonDetail {
  name: string
  region: string
  types: string[]
  stats: {
    hp: number
    attack: number
    defense: number
    specialAttack: number
    specialDefense: number
    speed: number
  }
  evolutions: {
    method: string
    level?: number
    item?: string
    condition?: string
    to: { name: string; region: string }
  }[]
  evolutionSources: {
    method: string
    level?: number
    item?: string
    condition?: string
    from: { name: string; region: string }
  }[]
  moves: {
    level: number
    key: string
    name: string
    description: string
    power: number
    type: string
    category: string
    accuracy: number
    pp: number
  }[]
  tmMoves: {
    label: string
    key: string
    name: string
    description: string
    power: number
    type: string
    category: string
    accuracy: number
    pp: number
  }[]
  sprites: { front: string; back: string }
  shinyPalette: { color1: string; color2: string } | null
  ability: { name: string; description: string } | null
  encounters: PokemonEncounter[]
}

export interface EncounterRoute extends RouteEncounter {}

export async function getPokemon(name: string): Promise<PokemonDetail | null> {
  const supabase = getSupabase()

  const { data: p, error } = await supabase
    .from('pokemon')
    .select('*, abilities(name, description)')
    .eq('name', name)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!p) return null

  const [evoRes, evoSourceRes, moveRes, tmhmRes, encounterRes] =
    await Promise.all([
      supabase
        .from('evolutions')
        .select('*')
        .eq('pokemon_name', name)
        .order('id'),
      supabase.from('evolutions').select('*').eq('to_name', name).order('id'),
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
      supabase
        .from('location_encounters')
        .select('region, route, method, rod, time, rate')
        .eq('pokemon_name', name)
        .order('region')
        .order('route'),
    ])
  if (evoRes.error) throw new Error(evoRes.error.message)
  if (evoSourceRes.error) throw new Error(evoSourceRes.error.message)
  if (moveRes.error) throw new Error(moveRes.error.message)
  if (tmhmRes.error) throw new Error(tmhmRes.error.message)
  if (encounterRes.error) throw new Error(encounterRes.error.message)

  const sourceNames = [
    ...new Set((evoSourceRes.data ?? []).map((row) => row.pokemon_name)),
  ]
  const sourceRegionsByName = new Map<string, string>()
  if (sourceNames.length > 0) {
    const { data: sourcePokemon, error: sourcePokemonError } = await supabase
      .from('pokemon')
      .select('name, region')
      .in('name', sourceNames)
    if (sourcePokemonError) throw new Error(sourcePokemonError.message)
    for (const row of sourcePokemon ?? [])
      sourceRegionsByName.set(row.name, row.region)
  }

  const moveKeys = new Set<string>()
  for (const row of moveRes.data ?? []) moveKeys.add(row.move_key)
  for (const row of tmhmRes.data ?? []) moveKeys.add(row.move_key)

  const moveDefsByKey = new Map<string, MoveDef>()
  if (moveKeys.size > 0) {
    const { data: defs, error: defsError } = await supabase
      .from('moves')
      .select('key, name, description, power, type, category, accuracy, pp')
      .in('key', [...moveKeys])
    if (defsError) throw new Error(defsError.message)
    for (const def of defs ?? []) moveDefsByKey.set(def.key, def as MoveDef)
  }

  const ability = p.abilities as { name: string; description: string } | null

  return {
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
    evolutionSources: (evoSourceRes.data ?? []).map((e) => ({
      method: e.method,
      level: e.level ?? undefined,
      item: e.item ?? undefined,
      condition: e.condition ?? undefined,
      from: {
        name: e.pokemon_name,
        region: sourceRegionsByName.get(e.pokemon_name) ?? '',
      },
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
    shinyPalette:
      p.shiny_color_1 && p.shiny_color_2
        ? { color1: p.shiny_color_1, color2: p.shiny_color_2 }
        : null,
    ability: ability
      ? { name: ability.name, description: ability.description }
      : null,
    encounters: (encounterRes.data ?? []).map((row) => ({
      region: row.region,
      route: row.route,
      method: row.method,
      rod: row.rod ?? undefined,
      rate: row.rate,
      time: row.time ?? undefined,
    })),
  }
}

export async function listEncounterRoutes(): Promise<EncounterRoute[]> {
  const supabase = getSupabase()
  const pageSize = 1000
  const rows: {
    region: string
    route: string
    method: 'grass' | 'water' | 'fishing'
    rod: 'old' | 'good' | 'super' | null
    time: 'morn' | 'day' | 'nite' | null
    rate: number
    pokemon_name: string
    pokemon_region: string
  }[] = []

  for (let page = 0; ; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('location_encounters')
      .select(
        'region, route, method, rod, time, rate, pokemon_name, pokemon_region',
      )
      .order('region')
      .order('route')
      .order('method')
      .order('time')
      .order('id')
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }

  const routesByKey = new Map<string, EncounterRoute>()
  for (const row of rows) {
    const key = `${row.region}:${row.route}`
    const existing: EncounterRoute = routesByKey.get(key) ?? {
      region: row.region,
      route: row.route,
      grass: [],
      water: [],
      fishing: [],
    }

    if (row.method === 'grass' && row.time) {
      let grass = existing.grass.find((entry) => entry.time === row.time)
      if (!grass) {
        grass = { time: row.time, encounters: [] }
        existing.grass.push(grass)
      }
      grass.encounters.push({
        pokemon: { name: row.pokemon_name, region: row.pokemon_region },
        rate: row.rate,
      })
    }

    if (row.method === 'water') {
      existing.water.push({
        pokemon: { name: row.pokemon_name, region: row.pokemon_region },
        rate: row.rate,
      })
    }

    if (row.method === 'fishing' && row.rod) {
      let fishing = existing.fishing.find(
        (entry) =>
          entry.rod === row.rod && entry.time === (row.time ?? undefined),
      )
      if (!fishing) {
        fishing = {
          rod: row.rod,
          time: row.time ?? undefined,
          encounters: [],
        }
        existing.fishing.push(fishing)
      }
      fishing.encounters.push({
        pokemon: { name: row.pokemon_name, region: row.pokemon_region },
        rate: row.rate,
      })
    }

    routesByKey.set(key, existing)
  }

  return [...routesByKey.values()]
}

export async function listMoves(): Promise<MoveDef[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('moves')
    .select('key, name, description, power, type, category, accuracy, pp')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as MoveDef[]
}

export async function getMove(key: string): Promise<MoveDef | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('moves')
    .select('key, name, description, power, type, category, accuracy, pp')
    .eq('key', key)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data as MoveDef) : null
}

export async function getAbout(): Promise<{
  version: string
  lastSynced: string | null
}> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('pokemon')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return { version: APP_VERSION, lastSynced: data?.updated_at ?? null }
}
