// Compare upstream base stats/types (what the sync stores in the DB) against
// api/sourceStats.ts and write the differences to source-diff-report.txt.
// Run: npx tsx scripts/diffReport.ts
import { writeFileSync } from 'node:fs'
import {
  entriesFromTree,
  fetchRaw,
  fetchTree,
  parseStats,
  parseTypes,
} from '../api/parser.js'
import { compareWithSource } from '../api/postgres.js'
import { SOURCE_SPECIES } from '../api/sourceStats.js'

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
writeFileSync(
  'source-diff-report.txt',
  [
    `DB species: ${entries.length}, matched: ${matched}, with differences: ${lines.length}, unmatched: ${unmatched.length}`,
    `Source species available: ${Object.keys(SOURCE_SPECIES).length}`,
    '',
    '== DIFFERENCES (DB minus source) ==',
    ...lines,
    '',
    '== UNMATCHED DB NAMES ==',
    ...unmatched,
    '',
  ].join('\n'),
)
console.log('done')
