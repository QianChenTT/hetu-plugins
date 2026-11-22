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

  it('keeps line endings LF on every system', async () => {
    expect(await read('.gitattributes')).toBe('* text=auto eol=lf\n')
  })
})
