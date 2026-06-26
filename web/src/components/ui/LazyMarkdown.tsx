import { Suspense, type ComponentProps } from 'react'
import { safeLazy } from '@/lib/safeLazy'

const ReactMarkdown = safeLazy(() => import('react-markdown'), 'default')

type LazyMarkdownProps = ComponentProps<typeof ReactMarkdown>

/**
 * Lazy-loaded wrapper around react-markdown.
 * Use in modals and dialogs where the initial bundle cost of react-markdown
 * (~45 KB gzipped) isn't justified since content renders after user interaction.
 *
 * For always-visible surfaces (e.g., chat sidebar), import react-markdown
 * directly to avoid a Suspense flash.
 */
export function LazyMarkdown(props: LazyMarkdownProps) {
  return (
    <Suspense fallback={<div className="animate-pulse text-muted-foreground text-sm">Loading…</div>}>
      <ReactMarkdown {...props} />
    </Suspense>
  )
}
