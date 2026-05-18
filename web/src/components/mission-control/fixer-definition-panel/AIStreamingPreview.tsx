import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { LazyMarkdown as ReactMarkdown } from '../../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { Mission } from '../../../hooks/useMissions'
import { getAssistantContentSinceLastUser } from '../useMissionControl'
import { stripMissionPlannerJson } from './fixerDefinitionPanel.utils'

interface AIStreamingPreviewProps {
  planningMission: Mission | null | undefined
}

export function AIStreamingPreview({ planningMission }: AIStreamingPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rawText = getAssistantContentSinceLastUser(planningMission?.messages)
  const displayText = stripMissionPlannerJson(rawText)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayText])

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg bg-primary/5 border border-primary/20 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-primary/10">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-xs font-semibold text-primary">AI is analyzing your requirements...</span>
      </div>

      <div
        ref={scrollRef}
        className="px-4 py-3 max-h-48 overflow-y-auto text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_strong]:text-foreground/90"
      >
        {displayText ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {displayText}
          </ReactMarkdown>
        ) : (
          <span className="text-muted-foreground/60 italic">Thinking...</span>
        )}
        <span className="inline-block w-1.5 h-3.5 bg-primary/60 ml-0.5 animate-pulse align-text-bottom" />
      </div>
    </motion.div>
  )
}
