import { Refused } from '@hetu/sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { subscribe } from '../src/explorer.ts'
import { listAll, RETRY_MS, WAIT_MS } from '../src/listing.ts'
import { Refresher } from '../src/refresh.ts'
import explorer from '../src/worker.ts'
import { close, core, rows, same, tick, until, view, nodes } from './helpers.ts'

afterEach(close)

// A luoshu of names paged two at a time, refusing the pages a test names with the codes it names, in turn
function luoshu(names: string[], refusals: Record<string, string[]> = {}) {
  const asked: (string | undefined)[] = []
  const list = async ({ after }: { after?: string }) => {
    asked.push(after)
    const code = refusals[after ?? '']?.shift()
    if (code !== undefined) throw new Refused(code as never, 'luoshu.list')
    const from = after === undefined ? 0 : names.indexOf(after) + 1
    const paths = names.slice(from, from + 2)
    return { paths, next: from + 2 < names.length ? paths.at(-1)! : null }
  }
  return { list, asked }
}

function waits() {
  const waited: number[] = []
  return { waited, wait: async (ms: number) => { waited.push(ms) } }
}

describe('a listing', () => {
  it('takes every page, each after the last name of the one before', async () => {
    const { list, asked } = luoshu(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])
    expect(await listAll(list)).toEqual({ ok: true, pages: [['a.md', 'b.md'], ['c.md', 'd.md'], ['e.md']] })
    expect(asked).toEqual([undefined, 'b.md', 'd.md'])
  })

  // The luoshu charges a listing to the plugin's filter budget, so in a large luoshu a page comes back throttled
  it('asks for a throttled page again a second later and goes on from it', async () => {
    const { list, asked } = luoshu(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'], { 'b.md': ['throttled', 'throttled'] })
    const { waited, wait } = waits()
    expect(await listAll(list, wait)).toEqual({ ok: true, pages: [['a.md', 'b.md'], ['c.md', 'd.md'], ['e.md']] })
    expect(asked).toEqual([undefined, 'b.md', 'b.md', 'b.md', 'd.md'])
    expect(waited).toEqual([RETRY_MS, RETRY_MS])
  })

  it('gives up once it waited WAIT_MS in all, and at once on any other refusal', async () => {
    const { list } = luoshu(['a.md', 'b.md', 'c.md'], { 'b.md': Array(1000).fill('throttled') })
    const { waited, wait } = waits()
    expect(await listAll(list, wait)).toEqual({ ok: false, code: 'throttled' })
    expect(waited.reduce((sum, ms) => sum + ms, 0)).toBe(WAIT_MS)
    const other = waits()
    expect(await listAll(luoshu(['a.md', 'b.md', 'c.md'], { '': ['unavailable'] }).list, other.wait)).toEqual({ ok: false, code: 'unavailable' })
    expect(other.waited).toEqual([])
  })
})

describe('refreshing', () => {
  // A run that waits until the test lets it end
  function runs() {
    let count = 0
    let release: (() => void) | null = null
    const run = () => {
      count++
      return new Promise<void>(resolve => { release = resolve })
    }
    return { run, count: () => count, end: async () => { release?.(); await tick() } }
  }

  it('lists once for a request with none running', async () => {
    const made = runs()
    const refresher = new Refresher(made.run)
    refresher.request()
    await made.end()
    expect(made.count()).toBe(1)
  })

  it('lists once more after the running listing for any number of requests that came meanwhile, never one each', async () => {
    const made = runs()
    const refresher = new Refresher(made.run)
    refresher.request()
    for (let i = 0; i < 10; i++) refresher.request()
    expect(made.count()).toBe(1)
    await made.end()
    expect(made.count()).toBe(2)
    await made.end()
    expect(made.count()).toBe(2)
    refresher.request()
    expect(made.count()).toBe(3)
    await made.end()
  })

  it('subscribes to the luoshu\'s changes and lists again on each, on what it was told it missed too', async () => {
    let topics: unknown
    let handler: (() => void) | undefined
    let resync: ((topics: string[]) => void) | undefined
    const ctx = {
      events: {
        on: async (named: unknown, heard: () => void, options: { onResync?: (topics: string[]) => void }) => {
          topics = named
          handler = heard
          resync = options.onResync
          return { topics: [], standing: [], off: async () => {} }
        },
      },
    }
    let asked = 0
    await subscribe(ctx as never, () => { asked++ })
    expect(topics).toEqual(['luoshu.changed', 'luoshu.outside'])
    handler!()
    resync!(['luoshu.changed'])
    expect(asked).toBe(2)
  })
})

describe('the explorer listing again', () => {
  it('shows a note written, written outside and removed', async () => {
    const { fake, drawer } = core({ notes: { 'a.md': '' } })
    await fake.start(explorer)
    await until(() => same(rows(drawer), ['a']))
    await fake.luoshu.write('b.md', '')
    await until(() => same(rows(drawer), ['a', 'b']))
    await fake.luoshu.write('c/d.md', '', { outside: true })
    await until(() => same(rows(drawer), ['▸ c', 'a', 'b']))
    await fake.luoshu.remove('a.md')
    await until(() => same(rows(drawer), ['▸ c', 'b']))
  })

  it('shows a refused listing as a line and lists again on the next change', async () => {
    const { fake, drawer } = core({ notes: { 'a.md': '' } })
    fake.luoshu.refuseNext('unavailable')
    await fake.start(explorer)
    await until(() => nodes(view(drawer)).some(node => node.kind === 'text' && node.text === 'Listing refused: unavailable'))
    await fake.luoshu.write('b.md', '')
    await until(() => same(rows(drawer), ['a', 'b']))
    expect(nodes(view(drawer)).some(node => node.id === 'status')).toBe(false)
  })

  it('takes in a burst of changes that came while it listed', async () => {
    const { fake, drawer } = core({ notes: { 'a.md': '' }, latencyMs: 40 })
    await fake.start(explorer)
    await until(() => same(rows(drawer), ['a']))
    await Promise.all(Array.from({ length: 20 }, (_, i) => fake.luoshu.write(`n${String(i).padStart(2, '0')}.md`, '')))
    await until(() => rows(drawer).length === 21)
  })
})
