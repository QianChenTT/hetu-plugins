// The luoshu as the explorer shows it: folders and the notes in them. A note is a .md file, named without .md. A
// folder is what a note's path implies, so a folder with no note under it at any depth isn't shown
export type Note = { readonly path: string, readonly name: string }
export type Folder = { readonly path: string, readonly name: string, readonly folders: Folder[], readonly notes: Note[] }

const NOTE = '.md'

export function isNote(path: string): boolean {
  return path.endsWith(NOTE)
}

// Case folded first, so A and a sit together, then code units, so two names that differ only in case always come in
// one order
export function byName(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x !== y) return x < y ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

// The tree of every page of a listing, taken whole and in any split. In each folder the folders come first, then the
// notes, each in name order
export function treeOf(pages: readonly (readonly string[])[]): Folder {
  const root: Folder = { path: '', name: '', folders: [], notes: [] }
  const folders = new Map<string, Folder>([['', root]])
  for (const page of pages) {
    for (const path of page) {
      if (!isNote(path)) continue
      const parts = path.split('/')
      let parent = root
      // Every part but the last is a folder, the last is the note
      for (let at = 0; at < parts.length - 1; at++) {
        const where = parts.slice(0, at + 1).join('/')
        let folder = folders.get(where)
        if (folder === undefined) {
          folder = { path: where, name: parts[at]!, folders: [], notes: [] }
          folders.set(where, folder)
          parent.folders.push(folder)
        }
        parent = folder
      }
      parent.notes.push({ path, name: parts.at(-1)!.slice(0, -NOTE.length) })
    }
  }
  for (const folder of folders.values()) {
    folder.folders.sort((a, b) => byName(a.name, b.name))
    folder.notes.sort((a, b) => byName(a.name, b.name))
  }
  return root
}
