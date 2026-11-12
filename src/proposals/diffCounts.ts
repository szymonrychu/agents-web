/** Line counts of a diff for the item header (+N -M). Imports `@codemirror/merge`: only lazy modules may import it. */
import { Chunk } from '@codemirror/merge'
import { Text } from '@codemirror/state'

export interface DiffCounts {
  added: number
  removed: number
}

const lineCount = (s: string): number => (s === '' ? 0 : s.split('\n').length)

export function diffCounts(a: string, b: string): DiffCounts {
  if (a === '' || b === '') return { added: lineCount(b), removed: lineCount(a) }
  const docA = Text.of(a.split('\n'))
  const docB = Text.of(b.split('\n'))
  // a chunk's to is one past the end of its last line, or equal to from when it covers no line on that side
  const span = (doc: Text, from: number, to: number): number => (to > from ? doc.lineAt(to - 1).number - doc.lineAt(from).number + 1 : 0)
  let added = 0
  let removed = 0
  for (const c of Chunk.build(docA, docB)) {
    removed += span(docA, c.fromA, c.toA)
    added += span(docB, c.fromB, c.toB)
  }
  return { added, removed }
}
