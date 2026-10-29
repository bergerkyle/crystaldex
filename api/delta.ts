import {
  entriesFromTree,
  fetchRaw,
  fetchTree,
  parseStats,
  parseTypes,
} from './parser.js'
import { compareWithSource } from './postgres.js'
import { SOURCE_SPECIES } from './sourceStats.js'

// Compare upstream base stats/types (what the sync stores in the DB) against
// api/sourceStats.ts and return the same text as source-diff-report.txt.
export async function buildDeltaReport(): Promise<string> {
  const entries = entriesFromTree(await fetchTree())
  const unmatched: string[] = []
  const lines: string[] = []
  let matched = 0

  const chunk = 20
  for (let i = 0; i < entries.length; i += chunk) {
    await Promise.all(
      entries.slice(i, i + chunk).map(async (entry) => {
        const source = await fetchRaw(entry.path)
        const stats = parseStats(source)
        const t = parseTypes(source)
        if (!stats || !t) return
        const types =
          t.primary === t.secondary ? [t.primary] : [t.primary, t.secondary]
        const cmp = compareWithSource(entry.name, types, { ...stats })
        if (!cmp) {
          unmatched.push(entry.name)
          return
        }
        matched++
        const parts = Object.entries(cmp.statDiffs).map(
          ([k, v]) => `${k} ${(v as number) > 0 ? '+' : ''}${v}`,
        )
        if (cmp.sourceTypes)
          parts.push(
            `types DB=${types.join('/')} source=${cmp.sourceTypes.join('/')}`,
          )
        if (parts.length) lines.push(`${entry.name}: ${parts.join(', ')}`)
      }),
    )
  }

  lines.sort()
  unmatched.sort()
  return [
    `DB species: ${entries.length}, matched: ${matched}, with differences: ${lines.length}, unmatched: ${unmatched.length}`,
    `Source species available: ${Object.keys(SOURCE_SPECIES).length}`,
    '',
    '== DIFFERENCES (DB minus source) ==',
    ...lines,
    '',
    '== UNMATCHED DB NAMES ==',
    ...unmatched,
    '',
  ].join('\n')
}
