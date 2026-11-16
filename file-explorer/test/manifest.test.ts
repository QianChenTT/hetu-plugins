import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { checkManifest } from '@hetu/sdk/check-manifest'
import { buildPlugin } from '@hetu/sdk/esbuild'
import { describe, expect, it } from 'vitest'
import { manifest } from './helpers.ts'

const root = path.join(import.meta.dirname, '..')

describe('the explorer\'s manifest', () => {
  // A class 4 grant: list, read and write on every note. Read is needed for editor.open and for a note's version
  // before a delete, write for create, rename and delete
  it('asks for exactly the explorer\'s grant and nothing else', async () => {
    const declared = JSON.parse(await readFile(manifest, 'utf8')) as Record<string, unknown>
    expect(declared).toEqual({
      id: 'file-explorer',
      name: 'Files',
      version: '0.1.0',
      api: '^3',
      entries: { worker: 'dist/worker.js' },
      requires: ['luoshu'],
      views: { files: { title: 'Files', kind: 'view' } },
      capabilities: [
        { type: 'luoshu.list', paths: ['**'] },
        { type: 'luoshu.read', paths: ['**'] },
        { type: 'luoshu.write', paths: ['**'] },
        { type: 'events.subscribe', topics: ['luoshu.changed', 'luoshu.outside'] },
        { type: 'ui.view' },
        { type: 'storage' },
      ],
    })
  })

  it('passes the checks hetu\'s loader makes, built as its build script builds it', async () => {
    await buildPlugin(root, { entries: { 'dist/worker.js': 'src/worker.ts' }, workers: ['dist/worker.js'] })
    expect(await checkManifest(root, { built: true })).toEqual([])
  })
})
