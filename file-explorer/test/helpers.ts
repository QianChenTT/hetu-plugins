import path from 'node:path'
import type { UiNode } from '@hetu/sdk'
import { type FakeCore, fakeCore, type FakeCoreOptions, FakeDrawer } from '@hetu/sdk/testing'

export const manifest = path.join(import.meta.dirname, '..', 'hetu-plugin.json')
const cores: FakeCore[] = []

// A fake core with a drawer, closed by close()
export function core(options: Omit<FakeCoreOptions, 'manifest' | 'drawer'> = {}): { fake: FakeCore, drawer: FakeDrawer } {
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
