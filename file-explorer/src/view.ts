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
const SELECTED = { 'background-color': 'var(--hetu-color-selection)', 'font-weight': '600' }
const CHOSEN = { display: 'flex', 'align-items': 'center', gap: '4px', height: '100%' }
const SMALL = {
  border: '1px solid var(--hetu-color-border)',
  'border-radius': 'var(--hetu-radius)',
  'background-color': 'var(--hetu-color-bg)',
  color: 'var(--hetu-color-fg)',
  padding: '2px 8px',
  cursor: 'pointer',
}
const BAR = { display: 'flex', gap: '4px', padding: '0 4px 8px' }
const INPUT = { flex: '1 1 auto', 'min-width': '0', padding: '2px 6px', border: '1px solid var(--hetu-color-border)', 'border-radius': 'var(--hetu-radius)' }
const ASK = {
  padding: '8px',
  'background-color': 'var(--hetu-color-surface)',
  border: '1px solid var(--hetu-color-border)',
  'border-radius': 'var(--hetu-radius)',
  color: 'var(--hetu-color-fg)',
}

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

export type Selected = { readonly kind: 'folder' | 'note', readonly path: string }
// What the view asks for besides the rows: a name for a new note or a note's new path, or whether to delete a note
export type Mode =
  | { readonly kind: 'none' }
  | { readonly kind: 'create', readonly value: string }
  | { readonly kind: 'rename', readonly from: string, readonly value: string }
  | { readonly kind: 'confirm', readonly path: string }

export type Look = {
  readonly rows: readonly Row[]
  readonly ids: Ids
  readonly status: string | null
  readonly selected: Selected | null
  readonly mode: Mode
}

const same = (row: Row, selected: Selected | null) => selected !== null && row.kind === selected.kind && row.path === selected.path

// A row is a button, so it takes focus and the keys the view binds reach it. The selected note's row holds Rename and
// Delete beside it, for whoever never presses F2 or Delete
function rowNode(row: Row, look: Look): UiNode {
  const text = row.kind === 'folder' ? `${row.open ? '▾' : '▸'} ${shown(row.name)}` : shown(row.name)
  const chosen = same(row, look.selected)
  const style = { ...ROW, 'padding-left': `${8 + row.depth * 12}px`, ...(chosen ? SELECTED : {}) }
  const button: UiNode = { id: look.ids.id(row), kind: 'button', text, style, hover: { ...HOVER } }
  if (!chosen || row.kind !== 'note') return button
  return {
    id: 'chosen',
    kind: 'box',
    style: { ...CHOSEN },
    children: [{ ...button, style: { ...style, flex: '1 1 auto', width: 'auto' } }, small('rename', 'Rename'), small('delete', 'Delete')],
  }
}

function small(id: string, text: string): UiNode {
  return { id, kind: 'button', text, style: { ...SMALL }, hover: { ...HOVER } }
}

// Control characters and the marks that set the direction of text, which could reorder or hide the text around a name.
// Each is drawn as U+FFFD, so a name made only of them still draws as something and two names that differ only in them
// still differ. U+FFFD is one code unit and three UTF-8 bytes as each bidi mark is, so a name drawn is no longer than
// the name. A path with a control character matches no grant and is never listed, so those reach the view only in a
// typed path
const HIDING = /[\p{Cc}\p{Bidi_Control}]/gu

export function shown(text: string): string {
  return text.replace(HIDING, '\ufffd')
}

// The bar: New note, or the name being typed with Cancel. Enter in the input does it
function bar(mode: Mode): UiNode {
  if (mode.kind !== 'create' && mode.kind !== 'rename') return { id: 'bar', kind: 'box', style: { ...BAR }, children: [small('new', 'New note')] }
  const placeholder = mode.kind === 'create' ? 'folder/name' : 'folder/new name'
  return {
    id: 'bar',
    kind: 'box',
    style: { ...BAR },
    children: [{ id: 'name', kind: 'input', value: mode.value, placeholder, style: { ...INPUT } }, small('cancel', 'Cancel')],
  }
}

// Asked in the view with its own looks, a question the plugin draws and not a security Confirm of hetu's
function ask(path: string): UiNode {
  return {
    id: 'ask',
    kind: 'popover',
    anchor: 'bar',
    side: 'below',
    style: { ...ASK },
    children: [
      { id: 'ask-text', kind: 'text', text: `Move ${shown(path)} to the recycle bin?` },
      { id: 'ask-row', kind: 'box', style: { ...BAR }, children: [small('yes', 'Move to recycle bin'), small('no', 'Cancel')] },
    ],
  }
}

// The whole view: the bar, the rows the caps leave room for once the rest of the tree is counted, a status line and the
// question before a delete
export function viewOf(look: Look): UiNode {
  const list = (rows: UiNode[]): UiNode => ({ id: 'rows', kind: 'list', rowHeight: ROW_HEIGHT, rows, style: { ...LIST } })
  const frame = (rows: UiNode[]): UiNode => ({
    id: 'root',
    kind: 'box',
    style: { ...ROOT },
    children: [
      bar(look.mode),
      list(rows),
      ...(look.status === null ? [] : [{ id: 'status', kind: 'text', text: shown(look.status), style: { ...STATUS } } as UiNode]),
      ...(look.mode.kind === 'confirm' ? [ask(look.mode.path)] : []),
    ],
  })
  const empty = frame([])
  const room = { nodes: MAX_NODES - countOf(empty), bytes: MAX_CALL_BYTES - CALL_SLACK - sizeOf(empty) }
  return frame(rowNodes(look.rows, row => rowNode(row, look), room))
}
