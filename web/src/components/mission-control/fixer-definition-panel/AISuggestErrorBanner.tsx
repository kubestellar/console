import { motion } from 'framer-motion'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '../../ui/Button'
import { LazyMarkdown as ReactMarkdown } from '../../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

interface AISuggestErrorBannerProps {
  errorContent: string
  onRetry: () => void
  disabled: boolean
}

export function AISuggestErrorBanner({ errorContent, onRetry, disabled }: AISuggestErrorBannerProps) {
  const message = errorContent.trim() ||
    'AI Suggest failed. The AI provider returned an error or the agent is not reachable. Check your provider configuration in Settings, make sure your local agent is running, and try again.'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 overflow-hidden"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-destructive mb-1">AI Suggest failed</div>
          <div className="text-xs text-foreground/85 leading-relaxed prose prose-invert prose-xs max-w-none [&_p]:my-1 [&_strong]:text-foreground [&_code]:bg-secondary/60 [&_code]:px-1 [&_code]:rounded [&_a]:text-primary [&_a]:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {message}
            </ReactMarkdown>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={disabled}
          className="shrink-0 h-7 px-3"
          icon={<RotateCcw className="w-3 h-3" />}
        >
          Retry
        </Button>
      </div>
    </motion.div>
  )
}
