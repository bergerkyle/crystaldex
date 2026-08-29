// One-off: populate items.icon_url from PokemonDB item sprites.
//   - Regular items map by name slug; TMs/HMs use their move's type icon.
//   - Each sprite is downloaded and re-hosted in the `item-icons` storage bucket.
// Run: pnpm sync:icons   (requires the same Supabase env vars as the API sync)
//
// PokemonDB sprites are © Nintendo/Game Freak. Only re-host them if your usage
// is permitted; otherwise point icon_url straight at the source instead.
import {
  ITEM_CONSTANTS_PATH,
  fetchItemCatalog,
  fetchMoveCatalog,
  fetchRaw,
  parseTmHm,
} from '../api/parser.js'
import { getSupabase } from '../api/postgres.js'
import { FOSSIL_NO_POKEMONDB_IMAGE, itemIconSourceUrl } from '../api/itemIcons.js'

const BUCKET = 'item-icons'

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile?.(file)
  } catch {
    // Missing env files are fine; on CI the vars are injected directly.
  }
}

async function ensureBucket(): Promise<void> {
  const supabase = getSupabase()
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '1MB',
  })
  if (error && !/exists/i.test(error.message)) {
    throw new Error(`Failed to create bucket: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const supabase = getSupabase()
  await ensureBucket()

  const [items, moves, constSource] = await Promise.all([
    fetchItemCatalog(),
    fetchMoveCatalog(),
    fetchRaw(ITEM_CONSTANTS_PATH),
  ])

  const moveTypeByKey = new Map(moves.map((m) => [m.key, m.type]))
  // TM/HM label (item key) -> move type, so machines get the type-colored icon.
  const tmTypeByLabel = new Map<string, string>()
  for (const def of parseTmHm(constSource)) {
    if (!def.label) continue
    const type = moveTypeByKey.get(def.move)
    if (type) tmTypeByLabel.set(def.label, type)
  }

  let uploaded = 0
  const missing: string[] = []

  for (const item of items) {
    const tmType = tmTypeByLabel.get(item.key) ?? null
    if (FOSSIL_NO_POKEMONDB_IMAGE.has(item.key)) continue
    const sourceUrl = itemIconSourceUrl(item.key, item.name, tmType)
    if (!sourceUrl) {
      missing.push(item.key)
      continue
    }

    const res = await fetch(sourceUrl)
    if (!res.ok) {
      missing.push(`${item.key} (${sourceUrl})`)
      continue
    }
    const bytes = new Uint8Array(await res.arrayBuffer())

    const path = `${item.key}.png`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/png', upsert: true })
    if (uploadError) {
      missing.push(`${item.key} (upload: ${uploadError.message})`)
      continue
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data
      .publicUrl
    const { error: updateError } = await supabase
      .from('items')
      .update({ icon_url: publicUrl })
      .eq('key', item.key)
    if (updateError) {
      missing.push(`${item.key} (update: ${updateError.message})`)
      continue
    }

    uploaded += 1
  }

  console.log(`[icons] uploaded ${uploaded}/${items.length} item icons`)
  if (missing.length) {
    console.log(`[icons] ${missing.length} unmatched (add SLUG_OVERRIDES):`)
    for (const key of missing) console.log(`  - ${key}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
