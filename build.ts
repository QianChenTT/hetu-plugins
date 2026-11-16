import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Runs the build.ts of each plugin, a folder at the root holding a hetu-plugin.json, each of which builds its worker
// and checks its manifest against what was built
const root = import.meta.dirname
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'hetu' || entry.name.startsWith('.') || entry.name === 'node_modules') continue
  const files = await readdir(path.join(root, entry.name))
  if (!files.includes('hetu-plugin.json')) continue
  console.log(entry.name)
  await import(pathToFileURL(path.join(root, entry.name, 'build.ts')).href)
  if (process.exitCode !== undefined && process.exitCode !== 0) break
}
