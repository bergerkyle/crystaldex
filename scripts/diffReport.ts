// Write the source-vs-DB differences to source-diff-report.txt (same output as
// GET /api/delta). Run: npx tsx scripts/diffReport.ts
import { writeFileSync } from 'node:fs'
import { buildDeltaReport } from '../api/deltaReport.js'

writeFileSync('source-diff-report.txt', await buildDeltaReport())
console.log('done')
