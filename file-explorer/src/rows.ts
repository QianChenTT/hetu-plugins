import type { UiNode } from '@hetu/sdk'
import type { Folder } from './tree.ts'

// hetu's caps, past which the drawer refuses a draw: the nodes of one view's tree (core/api/ui-limits.ts) and the bytes
// of one call's arguments (core/api/floor.ts). A test holds them to hetu's
export const MAX_NODES = 10_000
export const MAX_CALL_BYTES = 1024 * 1024

export type Row = {
  readonly kind: 'folder' | 'note'
  readonly path: string
  readonly name: string
  readonly depth: number
  readonly open: boolean
}

// The rows of the open folders, depth first: each folder's row, then its folders and notes when open names it. A folder
// open inside a closed one shows nothing
export function rowsOf(root: Folder, open: ReadonlySet<string>): Row[] {
  const rows: Row[] = []
  const walk = (folder: Folder, depth: number) => {
    for (const child of folder.folders) {
      const opened = open.has(child.path)
      rows.push({ kind: 'folder', path: child.path, name: child.name, depth, open: opened })
      if (opened) walk(child, depth + 1)
    }
    for (const note of folder.notes) rows.push({ kind: 'note', path: note.path, name: note.name, depth, open: false })
  }
  walk(root, 0)
  return rows
}

// Every folder of the tree, open or not
export function folderPaths(root: Folder): Set<string> {
  const paths = new Set<string>()
  const walk = (folder: Folder) => {
    for (const child of folder.folders) {
      paths.add(child.path)
      walk(child)
    }
  }
  walk(root)
  return paths
}

// The size hetu's carrier and drawer hold a call to (core/api/measure.ts): the UTF-8 bytes of every key and string, a
// surrogate counted 2, an array's indexes counted as keys, and 8 for every value and every array slot
export function sizeOf(value: unknown): number {
  let bytes = 8
  if (typeof value === 'string') {
    for (let at = 0; at < value.length; at++) {
      const unit = value.charCodeAt(at)
      bytes += unit < 0x80 ? 1 : unit < 0x800 || (unit >= 0xd800 && unit <= 0xdfff) ? 2 : 3
    }
  } else if (Array.isArray(value)) {
    for (const [at, item] of value.entries()) bytes += 8 + String(at).length + sizeOf(item)
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) bytes += sizeOf(key) - 8 + sizeOf(item)
  }
  return bytes
}

// A node with its children and a list's rows, as the drawer counts them
export function countOf(node: UiNode): number {
  const kids = [...((node as { children?: UiNode[] }).children ?? []), ...((node as { rows?: UiNode[] }).rows ?? [])]
  return kids.reduce((sum, kid) => sum + countOf(kid), 1)
}

const MORE = { padding: '0 8px', color: 'var(--hetu-color-muted)', 'line-height': '28px' }

// The nodes of as many rows as fit in room, counted in nodes and in sizeOf bytes with each row's slot and index, in
// order. When a row doesn't fit, a last text says how many rows were left out, and room for it is kept back from every
// row but the last
export function rowNodes<T>(rows: readonly T[], node: (row: T) => UiNode, room: { nodes: number, bytes: number }): UiNode[] {
  const more = (left: number): UiNode => ({ id: 'more', kind: 'text', text: `${left} more`, style: MORE })
  const kept = { nodes: 1, bytes: sizeOf(more(rows.length)) + 8 + String(rows.length).length }
  const made: UiNode[] = []
  let bytes = 0
  let nodes = 0
  for (const [at, row] of rows.entries()) {
    const next = node(row)
    const cost = { nodes: countOf(next), bytes: sizeOf(next) + 8 + String(at).length }
    const last = at === rows.length - 1
    const nodesLeft = room.nodes - (last ? 0 : kept.nodes)
    const bytesLeft = room.bytes - (last ? 0 : kept.bytes)
    if (nodes + cost.nodes > nodesLeft || bytes + cost.bytes > bytesLeft) {
      made.push(more(rows.length - at))
      return made
    }
    made.push(next)
    nodes += cost.nodes
    bytes += cost.bytes
  }
  return made
}
