import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { LazyMarkdown as ReactMarkdown } from '../../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { PayloadProject } from '../types'
import { stripMissionPlannerJson } from './fixerDefinitionPanel.utils'

interface ExecutiveAnalysisProps {
  aiContent: string
  projects: PayloadProject[]
  missionTitle: string
  missionDescription: string
}

export function ExecutiveAnalysis({
  aiContent,
  projects,
  missionTitle,
  missionDescription,
}: ExecutiveAnalysisProps) {
  const [expanded, setExpanded] = useState(true)
  const analysisText = stripMissionPlannerJson(aiContent)
  const requiredProjects = projects.filter((project) => project.priority === 'required')
  const recommendedProjects = projects.filter((project) => project.priority === 'recommended')
  const optionalProjects = projects.filter((project) => project.priority === 'optional')
  const allDependencies = new Set(projects.flatMap((project) => project.dependencies))
  const categories = [...new Set(projects.map((project) => project.category))]

  return (
    <div className="rounded-lg bg-secondary/30 border border-primary/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-primary">Executive Analysis</span>
        <span className="text-[10px] text-muted-foreground ml-1">
          {projects.length} projects · {categories.length} categories · {allDependencies.size} dependencies
        </span>
        <span className="ml-auto text-muted-foreground text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Mission Objective</h4>
            <p className="text-xs text-foreground/80">
              {missionTitle ? `${missionTitle}: ` : ''}
              {missionDescription || 'No description provided'}
            </p>
          </div>

          {analysisText && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">AI Reasoning</h4>
              <div className="text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none [&_table]:text-[10px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-collapse [&_th]:border [&_th]:border-border/30 [&_td]:border [&_td]:border-border/30 [&_th]:bg-secondary/50 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h4]:text-[11px] [&_strong]:text-foreground/90 [&_code]:text-[10px] [&_code]:bg-secondary/60 [&_code]:px-1 [&_code]:rounded">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    td: ({ children, ...props }: ComponentPropsWithoutRef<'td'> & { children?: ReactNode }) => {
                      const raw = String(children ?? '')
                      const text = raw.toLowerCase()
                      let indicator: ReactNode = null
                      let displayChildren: ReactNode = children

                      if (/^missing$/i.test(raw.trim())) {
                        displayChildren = 'Not installed'
                      }

                      if (/not installed|missing|not found|absent/.test(text)) {
                        indicator = <span className="inline-block mr-1.5 align-middle text-[10px]">🚀</span>
                      } else if (/error|failed|crash|unhealthy|degraded/.test(text)) {
                        indicator = <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5 align-middle" />
                      } else if (/warning|misconfigured|partial|pending|conflict/.test(text)) {
                        indicator = <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 align-middle" />
                      } else if (/already running|active|installed|running|ready|bound|healthy/.test(text)) {
                        indicator = <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5 align-middle" />
                      }

                      return <td {...props}>{indicator}{displayChildren}</td>
                    },
                  }}
                >
                  {analysisText}
                </ReactMarkdown>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Selection Rationale</h4>
            <div className="space-y-2">
              {requiredProjects.length > 0 && (
                <ProjectRationaleList title="Required" accentClass="text-red-400" projects={requiredProjects} />
              )}
              {recommendedProjects.length > 0 && (
                <ProjectRationaleList title="Recommended" accentClass="text-blue-400" projects={recommendedProjects} />
              )}
              {optionalProjects.length > 0 && (
                <ProjectRationaleList title="Optional" accentClass="text-gray-400" projects={optionalProjects} />
              )}
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Coverage Areas</h4>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <span key={category} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {category}
                </span>
              ))}
            </div>
          </div>

          {allDependencies.size > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Shared Dependencies</h4>
              <div className="flex flex-wrap gap-1">
                {Array.from(allDependencies).map((dependency) => (
                  <span key={dependency} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {dependency}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectRationaleList({
  title,
  accentClass,
  projects,
}: {
  title: string
  accentClass: string
  projects: PayloadProject[]
}) {
  return (
    <div>
      <span className={`text-[10px] font-medium ${accentClass}`}>
        {title} ({projects.length})
      </span>
      <ul className="mt-1 space-y-1">
        {projects.map((project) => (
          <li key={project.name} className="text-xs text-foreground/70 flex gap-1.5">
            <span className={`${accentClass} shrink-0`}>•</span>
            <span><span className="font-medium text-foreground">{project.displayName}</span> — {project.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
