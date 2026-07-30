/**
 * CodeMirror editor component with all heavy imports.
 * This file is lazy-loaded to avoid bloating the main bundle.
 * Used by LazyCodeMirror.tsx wrapper.
 */
import CodeMirror from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import type { ReactCodeMirrorProps } from '@uiw/react-codemirror'

export interface CodeMirrorEditorProps extends Omit<ReactCodeMirrorProps, 'extensions'> {
  /** CodeMirror extensions (language modes, themes, etc.) */
  extensions?: Extension[]
}

export default function CodeMirrorEditor(props: CodeMirrorEditorProps) {
  return <CodeMirror {...props} />
}
