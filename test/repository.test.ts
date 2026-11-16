import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.join(import.meta.dirname, '..')
const read = async (file: string) => (await readFile(path.join(root, file), 'utf8')).replaceAll('\r\n', '\n')

describe('the repository', () => {
  // Installed as a dependency it runs nothing and pulls nothing: npm runs these scripts of a package it installs, and
  // never installs a dependency's dev dependencies
  it('declares no dependency, no install script and only the SDK by its file link as a dev dependency', async () => {
    const manifest = JSON.parse(await read('package.json')) as Record<string, unknown>
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies']) {
      expect(manifest[field], field).toBeUndefined()
    }
    expect(manifest.devDependencies).toEqual({ '@hetu/sdk': 'file:hetu/core/sdk' })
    const scripts = (manifest.scripts ?? {}) as Record<string, string>
    for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) expect(scripts[name], name).toBeUndefined()
  })

  it('holds hetu as its one submodule, from GitHub', async () => {
    expect(await read('.gitmodules')).toBe('[submodule "hetu"]\n\tpath = hetu\n\turl = https://github.com/QianChenTT/hetu.git\n')
  })

  // A tag or a branch can be moved to other code, a commit can't. A submodule hetu itself holds is never fetched
  it('runs CI on actions pinned by full commit with a read-only token, hetu one level deep and no install script', async () => {
    const workflow = await read('.github/workflows/ci.yml')
    const uses = [...workflow.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map(match => match[1])
    expect(uses.length).toBeGreaterThan(0)
    for (const action of uses) expect(action).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/)
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(workflow).not.toMatch(/:\s*write\b/)
    const checkouts = uses.filter(action => action.startsWith('actions/checkout@')).length
    expect(checkouts).toBeGreaterThan(0)
    expect([...workflow.matchAll(/submodules: (\S+)/g)].map(match => match[1])).toEqual(Array(checkouts).fill('true'))
    expect(workflow.match(/persist-credentials: false/g)?.length).toBe(checkouts)
    const installs = [...workflow.matchAll(/\bnpm (?:ci|install|i)\b[^\n]*/g)].map(match => match[0])
    expect(installs).toEqual(['npm ci --ignore-scripts', 'npm ci --ignore-scripts'])
  })

  it('keeps line endings LF on every system', async () => {
    expect(await read('.gitattributes')).toBe('* text=auto eol=lf\n')
  })
})
