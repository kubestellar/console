import type { ReactNode } from 'react'
import { CodeBlock } from '../../components/ui/CodeBlock'

type ChildrenProp = { children?: ReactNode }
type CodeProp = { className?: string; children?: ReactNode }
type LinkProp = { href?: string; children?: ReactNode }

export function buildReleaseNotesComponents(fontSize: 'sm' | 'base' | 'lg' = 'sm') {
  return {
    code({ className, children, ...props }: CodeProp) {
      const match = /language-(\w+)/.exec(className || '')
      const isInline = !match && !className
      return isInline ? (
        <code className={className} {...props}>{children}</code>
      ) : (
        <CodeBlock language={match?.[1] || 'text'} fontSize={fontSize}>
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      )
    },
    a: ({ href, children }: LinkProp) => {
      const safeHref = href && /^(https?:|\/|mailto:|#)/i.test(href) ? href : undefined
      if (!safeHref) return <span className="text-muted-foreground">{children}</span>
      return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300">{children}</a>
    },
    h1: ({ children }: ChildrenProp) => (
      <h1 className="mt-6 mb-3 pt-3 pl-3 border-l-3 border-purple-500/50 border-t border-border/30 first:border-t-0 first:pt-0 first:mt-0 text-xl font-bold">{children}</h1>
    ),
    h2: ({ children }: ChildrenProp) => (
      <h2 className="mt-6 mb-3 pt-3 pl-3 border-l-2 border-blue-500/40 border-t border-border/30 first:border-t-0 first:pt-0 first:mt-0 text-lg font-bold">{children}</h2>
    ),
    h3: ({ children }: ChildrenProp) => (
      <h3 className="mt-5 mb-2 pt-2 border-t border-border/20 first:border-t-0 first:pt-0 first:mt-0 text-base font-semibold text-foreground">{children}</h3>
    ),
    h4: ({ children }: ChildrenProp) => <h4 className="mt-4 mb-2 font-semibold">{children}</h4>,
    h5: ({ children }: ChildrenProp) => <h5 className="mt-4 mb-2 font-medium">{children}</h5>,
    h6: ({ children }: ChildrenProp) => <h6 className="mt-3 mb-2 font-medium">{children}</h6>,
    p: ({ children }: ChildrenProp) => <p className="my-3 leading-relaxed">{children}</p>,
    ul: ({ children }: ChildrenProp) => <ul className="my-3 ml-5 list-disc space-y-1.5 marker:text-purple-400">{children}</ul>,
    ol: ({ children }: ChildrenProp) => <ol className="my-3 ml-5 list-decimal space-y-1.5 marker:text-blue-400">{children}</ol>,
    li: ({ children }: ChildrenProp) => <li className="pl-1 leading-relaxed">{children}</li>,
    blockquote: ({ children }: ChildrenProp) => (
      <blockquote className="my-4 pl-4 border-l-3 border-yellow-500/50 bg-yellow-500/5 rounded-r-lg py-2 pr-3 text-sm italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    strong: ({ children }: ChildrenProp) => <strong className="font-semibold text-foreground">{children}</strong>,
    hr: () => <hr className="my-6 border-t border-border/50" />,
    table: ({ children }: ChildrenProp) => (
      <div className="overflow-x-auto w-full my-4 rounded border border-border">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: ChildrenProp) => <thead className="bg-secondary/50">{children}</thead>,
    th: ({ children }: ChildrenProp) => (
      <th className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border whitespace-nowrap">{children}</th>
    ),
    td: ({ children }: ChildrenProp) => (
      <td className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50 max-w-[200px] wrap-break-word">{children}</td>
    ),
  }
}
