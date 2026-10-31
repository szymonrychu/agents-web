/** Test helpers for the (lazy) code editor inside a `TemplateEditor` group named by its label. */
import { EditorView } from '@codemirror/view'
import { screen, waitFor, within } from '@testing-library/react'

/** jsdom has no layout, so CodeMirror needs these two Range methods stubbed; returns the restore function. */
export function stubRangeRects(): () => void {
  const original = { rects: Range.prototype.getClientRects, box: Range.prototype.getBoundingClientRect }
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  return () => {
    Range.prototype.getClientRects = original.rects
    Range.prototype.getBoundingClientRect = original.box
  }
}

/** The group of the template editor labelled `label`. */
export const editorGroup = (label: string): HTMLElement => screen.getByRole('group', { name: label })

/** The CodeMirror view of the template editor labelled `label`, once its lazy chunk has loaded. */
export const editorView = (label: string): Promise<EditorView> =>
  waitFor(() => {
    const v = EditorView.findFromDOM(within(editorGroup(label)).getByTestId('file-editor'))
    if (!v) throw new Error('editor not ready')
    return v
  })

/** Replaces the text of the editor labelled `label`. */
export async function setEditorText(label: string, text: string): Promise<void> {
  const view = await editorView(label)
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
}

/** The current text of the editor labelled `label`. */
export async function editorText(label: string): Promise<string> {
  return (await editorView(label)).state.doc.toString()
}
