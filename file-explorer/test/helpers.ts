import path from 'node:path'
import { definePlugin, type UiNode } from '@hetu/sdk'
import { type FakeCore, fakeCore, type FakeCoreOptions, FakeDrawer } from '@hetu/sdk/testing'
import { Explorer } from '../src/explorer.ts'

export const manifest = path.join(import.meta.dirname, '..', 'hetu-plugin.json')

// The wait between two listings for tests that make one change after another, where GAP_MS would only slow them
export const QUICK_MS = 10
export const quick = definePlugin({ start: ctx => new Explorer(ctx, QUICK_MS).start() })

const cores: FakeCore[] = []

// A fake core with a drawer, closed by close()
export function core(options: Omit<FakeCoreOptions, 'manifest' | 'drawer'> & { manifest?: FakeCoreOptions['manifest'] } = {}): { fake: FakeCore, drawer: FakeDrawer } {
  const drawer = new FakeDrawer()
  const fake = fakeCore({ manifest, drawer, ...options })
  cores.push(fake)
  return { fake, drawer }
}

export async function close(): Promise<void> {
  for (const made of cores.splice(0)) await made.close()
}

export const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms))

export async function until(check: () => boolean, ms = 3000): Promise<void> {
  for (let waited = 0; !check(); waited += 10) {
    if (waited > ms) throw new Error('nothing arrived in time')
    await tick(10)
  }
}

// Every node of a tree, a list's rows and a node's children alike
export function nodes(tree: UiNode | null): UiNode[] {
  if (tree === null) return []
  const kids = [...((tree as { children?: UiNode[] }).children ?? []), ...((tree as { rows?: UiNode[] }).rows ?? [])]
  return [tree, ...kids.flatMap(nodes)]
}

export function instance(drawer: FakeDrawer): string {
  return drawer.instances()[0]!.instance
}

export function view(drawer: FakeDrawer): UiNode | null {
  return drawer.instances().length === 0 ? null : drawer.tree(instance(drawer))
}

// The list's rows as the text each shows: a folder's arrow and name, a note's name, the count of rows left out
export function rows(drawer: FakeDrawer): string[] {
  const list = nodes(view(drawer)).find(node => node.kind === 'list') as { rows: UiNode[] } | undefined
  return (list?.rows ?? []).map(row => textOf(row))
}

function textOf(row: UiNode): string {
  if (row.kind === 'text' || row.kind === 'button') return row.text
  const first = (row as { children?: UiNode[] }).children?.[0]
  return first === undefined ? '' : textOf(first)
}

// The node a row's text names, the one a click on the row hits
export function row(drawer: FakeDrawer, text: string): string {
  const list = nodes(view(drawer)).find(node => node.kind === 'list') as { rows: UiNode[] } | undefined
  const found = list?.rows.find(at => textOf(at) === text)
  if (found === undefined) throw new Error(`no row ${text} in ${JSON.stringify(rows(drawer))}`)
  return found.kind === 'button' ? found.id : (found as { children: UiNode[] }).children[0]!.id
}

export function click(drawer: FakeDrawer, node: string): void {
  drawer.emit({ topic: 'view.event', instance: instance(drawer), node, type: 'click' })
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function emit(drawer: FakeDrawer, node: string, type: 'input' | 'submit', value: string): void {
  drawer.emit({ topic: 'view.event', instance: instance(drawer), node, type, value })
}

export function command(drawer: FakeDrawer, name: string): void {
  drawer.emit({ topic: 'view.command', instance: instance(drawer), command: name })
}

// The texts the view shows outside the rows: the bar, the status line, the question before a delete
export function texts(drawer: FakeDrawer): string[] {
  const list = nodes(view(drawer)).find(node => node.kind === 'list') as { rows: UiNode[] } | undefined
  const inRows = new Set(nodes({ id: 'x', kind: 'box', children: list?.rows ?? [] }).map(node => node.id))
  return nodes(view(drawer)).filter(node => !inRows.has(node.id) && (node.kind === 'text' || node.kind === 'button')).map(node => (node as { text: string }).text)
}

export function has(drawer: FakeDrawer, id: string): boolean {
  return nodes(view(drawer)).some(node => node.id === id)
}
