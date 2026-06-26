/**
 * Lazy-loaded CodeMirror wrapper component.
 * Prevents CodeMirror (~100KB+) from bloating the main bundle.
 * Used by DrasiModals.tsx and DrasiStreamSamples.tsx.
 */
import React, { Suspense } from 'react'
import type { CodeMirrorEditorProps } from './CodeMirrorEditor'

const CodeMirrorEditor = React.lazy(() => import('./CodeMirrorEditor'))

export function LazyCodeMirror(props: CodeMirrorEditorProps) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-secondary/20 rounded" />}>
      <CodeMirrorEditor {...props} />
    </Suspense>
  )
}
