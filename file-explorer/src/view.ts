import type { UiNode } from '@hetu/sdk'
import { countOf, MAX_CALL_BYTES, MAX_NODES, type Row, rowNodes, sizeOf } from './rows.ts'

// What a draw call carries besides the tree: the envelope, the instance and the operation
const CALL_SLACK = 4096
const ROW_HEIGHT = 28

// The looks of hetu's old sidebar, in the properties and tokens the drawer takes
const ROOT = { display: 'flex', 'flex-direction': 'column', height: '100%', padding: '8px 4px', 'box-sizing': 'border-box' }
const LIST = { flex: '1 1 0', 'min-height': '0' }
const ROW = {
  width: '100%',
  'text-align': 'left',
  border: '0',
  'background-color': 'transparent',
  'border-radius': 'var(--hetu-radius)',
  color: 'var(--hetu-color-fg)',
  'white-space': 'nowrap',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
  cursor: 'pointer',
}
const HOVER = { 'background-color': 'var(--hetu-color-surface)' }
const STATUS = { padding: '4px 8px', color: 'var(--hetu-color-muted)', 'font-size': '12px' }

// Node ids that stay with a row across draws, so a click names the row it was made on and not the one drawn there since
export class Ids {
  private readonly byKey = new Map<string, string>()
  private readonly byId = new Map<string, Pick<Row, 'kind' | 'path'>>()
  private n = 0

  id(row: Pick<Row, 'kind' | 'path'>): string {
    const key = `${row.kind}:${row.path}`
    let id = this.byKey.get(key)
    if (id === undefined) {
      id = `r${++this.n}`
      this.byKey.set(key, id)
      this.byId.set(id, { kind: row.kind, path: row.path })
    }
    return id
  }

  row(id: string): Pick<Row, 'kind' | 'path'> | undefined {
    return this.byId.get(id)
  }

  // Drops the ids of rows no longer drawn
  keep(rows: readonly Row[]): void {
    const keys = new Set(rows.map(row => `${row.kind}:${row.path}`))
    for (const [key, id] of this.byKey) {
      if (keys.has(key)) continue
      this.byKey.delete(key)
      this.byId.delete(id)
    }
  }
}

export type Look = { readonly rows: readonly Row[], readonly ids: Ids, readonly status: string | null }

function rowNode(row: Row, ids: Ids): UiNode {
  const text = row.kind === 'folder' ? `${row.open ? '▾' : '▸'} ${row.name}` : row.name
  return { id: ids.id(row), kind: 'button', text, style: { ...ROW, 'padding-left': `${8 + row.depth * 12}px` }, hover: { ...HOVER } }
}

// The whole view: the rows the caps leave room for once the rest of the tree is counted, and a status line
export function viewOf(look: Look): UiNode {
  const list = (rows: UiNode[]): UiNode => ({ id: 'rows', kind: 'list', rowHeight: ROW_HEIGHT, rows, style: LIST })
  const frame = (rows: UiNode[]): UiNode => ({
    id: 'root',
    kind: 'box',
    style: ROOT,
    children: [list(rows), ...(look.status === null ? [] : [{ id: 'status', kind: 'text', text: look.status, style: STATUS } as UiNode])],
  })
  const empty = frame([])
  const room = { nodes: MAX_NODES - countOf(empty), bytes: MAX_CALL_BYTES - CALL_SLACK - sizeOf(empty) }
  return frame(rowNodes(look.rows, row => rowNode(row, look.ids), room))
}
