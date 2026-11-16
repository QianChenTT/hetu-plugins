import type { PluginContext, UiEvent } from '@hetu/sdk'
import { folderPaths, rowsOf } from './rows.ts'
import { type Folder, treeOf } from './tree.ts'
import { Ids, viewOf } from './view.ts'

// The folders the human opened, kept in storage under this key
const OPEN = 'open'

type ViewEvent = Extract<UiEvent, { topic: 'view.event' }>

// The explorer of one run: the tree of the last listing, the folders open in it and the views that show it
export class Explorer {
  private readonly ctx: PluginContext
  private readonly instances = new Set<string>()
  private readonly ids = new Ids()
  private tree: Folder = treeOf([])
  private open = new Set<string>()
  private status: string | null = null
  private drawing = false
  private drawAgain = false

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
    const saved = await this.ctx.try(this.ctx.storage.get({ key: OPEN }))
    if (saved.ok && Array.isArray(saved.value)) this.open = new Set(saved.value.filter((path): path is string => typeof path === 'string'))
    void this.list()
  }

  private async list(): Promise<void> {
    const pages: string[][] = []
    let after: string | undefined
    for (;;) {
      const page = await this.ctx.try(this.ctx.luoshu.list(after === undefined ? {} : { after }))
      if (!page.ok) {
        this.status = `Listing refused: ${page.refused.code}`
        return this.draw()
      }
      pages.push(page.value.paths)
      if (page.value.next === null) break
      after = page.value.next
    }
    this.listed(pages)
  }

  // A new listing's tree. A folder no longer in it is no longer open, so one made again under that name starts closed
  private listed(pages: string[][]): void {
    this.tree = treeOf(pages)
    this.status = null
    const folders = folderPaths(this.tree)
    const kept = [...this.open].filter(path => folders.has(path))
    if (kept.length !== this.open.size) {
      this.open = new Set(kept)
      void this.saveOpen()
    }
    void this.draw()
  }

  private async heard(event: ViewEvent): Promise<void> {
    if (event.type !== 'click' || !this.instances.has(event.instance)) return
    const row = this.ids.row(event.node)
    if (row?.kind !== 'folder') return
    if (!this.open.delete(row.path)) this.open.add(row.path)
    await Promise.all([this.saveOpen(), this.draw()])
  }

  private async saveOpen(): Promise<void> {
    await this.ctx.try(this.ctx.storage.set({ key: OPEN, value: [...this.open] }))
  }

  // One draw at a time, and one more after it when anything changed meanwhile
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
        const tree = viewOf({ rows, ids: this.ids, status: this.status })
        for (const instance of this.instances) await this.ctx.try(this.ctx.ui.views.draw(instance, tree))
      } while (this.drawAgain)
    } finally {
      this.drawing = false
    }
  }
}
