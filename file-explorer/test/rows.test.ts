import type { UiNode } from '@hetu/sdk'
import { describe, expect, it } from 'vitest'
import { folderPaths, MAX_CALL_BYTES, MAX_NODES, rowNodes, rowsOf, sizeOf } from '../src/rows.ts'
import { treeOf } from '../src/tree.ts'
import { MAX_NODES as hetuNodes } from '../../hetu/core/api/ui-limits.ts'
import { floorConstants } from '../../hetu/core/api/floor.ts'
import { measurePlain } from '../../hetu/core/api/measure.ts'

const tree = treeOf([['a/1.md', 'a/b/2.md', 'a/b/c/3.md', 'd.md']])
const shown = (open: string[]) => rowsOf(tree, new Set(open)).map(row => `${'  '.repeat(row.depth)}${row.kind === 'folder' ? `${row.open ? 'v' : '>'} ` : ''}${row.name}`)
const button = (n: number): UiNode => ({ id: `r${n}`, kind: 'button', text: `n${n}` })
// A selected row: the row's button with two more beside it, three nodes
const selected = (n: number): UiNode => ({ id: `s${n}`, kind: 'box', children: [button(n), { id: `x${n}`, kind: 'button', text: 'Rename' }] })

describe('the rows the view draws', () => {
  it('holds hetu\'s caps on a tree and a call', () => {
    expect(MAX_NODES).toBe(hetuNodes)
    expect(MAX_CALL_BYTES).toBe(floorConstants.argumentBytes)
  })

  it('shows folders closed at first and the rows of open folders only, depth first', () => {
    expect(shown([])).toEqual(['> a', 'd'])
    expect(shown(['a'])).toEqual(['v a', '  > b', '  1', 'd'])
    expect(shown(['a', 'a/b'])).toEqual(['v a', '  v b', '    > c', '    2', '  1', 'd'])
    // A folder open inside a closed one shows nothing until its parent opens
    expect(shown(['a/b'])).toEqual(['> a', 'd'])
  })

  it('names every folder of the tree, so open state can drop one that is gone', () => {
    expect([...folderPaths(tree)].sort()).toEqual(['a', 'a/b', 'a/b/c'])
  })

  it('draws every row that fits, or as many as fit with a last row that says how many more there are', () => {
    const rows = Array.from({ length: 10 }, (_, n) => n)
    expect(rowNodes(rows, button, { nodes: 10, bytes: 1e6 }).map(node => node.id)).toEqual(rows.map(n => `r${n}`))
    const cut = rowNodes(rows, button, { nodes: 6, bytes: 1e6 })
    expect(cut.map(node => node.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'more'])
    expect(cut.at(-1)).toMatchObject({ kind: 'text', text: '5 more' })
  })

  // The drawer's cap counts every node of the tree, a row's own children too
  it('counts nodes, not rows, against the cap', () => {
    const made = rowNodes([0, 1, 2, 3, 4], n => (n === 1 ? selected(n) : button(n)), { nodes: 6, bytes: 1e6 })
    const count = (node: UiNode): number => 1 + ((node as { children?: UiNode[] }).children ?? []).reduce((sum, child) => sum + count(child), 0)
    expect(made.reduce((sum, node) => sum + count(node), 0)).toBeLessThanOrEqual(6)
    expect(made.map(node => node.id)).toEqual(['r0', 's1', 'r2', 'more'])
  })

  it('measures a value as hetu measures a call', () => {
    for (const value of ['', 'abc', '河\u{1f600}é', [], [1, 'a', null], { a: 1, b: [true, { c: 'd' }] }, { id: 'r1', kind: 'button', text: 'n', style: { color: 'red' } }]) {
      expect(sizeOf(value), JSON.stringify(value)).toBe((measurePlain(value, 1e9) as { bytes: number }).bytes)
    }
  })

  it('keeps the rows under the bytes left for them, as hetu measures them', () => {
    const wide = (n: number): UiNode => ({ id: `r${n}`, kind: 'button', text: '河'.repeat(100) })
    const made = rowNodes(Array.from({ length: 100 }, (_, n) => n), wide, { nodes: 1000, bytes: 4000 })
    // The array's own 8 belongs to the list, counted with the rest of the tree
    expect((measurePlain(made, 1e9) as { bytes: number }).bytes - 8).toBeLessThanOrEqual(4000)
    expect(made.length).toBeGreaterThan(5)
    expect(made.at(-1)).toMatchObject({ id: 'more' })
  })
})
