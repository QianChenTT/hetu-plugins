import { checkManifest } from '@hetu/sdk/check-manifest'
import { buildPlugin } from '@hetu/sdk/esbuild'

const root = import.meta.dirname
for (const output of await buildPlugin(root, { entries: { 'dist/worker.js': 'src/worker.ts' }, workers: ['dist/worker.js'] })) {
  console.log(`${output.path}: ${output.bytes} bytes`)
}
const problems = await checkManifest(root, { built: true })
for (const problem of problems) console.error(problem)
process.exitCode = problems.length === 0 ? 0 : 1
