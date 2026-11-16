import type { PluginContext, Refused, UiEvent } from '@hetu/sdk'
import { listAll } from './listing.ts'
import { Refresher } from './refresh.ts'
import { folderPaths, rowsOf } from './rows.ts'
import { type Folder, treeOf } from './tree.ts'
import { Ids, type Mode, type Selected, viewOf } from './view.ts'

// The folders the human opened, kept in storage under this key
const OPEN = 'open'

// F2 renames and Delete asks to delete the selected note, while focus is in the view
export const BINDINGS = [{ key: 'F2', command: 'rename' }, { key: 'Delete', command: 'delete' }]

type ViewEvent = Extract<UiEvent, { topic: 'view.event' }>

const NOTE = '.md'
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')

// Lists again on each change the luoshu makes or sees made outside it and on events.dropped, which says changes were
// missed
export async function subscribe(ctx: Pick<PluginContext, 'events'>, refresh: () => void): Promise<void> {
  await ctx.events.on(['luoshu.changed', 'luoshu.outside'], () => refresh(), { onResync: () => refresh() })
}

// The explorer of one run: the tree of the last listing, the folders open in it and the views that show it
export class Explorer {
  private readonly ctx: PluginContext
  private readonly instances = new Set<string>()
  private readonly ids = new Ids()
  private tree: Folder = treeOf([])
  private open = new Set<string>()
  // Why the last listing failed and what the last action came to, shown in the status line
  private listing: string | null = null
  private told: string | null = null
  private selected: Selected | null = null
  private mode: Mode = { kind: 'none' }
  private drawing = false
  private drawAgain = false
  private readonly refresher = new Refresher(() => this.list())

  constructor(ctx: PluginContext) {
    this.ctx = ctx
  }

  // The handlers go first, so events held for start reach them
  async start(): Promise<void> {
    this.ctx.ui.on('view.opened', event => {
      this.instances.add(event.instance)
      void this.draw()
    })
    this.ctx.ui.on('view.closed', event => {
      this.instances.delete(event.instance)
    })
    this.ctx.ui.on('view.event', event => void this.heard(event))
    this.ctx.ui.on('view.command', event => {
      if (this.instances.has(event.instance)) void this.commanded(event.command)
    })
    await this.ctx.try(this.ctx.ui.views.bind(BINDINGS))
    const saved = await this.ctx.try(this.ctx.storage.get({ key: OPEN }))
    if (saved.ok && Array.isArray(saved.value)) this.open = new Set(saved.value.filter((path): path is string => typeof path === 'string'))
    await subscribe(this.ctx, () => this.refresher.request())
    this.refresher.request()
  }

  private async list(): Promise<void> {
    const listed = await listAll(args => this.ctx.luoshu.list(args))
    if (listed.ok) return this.listed(listed.pages)
    this.listing = `Listing refused: ${listed.code}`
    await this.draw()
  }

  // A new listing's tree. A folder no longer in it is no longer open, so one made again under that name starts closed
  private listed(pages: string[][]): void {
    this.tree = treeOf(pages)
    this.listing = null
    const folders = folderPaths(this.tree)
    const kept = [...this.open].filter(path => folders.has(path))
    if (kept.length !== this.open.size) {
      this.open = new Set(kept)
      void this.saveOpen()
    }
    void this.draw()
  }

  private async heard(event: ViewEvent): Promise<void> {
    if (!this.instances.has(event.instance)) return
    if (event.node === 'name') {
      if (this.mode.kind !== 'create' && this.mode.kind !== 'rename') return
      const value = typeof event.value === 'string' ? event.value : ''
      this.mode = { ...this.mode, value }
      if (event.type === 'submit') await this.submitted(value)
      return
    }
    if (event.type !== 'click') return
    switch (event.node) {
      case 'new': return this.creating()
      case 'rename': return this.commanded('rename')
      case 'delete': return this.commanded('delete')
      case 'cancel':
      case 'no': return this.show({ kind: 'none' })
      case 'yes': return this.confirmed()
    }
    const row = this.ids.row(event.node)
    if (row === undefined) return
    this.selected = row
    if (row.kind === 'note') return this.opening(row.path)
    if (!this.open.delete(row.path)) this.open.add(row.path)
    await Promise.all([this.saveOpen(), this.draw()])
  }

  // F2 or Delete, or the buttons beside the selected row: always on the note last clicked
  private async commanded(name: string): Promise<void> {
    const note = this.selected?.kind === 'note' ? this.selected.path : null
    if (note === null) return
    if (name === 'rename') return this.show({ kind: 'rename', from: note, value: note })
    if (name === 'delete') return this.show({ kind: 'confirm', path: note })
  }

  private async show(mode: Mode, told: string | null = null): Promise<void> {
    this.mode = mode
    this.told = told
    await this.draw()
  }

  // A click on a note opens it in the editor, which needs a read grant on it. A refusal is shown and nothing else
  private async opening(path: string): Promise<void> {
    this.told = null
    void this.draw()
    const opened = await this.ctx.try(this.ctx.editor.open(path))
    if (!opened.ok) await this.show(this.mode, `Can’t open ${path}: ${opened.refused.code}`)
  }

  // A new note starts in the selected folder, or in the selected note's
  private async creating(): Promise<void> {
    const at = this.selected === null ? '' : this.selected.kind === 'folder' ? `${this.selected.path}/` : this.selected.path.slice(0, this.selected.path.lastIndexOf('/') + 1)
    await this.show({ kind: 'create', value: at })
  }

  private async submitted(value: string): Promise<void> {
    const typed = value.trim()
    if (typed === '') return
    const path = typed.endsWith(NOTE) ? typed : `${typed}${NOTE}`
    const mode = this.mode
    if (mode.kind === 'create') {
      // Empty text and no base version, which the luoshu refuses stale for a name that exists
      const written = await this.ctx.try(this.ctx.luoshu.write({ path, text: '' }))
      if (!written.ok) return this.show(mode, this.refusal(written.refused, `create ${path}`))
      this.selected = { kind: 'note', path }
      return this.show({ kind: 'none' })
    }
    if (mode.kind !== 'rename') return
    // A move never lands on a note that exists. Moving to another folder is typing its path
    const moved = await this.ctx.try(this.ctx.luoshu.move({ from: mode.from, to: path }))
    if (!moved.ok) return this.show(mode, this.refusal(moved.refused, `move ${mode.from} to ${path}`))
    this.selected = { kind: 'note', path }
    await this.show({ kind: 'none' })
  }

  // After the question in the view: the note's version read right before it goes to the recycle bin, so a note that
  // changed since is left as it is
  private async confirmed(): Promise<void> {
    if (this.mode.kind !== 'confirm') return
    const { path } = this.mode
    const read = await this.ctx.try(this.ctx.luoshu.read({ path }))
    if (!read.ok) return this.show({ kind: 'none' }, this.refusal(read.refused, `delete ${path}`))
    const removed = await this.ctx.try(this.ctx.luoshu.remove({ path, baseVersion: read.value.version }))
    if (removed.ok) {
      if (this.selected?.path === path) this.selected = null
      return this.show({ kind: 'none' })
    }
    if (removed.refused.code === 'stale') {
      this.refresher.request()
      return this.show({ kind: 'none' }, `${nameOf(path)} changed since it was read, look again`)
    }
    await this.show({ kind: 'none' }, this.refusal(removed.refused, `delete ${path}`))
  }

  private refusal(refused: Refused, what: string): string {
    return refused.code === 'stale' ? 'That name is taken' : `Can’t ${what}: ${refused.code}`
  }

  private async saveOpen(): Promise<void> {
    await this.ctx.try(this.ctx.storage.set({ key: OPEN, value: [...this.open] }))
  }

  // One draw at a time and one more after it when anything changed meanwhile
  private async draw(): Promise<void> {
    if (this.drawing) {
      this.drawAgain = true
      return
    }
    this.drawing = true
    try {
      do {
        this.drawAgain = false
        const rows = rowsOf(this.tree, this.open)
        this.ids.keep(rows)
        const tree = viewOf({ rows, ids: this.ids, status: this.told ?? this.listing, selected: this.selected, mode: this.mode })
        for (const instance of this.instances) await this.ctx.try(this.ctx.ui.views.draw(instance, tree))
      } while (this.drawAgain)
    } finally {
      this.drawing = false
    }
  }
}
