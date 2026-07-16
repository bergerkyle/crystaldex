import express from 'express'
import {
  getAbout,
  getMove,
  getPokemon,
  getSaveLookups,
  listEncounterRoutes,
  listMoves,
  listPokemon,
  syncDatabase,
} from './postgres.js'

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

// ---------------------------------------------------------------------------
// Pokémon routes
// ---------------------------------------------------------------------------

app.get('/api/pokemon', async (_req, res) => {
  const startedAt = Date.now()
  console.log('[pokemon:list] request start')
  try {
    const payload = await listPokemon()
    console.log(
      `[pokemon:list] returning ${payload.length} rows in ${Date.now() - startedAt}ms`,
    )
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

app.get('/api/pokemon/:name', async (req, res) => {
  const startedAt = Date.now()
  const name = req.params.name.toLowerCase()
  console.log(`[pokemon:detail] request start for ${name}`)
  try {
    const detail = await getPokemon(name)
    if (!detail) {
      console.log(`[pokemon:detail] not found: ${name}`)
      res.status(404).json({ error: 'Pokémon not found' })
      return
    }
    console.log(
      `[pokemon:detail] success for ${name} in ${Date.now() - startedAt}ms`,
    )
    res.json(detail)
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

app.get('/api/encounters/routes', async (_req, res) => {
  const startedAt = Date.now()
  console.log('[encounters:routes] request start')
  try {
    const routes = await listEncounterRoutes()
    console.log(
      `[encounters:routes] returning ${routes.length} rows in ${Date.now() - startedAt}ms`,
    )
    res.json(routes)
  } catch (err) {
    console.error(
      `[encounters:routes] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    )
    res.status(502).json({
      error:
        err instanceof Error ? err.message : 'Failed to load encounter routes',
    })
  }
})

// ---------------------------------------------------------------------------
// Move routes
// ---------------------------------------------------------------------------

app.get('/api/moves', async (_req, res) => {
  const startedAt = Date.now()
  console.log('[moves:list] request start')
  try {
    const moves = await listMoves()
    console.log(
      `[moves:list] returning ${moves.length} rows in ${Date.now() - startedAt}ms`,
    )
    res.json(moves)
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

app.get('/api/moves/:key', async (req, res) => {
  const startedAt = Date.now()
  const key = req.params.key.toUpperCase()
  console.log(`[moves:detail] request start for ${key}`)
  try {
    const move = await getMove(key)
    if (!move) {
      console.log(`[moves:detail] not found: ${key}`)
      res.status(404).json({ error: 'Move not found' })
      return
    }
    console.log(
      `[moves:detail] success for ${key} in ${Date.now() - startedAt}ms`,
    )
    res.json(move)
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

// ---------------------------------------------------------------------------
// Sync route
// ---------------------------------------------------------------------------

// Triggered by the Vercel daily cron (Authorization: Bearer <CRON_SECRET>)
// or manually with the same token.
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
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Sync failed' })
  }
})

// ---------------------------------------------------------------------------
// Utility routes
// ---------------------------------------------------------------------------

app.get('/api/about', async (_req, res) => {
  try {
    const about = await getAbout()
    res.json(about)
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load about info',
    })
  }
})

app.get('/api/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/save/lookups', async (_req, res) => {
  const startedAt = Date.now()
  console.log('[save:lookups] request start')
  try {
    const lookups = await getSaveLookups()
    console.log(
      `[save:lookups] success in ${Date.now() - startedAt}ms (species=${lookups.speciesById.length}, moves=${lookups.moveKeysById.length})`,
    )
    res.json(lookups)
  } catch (err) {
    console.error(
      `[save:lookups] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    )
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load save lookups',
    })
  }
})

// ---------------------------------------------------------------------------
// Local dev server
// ---------------------------------------------------------------------------

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
