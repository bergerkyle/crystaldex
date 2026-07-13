import express from 'express'

const app = express()

app.use(express.json())

const REPO = 'aaronjeter/CrystalShireEngine'
const REF = 'LevelScaling'
const BASE_STATS_DIR = 'data/pokemon/base_stats'

interface PokemonStats {
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
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

// Cache the repo file tree so we only hit the GitHub API once per warm instance.
let entriesCache: PokemonEntry[] | null = null

async function getEntries(): Promise<PokemonEntry[]> {
  if (entriesCache) return entriesCache

  const url = `https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`
  const res = await fetch(url, { headers: githubHeaders() })
  if (!res.ok) {
    throw new Error(`GitHub tree request failed (${res.status})`)
  }

  const data = (await res.json()) as {
    tree?: { path: string; type: string }[]
  }

  const entries = (data.tree ?? [])
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

  entriesCache = entries
  return entries
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

const statsCache = new Map<string, PokemonStats>()

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

const evosAttacksCache = new Map<string, Map<string, EvosAttacks>>()

async function getEvosAttacks(
  region: string,
  entries: PokemonEntry[],
): Promise<Map<string, EvosAttacks>> {
  const cached = evosAttacksCache.get(region)
  if (cached) return cached

  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/data/pokemon/evos_attacks_${region}.asm`
  const res = await fetch(url, { headers: { 'User-Agent': 'crystaldex-pokedex' } })
  if (!res.ok) {
    throw new Error(`Failed to fetch evolutions/attacks (${res.status})`)
  }

  const parsed = parseEvosAttacksFile(await res.text(), entries)
  evosAttacksCache.set(region, parsed)
  return parsed
}

// List all Pokémon (name + region).
app.get('/api/pokemon', async (_req, res) => {
  try {
    const entries = await getEntries()
    res.json(entries.map(({ name, region }) => ({ name, region })))
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load Pokémon list',
    })
  }
})

// Base stats for a single Pokémon by name.
app.get('/api/pokemon/:name', async (req, res) => {
  try {
    const entries = await getEntries()
    const entry = entries.find(
      (e) => e.name.toLowerCase() === req.params.name.toLowerCase(),
    )
    if (!entry) {
      res.status(404).json({ error: 'Pokémon not found' })
      return
    }

    let stats = statsCache.get(entry.path)
    if (!stats) {
      const rawUrl = `https://raw.githubusercontent.com/${REPO}/${REF}/${entry.path}`
      const raw = await fetch(rawUrl, {
        headers: { 'User-Agent': 'crystaldex-pokedex' },
      })
      if (!raw.ok) {
        res.status(502).json({ error: `Failed to fetch stats (${raw.status})` })
        return
      }
      const parsed = parseStats(await raw.text())
      if (!parsed) {
        res.status(422).json({ error: 'Could not parse base stats' })
        return
      }
      stats = parsed
      statsCache.set(entry.path, stats)
    }

    let evolutions: Evolution[] = []
    let moves: Move[] = []
    if (entry.region) {
      try {
        const blocks = await getEvosAttacks(entry.region, entries)
        const block = blocks.get(normalizeKey(entry.name))
        if (block) {
          evolutions = block.evolutions
          moves = block.moves
        }
      } catch {
        // Evolutions/attacks are best-effort; stats still render without them.
      }
    }

    res.json({ name: entry.name, region: entry.region, stats, evolutions, moves })
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load Pokémon',
    })
  }
})

// Health check
app.get('/api/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Local dev only: run a standalone server so Vite can proxy to it.
// On Vercel the exported app is used directly as the serverless handler.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 8080
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`)
  })
}

export default app
