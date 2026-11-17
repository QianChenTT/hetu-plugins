import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { definePlugin, type PluginContext } from '@hetu/sdk'
import type { FakeDrawer } from '@hetu/sdk/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { parseDrawerCall } from '../../hetu/core/api/ui.ts'
import { BINDINGS, Explorer } from '../src/explorer.ts'
import { click, close, command, core, emit, has, manifest, nodes, QUICK_MS, quick, row, rows, same, texts, tick, until, view } from './helpers.ts'

afterEach(close)

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

// The plugin with every luoshu call it makes written down and a hook run just before a remove goes out
function counted() {
  const calls: string[] = []
  const hooks: { beforeRemove?: () => Promise<void> } = {}
  const plugin = definePlugin({
    start: ctx => {
      const luoshu = new Proxy(ctx.luoshu, {
        get: (target, key) => {
          const method = (target as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[key as string]!
          return async (...args: unknown[]) => {
            calls.push(`${String(key)} ${JSON.stringify(args[0])}`)
            if (key === 'remove') await hooks.beforeRemove?.()
            return method(...args)
          }
        },
      })
      return new Explorer(Object.assign(Object.create(ctx) as PluginContext, { luoshu }), QUICK_MS).start()
    },
  })
  return { plugin, calls, hooks }
}

const status = (drawer: FakeDrawer) => (nodes(view(drawer)).find(node => node.id === 'status') as { text?: string } | undefined)?.text
const value = (drawer: FakeDrawer) => (nodes(view(drawer)).find(node => node.id === 'name') as { value?: string } | undefined)?.value

async function started(notes: Record<string, string>, made = core({ notes }), plugin = quick) {
  await made.fake.start(plugin)
  await until(() => rows(made.drawer).length > 0)
  return made
}

async function select(drawer: FakeDrawer, name: string): Promise<void> {
  click(drawer, row(drawer, name))
  await until(() => has(drawer, 'rename'))
}

async function ask(drawer: FakeDrawer, name: string): Promise<void> {
  await select(drawer, name)
  click(drawer, 'delete')
  await until(() => has(drawer, 'ask'))
}

describe('opening a note', () => {
  it('opens a clicked note in the editor and selects it, with Rename and Delete beside it', async () => {
    const { drawer } = await started({ 'a.md': 'x', 'b/c.md': 'y' })
    expect(rows(drawer)).toEqual(['▸ b', 'a'])
    click(drawer, row(drawer, 'a'))
    await until(() => drawer.opened.includes('a.md'))
    await until(() => has(drawer, 'rename') && has(drawer, 'delete'))
  })

  it('shows an open the drawer refuses as a line', async () => {
    const own = JSON.parse(readFileSync(manifest, 'utf8')) as { capabilities: { type: string, paths?: string[] }[] }
    const capabilities = own.capabilities.map(item => (item.type === 'luoshu.read' ? { ...item, paths: ['a.md'] } : item))
    const made = core({ notes: { 'a.md': '', 'b.md': '' }, manifest: { ...own, capabilities } })
    const { drawer } = await started({}, made)
    click(drawer, row(drawer, 'b'))
    await until(() => status(drawer) === 'Can’t open b.md: not-granted')
    expect(drawer.opened).toEqual([])
  })
})

describe('creating a note', () => {
  it('writes an empty note with no base version, .md added to the name typed', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x' })
    click(drawer, 'new')
    await until(() => has(drawer, 'name'))
    emit(drawer, 'name', 'submit', 'ideas/first')
    await until(() => fake.luoshu.read('ideas/first.md') === '')
    await until(() => same(rows(drawer), ['▸ ideas', 'a']) && has(drawer, 'new'))
  })

  it('says a name is taken and leaves that note as it was', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x' })
    click(drawer, 'new')
    await until(() => has(drawer, 'name'))
    emit(drawer, 'name', 'submit', 'a.md')
    await until(() => status(drawer) === 'That name is taken')
    expect(fake.luoshu.read('a.md')).toBe('x')
  })

  it('shows a create into a dot folder, which the luoshu refuses, as a line', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x' })
    click(drawer, 'new')
    await until(() => has(drawer, 'name'))
    emit(drawer, 'name', 'submit', '.obsidian/plugins/x')
    await until(() => status(drawer) === 'Can’t create .obsidian/plugins/x.md: not-granted')
    expect(fake.luoshu.read('.obsidian/plugins/x.md')).toBeUndefined()
  })
})

describe('renaming a note', () => {
  it('moves the selected note to the path typed, between folders too', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x' })
    await select(drawer, 'a')
    click(drawer, 'rename')
    await until(() => value(drawer) === 'a.md')
    emit(drawer, 'name', 'submit', 'b/a2.md')
    await until(() => fake.luoshu.read('b/a2.md') === 'x')
    expect(fake.luoshu.read('a.md')).toBeUndefined()
    await until(() => same(rows(drawer), ['▸ b']))
  })

  it('says a rename onto a note that exists is taken and shows a rename into a dot folder refused', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x', 'b.md': 'y' })
    await select(drawer, 'a')
    click(drawer, 'rename')
    await until(() => has(drawer, 'name'))
    emit(drawer, 'name', 'submit', 'b.md')
    await until(() => status(drawer) === 'That name is taken')
    emit(drawer, 'name', 'submit', '.github/a.md')
    await until(() => status(drawer) === 'Can’t move a.md to .github/a.md: not-granted')
    expect([fake.luoshu.read('a.md'), fake.luoshu.read('b.md')]).toEqual(['x', 'y'])
  })

  // A Tab moves focus to another row with no event to the plugin, so F2 and Delete act on the row clicked last, which
  // the view marks as selected and not on the row that has focus
  it('renames on F2 and asks before a delete on Delete, both for the row clicked last', async () => {
    const { drawer } = await started({ 'a.md': 'x', 'b.md': 'y' })
    await select(drawer, 'a')
    command(drawer, 'rename')
    await until(() => value(drawer) === 'a.md')
    click(drawer, 'cancel')
    await until(() => has(drawer, 'new'))
    command(drawer, 'delete')
    await until(() => texts(drawer).includes('Move a to the recycle bin?'))
  })

  it('does nothing on F2 or Delete with no note selected, a selected folder included', async () => {
    const { drawer } = await started({ 'a.md': 'x', 'b/c.md': 'y' })
    const still = async () => {
      command(drawer, 'rename')
      command(drawer, 'delete')
      await tick(50)
      expect([has(drawer, 'name'), has(drawer, 'ask'), has(drawer, 'new')]).toEqual([false, false, true])
    }
    await still()
    click(drawer, row(drawer, '▸ b'))
    await until(() => rows(drawer).includes('▾ b'))
    await still()
  })

  // The drawer sends a bound key whatever has focus in the view, the name input included
  it('keeps a name being typed on F2 or Delete, in a create and in a rename', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x', 'b.md': 'y' })
    await select(drawer, 'a')
    // Each key alone, the input still drawn as it was and no question asked
    const keys = async (typed: string) => {
      const drawn = value(drawer)
      emit(drawer, 'name', 'input', typed)
      for (const name of ['delete', 'rename']) {
        command(drawer, name)
        await tick(50)
        expect([name, has(drawer, 'name'), has(drawer, 'ask'), value(drawer)]).toEqual([name, true, false, drawn])
      }
    }
    click(drawer, 'new')
    await until(() => has(drawer, 'name'))
    await keys('half typed na')
    await fake.luoshu.write('c.md', '')
    await until(() => rows(drawer).includes('c') && value(drawer) === 'half typed na')
    click(drawer, 'cancel')
    await until(() => has(drawer, 'new'))
    click(drawer, 'rename')
    await until(() => value(drawer) === 'a.md')
    await keys('b/a2')
    await fake.luoshu.write('d.md', '')
    await until(() => rows(drawer).includes('d') && value(drawer) === 'b/a2')
    emit(drawer, 'name', 'submit', 'b/a2')
    await until(() => fake.luoshu.read('b/a2.md') === 'x')
  })

  it('binds F2 and Delete with key names the drawer takes', () => {
    expect(BINDINGS).toEqual([{ key: 'F2', command: 'rename' }, { key: 'Delete', command: 'delete' }])
    expect(parseDrawerCall(JSON.stringify({ v: 1, kind: 'call', id: 1, verb: 'view.bind', args: { bindings: BINDINGS } }))).not.toBeNull()
  })
})

describe('deleting a note', () => {
  it('asks in the view first, then moves the note to the recycle bin', async () => {
    const { fake, drawer } = await started({ 'a.md': 'x', 'b.md': 'y' })
    await ask(drawer, 'a')
    click(drawer, 'no')
    await until(() => !has(drawer, 'ask'))
    expect(fake.luoshu.read('a.md')).toBe('x')
    click(drawer, 'delete')
    await until(() => has(drawer, 'ask'))
    click(drawer, 'yes')
    await until(() => fake.luoshu.read('a.md') === undefined)
    await until(() => same(rows(drawer), ['b']) && !has(drawer, 'ask'))
  })

  // A dialog a plugin draws must not pass for hetu's trusted window
  it('words its question as the view\'s own, none of the trusted window\'s', async () => {
    const { drawer } = await started({ 'a.md': 'x' })
    await ask(drawer, 'a')
    const asked = nodes(nodes(view(drawer)).find(node => node.id === 'ask')!).flatMap(node => ('text' in node ? [node.text] : []))
    expect(asked).toEqual(['Move a to the recycle bin?', 'Move to recycle bin', 'Cancel'])
    for (const text of asked) expect(text).not.toMatch(/confirm|allow|hetu|security/i)
  })

  it('leaves a note that changed between its read and its removal, says so and lists again', async () => {
    const { plugin, hooks } = counted()
    const { fake, drawer } = await started({}, core({ notes: { 'a.md': 'x' } }), plugin)
    hooks.beforeRemove = () => fake.luoshu.write('a.md', 'changed')
    await ask(drawer, 'a')
    click(drawer, 'yes')
    await until(() => status(drawer) === 'a changed since it was read, look again')
    expect(fake.luoshu.read('a.md')).toBe('changed')
    expect(rows(drawer)).toContain('a')
  })
})

describe('what the explorer reads', () => {
  it('reads a note once for each delete, just before removing it and never to list, open, create or rename', async () => {
    const { plugin, calls } = counted()
    const { fake, drawer } = await started({}, core({ notes: { 'a.md': 'x', 'b.md': 'y' } }), plugin)
    click(drawer, row(drawer, 'a'))
    await until(() => drawer.opened.includes('a.md'))
    click(drawer, 'new')
    await until(() => has(drawer, 'name'))
    emit(drawer, 'name', 'submit', 'n')
    await until(() => fake.luoshu.read('n.md') === '' && rows(drawer).includes('n'))
    await select(drawer, 'n')
    click(drawer, 'rename')
    await until(() => has(drawer, 'name'))
    emit(drawer, 'name', 'submit', 'm.md')
    await until(() => rows(drawer).includes('m'))
    expect(calls.filter(call => call.startsWith('read'))).toEqual([])
    for (const name of ['a', 'm']) {
      await ask(drawer, name)
      click(drawer, 'yes')
      await until(() => !rows(drawer).includes(name))
    }
    const reads = calls.flatMap((call, at) => (call.startsWith('read') ? [[call, calls[at + 1]]] : []))
    expect(reads).toEqual([
      ['read {"path":"a.md"}', `remove {"path":"a.md","baseVersion":"${sha('x')}"}`],
      ['read {"path":"m.md"}', `remove {"path":"m.md","baseVersion":"${sha('')}"}`],
    ])
  })

  it('reads and removes once for a Yes clicked three times before the first read answers', async () => {
    const { plugin, calls } = counted()
    const { fake, drawer } = await started({}, core({ notes: { 'a.md': 'x', 'b.md': 'y' }, latencyMs: 20 }), plugin)
    await ask(drawer, 'a')
    const before = calls.length
    for (let i = 0; i < 3; i++) click(drawer, 'yes')
    await until(() => fake.luoshu.read('a.md') === undefined && same(rows(drawer), ['b']))
    await tick(100)
    expect(calls.slice(before).filter(call => !call.startsWith('list'))).toEqual([
      'read {"path":"a.md"}',
      `remove {"path":"a.md","baseVersion":"${sha('x')}"}`,
    ])
    expect(status(drawer)).toBeUndefined()
  })
})
