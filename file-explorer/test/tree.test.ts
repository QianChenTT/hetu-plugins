import { describe, expect, it } from 'vitest'
import { type Folder, treeOf } from '../src/tree.ts'

// The tree as nested lists of names, folders with a slash, for a readable compare
function shape(folder: Folder): unknown[] {
  return [...folder.folders.map(child => ({ [`${child.name}/`]: shape(child) })), ...folder.notes.map(note => note.name)]
}

const paths = (folder: Folder): string[] => [...folder.folders.flatMap(paths), ...folder.notes.map(note => note.path)]

describe('the tree model', () => {
  it('makes folders of what the paths imply and notes of the .md names, an empty folder not shown', () => {
    const tree = treeOf([['a.md', 'img/x.png', 'journal/2026/b.md', 'journal/c.md', 'journal/raw/data.json', 'z.txt']])
    expect(shape(tree)).toEqual([{ 'journal/': [{ '2026/': ['b'] }, 'c'] }, 'a'])
    expect(tree.folders[0]).toMatchObject({ path: 'journal', name: 'journal' })
    expect(tree.folders[0]!.folders[0]).toMatchObject({ path: 'journal/2026', name: '2026' })
    expect(tree.folders[0]!.folders[0]!.notes[0]).toEqual({ path: 'journal/2026/b.md', name: 'b' })
  })

  it('holds 10,000 names, every note once in its folder', () => {
    const names = Array.from({ length: 10_000 }, (_, i) => `f${String(i % 50).padStart(2, '0')}/n${String(i).padStart(5, '0')}.md`)
    const tree = treeOf([names.slice(0, 1000), names.slice(1000)])
    expect(tree.folders).toHaveLength(50)
    expect(tree.folders.every(folder => folder.notes.length === 200)).toBe(true)
    expect(paths(tree).sort()).toEqual([...names].sort())
  })

  // A listing's pages end wherever the thousandth name falls, often inside a folder
  it('makes the same tree whatever page a folder\'s names were split across', () => {
    const names = ['a.md', 'b/1.md', 'b/2.md', 'b/c/3.md', 'b/c/4.md', 'b/d.md', 'e.md']
    const whole = treeOf([names])
    for (let cut = 1; cut < names.length; cut++) {
      expect(treeOf([names.slice(0, cut), names.slice(cut)]), `cut at ${cut}`).toEqual(whole)
    }
    expect(treeOf(names.map(name => [name]))).toEqual(whole)
  })

  it('moves a note renamed under an open folder and drops a folder its last note left', () => {
    const before = treeOf([['a/b/old.md', 'a/b/other.md', 'a/c/only.md']])
    const after = treeOf([['a/b/new.md', 'a/b/other.md', 'a/only.md']])
    expect(shape(before)).toEqual([{ 'a/': [{ 'b/': ['old', 'other'] }, { 'c/': ['only'] }] }])
    expect(shape(after)).toEqual([{ 'a/': [{ 'b/': ['new', 'other'] }, 'only'] }])
  })

  it('keeps two names that differ only in case as two notes, in one order whatever the listing\'s', () => {
    expect(shape(treeOf([['A.md', 'a.md', 'B.md']]))).toEqual(['A', 'a', 'B'])
    expect(shape(treeOf([['a.md', 'B.md', 'A.md']]))).toEqual(['A', 'a', 'B'])
    expect(shape(treeOf([['Docs/x.md', 'docs/y.md']]))).toEqual([{ 'Docs/': ['x'] }, { 'docs/': ['y'] }])
  })

  it('shows a note and a folder that share a stem apart, the folder first', () => {
    const tree = treeOf([['x.md', 'x/y.md']])
    expect(shape(tree)).toEqual([{ 'x/': ['y'] }, 'x'])
    expect(tree.notes).toEqual([{ path: 'x.md', name: 'x' }])
    expect(tree.folders[0]!.path).toBe('x')
  })
})
