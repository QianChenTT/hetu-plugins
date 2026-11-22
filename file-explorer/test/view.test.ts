import { afterEach, describe, expect, it } from 'vitest'
import { shown } from '../src/view.ts'
import explorer from '../src/worker.ts'
import { click, close, core, nodes, row, rows, same, until, view } from './helpers.ts'

afterEach(close)

describe('the explorer\'s view', () => {
  it('lists the luoshu into closed folders and opens one on a click, kept open across a restart', async () => {
    const { fake, drawer } = core({ notes: { 'a/1.md': '', 'a/b/2.md': '', 'c.md': '', 'img/x.png': '' } })
    expect(await fake.start(explorer)).toEqual({ state: 'ready' })
    await until(() => same(rows(drawer), ['▸ a', 'c']))
    click(drawer, row(drawer, '▸ a'))
    await until(() => same(rows(drawer), ['▾ a', '▸ b', '1', 'c']))
    await until(() => same(fake.stored('storage', 'open'), ['a']))
    await fake.stop()
    expect(await fake.start(explorer)).toEqual({ state: 'ready' })
    await until(() => same(rows(drawer), ['▾ a', '▸ b', '1', 'c']))
    click(drawer, row(drawer, '▾ a'))
    await until(() => same(rows(drawer), ['▸ a', 'c']))
    await until(() => same(fake.stored('storage', 'open'), []))
  })

  it('forgets a folder that is gone, so one made again under its name starts closed', async () => {
    const { fake, drawer } = core({ notes: { 'a/1.md': '', 'c.md': '' } })
    await fake.start(explorer)
    await until(() => same(rows(drawer), ['▸ a', 'c']))
    click(drawer, row(drawer, '▸ a'))
    await until(() => same(fake.stored('storage', 'open'), ['a']))
    await fake.stop()
    await fake.luoshu.remove('a/1.md')
    await fake.start(explorer)
    await until(() => same(rows(drawer), ['c']))
    await until(() => same(fake.stored('storage', 'open'), []))
    await fake.stop()
    await fake.luoshu.write('a/2.md', '')
    await fake.start(explorer)
    await until(() => same(rows(drawer), ['▸ a', 'c']))
  })

  // A bidi override in a name would draw the rest of the row reversed and a name made only of such marks would draw as
  // nothing
  it('draws control and bidi characters in a name as U+FFFD, a name made only of them included', async () => {
    const { fake, drawer } = core({ notes: { 'evil\u202egnp.md': '', '\u2067\u2069.md': '', 'a\u200eb.md': '', 'x\u202b/n.md': '', 'emoji\u200d.md': '' } })
    await fake.start(explorer)
    await until(() => rows(drawer).length === 5)
    expect(rows(drawer)).toEqual(['▸ x\ufffd', 'a\ufffdb', 'emoji\u200d', 'evil\ufffdgnp', '\ufffd\ufffd'])
    expect(JSON.stringify(view(drawer))).not.toMatch(/[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/)
  })

  it('draws every control and bidi character Unicode names as U+FFFD and leaves joiners and zero widths as they are', () => {
    const controls = [...Array.from({ length: 0x20 }, (_, at) => at), 0x7f, ...Array.from({ length: 0x20 }, (_, at) => 0x80 + at)]
    const bidi = [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]
    for (const unit of [...controls, ...bidi]) expect(shown(`a${String.fromCharCode(unit)}b`), unit.toString(16)).toBe('a\ufffdb')
    expect(shown('a\u200b\u200c\u200d\u2060\ufeffb ü 文 😀')).toBe('a\u200b\u200c\u200d\u2060\ufeffb ü 文 😀')
  })

  // The drawer refuses a tree past 10,000 nodes or a call past 1 MiB and the plugin is never told where a list is
  // scrolled, so it sends as many rows as fit and says how many it left out
  it('draws 10,000 notes in one open folder under the drawer\'s caps, the last row saying how many more there are', async () => {
    const notes = Object.fromEntries(Array.from({ length: 10_000 }, (_, i) => [`big/n${String(i).padStart(5, '0')}.md`, '']))
    const { fake, drawer } = core({ notes })
    await fake.start(explorer)
    await until(() => same(rows(drawer), ['▸ big']), 20_000)
    click(drawer, row(drawer, '▸ big'))
    await until(() => rows(drawer).length > 1, 20_000)
    const shown = rows(drawer)
    const more = /^(\d+) more$/.exec(shown.at(-1)!)
    expect(more).not.toBeNull()
    expect(shown.length - 2 + Number(more![1])).toBe(10_000)
    expect(shown.slice(1, 3)).toEqual(['n00000', 'n00001'])
    expect(nodes(view(drawer)).length).toBeLessThanOrEqual(10_000)
  }, 40_000)
})
