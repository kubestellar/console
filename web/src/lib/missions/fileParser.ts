/**
 * File Parser — YAML / Markdown / JSON → MissionExport
 *
 * Parses user-imported files from GitHub repos or local uploads. Detects
 * Kubernetes Custom Resources by their apiVersion, maps API groups to CNCF
 * projects via apiGroupMapping, and either produces a structured MissionExport
 * or returns an unstructured preview for AI-assisted conversion.
 */

import yaml from 'js-yaml'
import type { MissionExport, MissionStep } from './types'
import { validateMissionExport } from './types'
import {
  extractApiGroup,
  lookupProject,
  deduplicateProjects,
  type ApiGroupMapping,
  type DetectedApiGroup,
} from './apiGroupMapping'

// ============================================================================
// Types
// ============================================================================

export interface UnstructuredPreview {
  /** Title extracted from YAML metadata or Markdown heading */
  detectedTitle?: string
  /** Section headings found in the document */
  detectedSections: string[]
  /** Shell commands found in fenced code blocks */
  detectedCommands: string[]
  /** Count of YAML code blocks (in Markdown) or YAML documents */
  detectedYamlBlocks: number
  /** K8s CRs detected with their API group mappings */
  detectedApiGroups: DetectedApiGroup[]
  /** Total line count */
  totalLines: number
}

export type ParseResult =
  | { type: 'structured'; mission: MissionExport; detectedProjects: ApiGroupMapping[] }
  | { type: 'unstructured'; content: string; format: 'yaml' | 'markdown'; preview: UnstructuredPreview; detectedProjects: ApiGroupMapping[] }

// ============================================================================
// Constants
// ============================================================================

/** Maximum content length for AI conversion to avoid token limits */
export const MAX_AI_CONVERSION_CHARS = 50_000

/** Languages treated as shell commands in fenced Markdown code blocks */
const SHELL_LANGUAGES = new Set(['bash', 'shell', 'sh', 'zsh', 'console', 'kubectl'])

/** Languages treated as YAML in fenced Markdown code blocks */
const YAML_LANGUAGES = new Set(['yaml', 'yml'])

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Parse a file into a MissionExport or an unstructured preview.
 *
 * Routes by file extension:
 * - .json → JSON parse → validateMissionExport
 * - .yaml/.yml → YAML parse → CR detection → structured or unstructured
 * - .md → Markdown parse → extract steps from headings/code blocks
 */
export function parseFileContent(content: string, fileName: string): ParseResult {
  const ext = getExtension(fileName)

  switch (ext) {
    case '.json':
      return parseJsonFile(content)
    case '.yaml':
    case '.yml':
      return parseYamlFile(content)
    case '.md':
      return parseMarkdownFile(content)
    default:
      // Unknown extension — try JSON first, then YAML
      return parseWithFallback(content)
  }
}

// ============================================================================
// JSON Parser
// ============================================================================

function parseJsonFile(content: string): ParseResult {
  const parsed = JSON.parse(content)
  const validation = validateMissionExport(parsed)
  if (validation.valid) {
    return { type: 'structured', mission: validation.data, detectedProjects: [] }
  }
  // Invalid JSON mission — try to detect CRs in case it's a K8s manifest in JSON format
  if (parsed && typeof parsed === 'object' && parsed.apiVersion && parsed.kind) {
    return wrapCRsAsMission([parsed])
  }
  // Return as structured anyway (MissionBrowser handles validation errors)
  return { type: 'structured', mission: parsed as MissionExport, detectedProjects: [] }
}

// ============================================================================
// YAML Parser
// ============================================================================

function parseYamlFile(content: string): ParseResult {
  // Parse all documents (handles multi-document YAML with --- separators)
  const documents = loadAllYamlDocuments(content)

  if (documents.length === 0) {
    return makeUnstructured(content, 'yaml', {
      detectedSections: [],
      detectedCommands: [],
      detectedYamlBlocks: 0,
      detectedApiGroups: [],
      totalLines: countLines(content),
    })
  }

  // Single document: check if it's a MissionExport in YAML format
  if (documents.length === 1) {
    const doc = documents[0]
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      const validation = validateMissionExport(doc)
      if (validation.valid) {
        return { type: 'structured', mission: validation.data, detectedProjects: [] }
      }
    }
  }

  // Check if documents are Kubernetes CRs (have apiVersion + kind)
  const crDocuments = documents.filter(isKubernetesResource)
  if (crDocuments.length > 0) {
    return wrapCRsAsMission(crDocuments)
  }

  // Single non-CR document: try it as a MissionExport anyway
  if (documents.length === 1) {
    const doc = documents[0]
    if (doc && typeof doc === 'object') {
      return { type: 'structured', mission: doc as MissionExport, detectedProjects: [] }
    }
  }

  // Unstructured YAML
  const detectedApiGroups = detectApiGroupsFromDocuments(documents)
  return makeUnstructured(content, 'yaml', {
    detectedSections: [],
    detectedCommands: [],
    detectedYamlBlocks: documents.length,
    detectedApiGroups,
    totalLines: countLines(content),
  })
}

// ============================================================================
// Markdown Parser
// ============================================================================

function parseMarkdownFile(content: string): ParseResult {
  const { frontmatter, body } = extractFrontmatter(content)
  const sections = extractMarkdownSections(body)
  const allCodeBlocks = extractCodeBlocks(body)
  const yamlBlocks = allCodeBlocks.filter((b) => YAML_LANGUAGES.has(b.language))
  const shellBlocks = allCodeBlocks.filter((b) => SHELL_LANGUAGES.has(b.language))

  // Detect CRs from embedded YAML blocks
  const detectedApiGroups: DetectedApiGroup[] = []
  for (const block of yamlBlocks) {
    const docs = loadAllYamlDocuments(block.content)
    for (const doc of docs) {
      if (isKubernetesResource(doc)) {
        const apiGroup = extractApiGroup(doc.apiVersion as string)
        detectedApiGroups.push({
          apiVersion: doc.apiVersion as string,
          kind: doc.kind as string,
          project: apiGroup ? lookupProject(apiGroup) : null,
        })
      }
    }
  }

  const detectedProjects = deduplicateProjects(
    detectedApiGroups.map((d) => d.project).filter(Boolean) as ApiGroupMapping[]
  )

  // Attempt to build a structured mission from markdown structure
  const title = frontmatter?.title ?? extractFirstHeading(body) ?? sections[0]?.heading
  const description = frontmatter?.description ?? extractLeadParagraph(body)

  const steps: MissionStep[] = []
  for (const section of sections) {
    const sectionCodeBlocks = extractCodeBlocks(section.body)
    const sectionShell = sectionCodeBlocks.filter((b) => SHELL_LANGUAGES.has(b.language))
    const sectionYaml = sectionCodeBlocks.filter((b) => YAML_LANGUAGES.has(b.language))

    const step: MissionStep = {
      title: section.heading,
      description: stripCodeBlocks(section.body).trim(),
    }
    if (sectionShell.length > 0) {
      step.command = sectionShell.map((b) => b.content).join('\n')
    }
    if (sectionYaml.length > 0) {
      step.yaml = sectionYaml.map((b) => b.content).join('\n---\n')
    }
    steps.push(step)
  }

  // If we got a title and at least one step, treat as structured
  const MIN_STEPS_FOR_STRUCTURED = 1
  if (title && steps.length >= MIN_STEPS_FOR_STRUCTURED) {
    const mission: MissionExport = {
      version: 'kc-mission-v1',
      title: title as string,
      description: (description ?? '') as string,
      type: inferMissionType(title as string, description as string),
      tags: [
        ...(Array.isArray(frontmatter?.tags) ? frontmatter.tags as string[] : []),
        ...detectedProjects.flatMap((p) => p.tags),
      ],
      steps,
      ...(detectedProjects.length > 0 ? { cncfProject: detectedProjects[0].project } : {}),
      metadata: {
        source: 'markdown-import',
        sourceUrls: {},
      },
    }
    const validation = validateMissionExport(mission)
    return {
      type: 'structured',
      mission: validation.valid ? validation.data : mission,
      detectedProjects,
    }
  }

  // Unstructured markdown
  return makeUnstructured(content, 'markdown', {
    detectedTitle: title as string | undefined,
    detectedSections: sections.map((s) => s.heading),
    detectedCommands: shellBlocks.map((b) => b.content),
    detectedYamlBlocks: yamlBlocks.length,
    detectedApiGroups,
    totalLines: countLines(content),
  })
}

// ============================================================================
// Kubernetes CR Detection & Wrapping
// ============================================================================

/** Check if a parsed YAML document looks like a Kubernetes resource */
function isKubernetesResource(doc: unknown): doc is Record<string, unknown> {
  return (
    doc !== null &&
    typeof doc === 'object' &&
    !Array.isArray(doc) &&
    typeof (doc as Record<string, unknown>).apiVersion === 'string' &&
    typeof (doc as Record<string, unknown>).kind === 'string'
  )
}

/** Detect API groups from an array of parsed YAML documents */
function detectApiGroupsFromDocuments(documents: unknown[]): DetectedApiGroup[] {
  const detected: DetectedApiGroup[] = []
  for (const doc of documents) {
    if (isKubernetesResource(doc)) {
      const apiGroup = extractApiGroup(doc.apiVersion as string)
      detected.push({
        apiVersion: doc.apiVersion as string,
        kind: doc.kind as string,
        project: apiGroup ? lookupProject(apiGroup) : null,
      })
    }
  }
  return detected
}

/**
 * Wrap one or more Kubernetes CRs as a structured MissionExport.
 *
 * Groups CRs by detected CNCF project. Each CR becomes a step with the full
 * YAML as step.yaml. If multiple projects are detected, steps are ordered
 * by project for clarity.
 */
function wrapCRsAsMission(crDocuments: Record<string, unknown>[]): ParseResult {
  const detectedApiGroups = detectApiGroupsFromDocuments(crDocuments)
  const detectedProjects = deduplicateProjects(
    detectedApiGroups.map((d) => d.project).filter(Boolean) as ApiGroupMapping[]
  )

  const steps: MissionStep[] = crDocuments.map((doc) => {
    const kind = doc.kind as string
    const name = (doc.metadata as Record<string, unknown>)?.name as string | undefined
    const apiGroup = extractApiGroup(doc.apiVersion as string)
    const project = apiGroup ? lookupProject(apiGroup) : null

    return {
      title: `Apply ${kind}${name ? ` "${name}"` : ''}`,
      description: project
        ? `Apply ${kind} resource for ${project.displayName}`
        : `Apply ${kind} resource (${doc.apiVersion})`,
      yaml: yaml.dump(doc, { indent: 2, lineWidth: -1 }),
      command: `kubectl apply -f - <<'EOF'\n${yaml.dump(doc, { indent: 2, lineWidth: -1 })}EOF`,
    }
  })

  const primaryProject = detectedProjects[0]
  const allKinds = crDocuments.map((d) => d.kind as string)
  const uniqueKinds = [...new Set(allKinds)]

  const title = primaryProject
    ? `Deploy ${uniqueKinds.join(', ')} for ${primaryProject.displayName}`
    : `Apply ${uniqueKinds.join(', ')}`

  const mission: MissionExport = {
    version: 'kc-mission-v1',
    title,
    description: primaryProject
      ? `Deploy ${uniqueKinds.length} resource(s) for ${primaryProject.displayName} (${primaryProject.project})`
      : `Apply ${uniqueKinds.length} Kubernetes resource(s)`,
    type: 'deploy',
    tags: detectedProjects.flatMap((p) => p.tags),
    steps,
    ...(primaryProject ? { cncfProject: primaryProject.project } : {}),
    metadata: {
      source: 'yaml-import',
      sourceUrls: {},
    },
  }

  const validation = validateMissionExport(mission)
  return {
    type: 'structured',
    mission: validation.valid ? validation.data : mission,
    detectedProjects,
  }
}

// ============================================================================
// Markdown Helpers
// ============================================================================

interface FrontmatterResult {
  frontmatter: Record<string, unknown> | null
  body: string
}

/** Extract YAML frontmatter delimited by --- at the start of a Markdown file */
function extractFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return { frontmatter: null, body: content }
  try {
    const parsed = yaml.load(match[1]) as Record<string, unknown>
    return { frontmatter: parsed, body: match[2] }
  } catch {
    return { frontmatter: null, body: content }
  }
}

interface MarkdownSection {
  heading: string
  body: string
}

/** Split Markdown body into sections by ## headings */
function extractMarkdownSections(body: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  const lines = body.split('\n')
  let currentHeading: string | null = null
  let currentBody: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/)
    if (headingMatch) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n') })
      }
      currentHeading = headingMatch[1].trim()
      currentBody = []
    } else if (currentHeading) {
      currentBody.push(line)
    }
  }

  if (currentHeading) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n') })
  }

  return sections
}

interface CodeBlock {
  language: string
  content: string
}

/** Extract fenced code blocks from Markdown */
function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w*)\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: (match[1] || 'text').toLowerCase(),
      content: match[2].trim(),
    })
  }
  return blocks
}

/** Extract the first # heading from Markdown */
function extractFirstHeading(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : undefined
}

/** Extract the first paragraph of text (before any heading or code block) */
function extractLeadParagraph(body: string): string | undefined {
  const lines = body.split('\n')
  const paragraphLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('```')) break
    if (line.trim()) paragraphLines.push(line.trim())
  }
  return paragraphLines.length > 0 ? paragraphLines.join(' ') : undefined
}

/** Remove fenced code blocks from Markdown text */
function stripCodeBlocks(text: string): string {
  return text.replace(/```\w*\s*\n[\s\S]*?```/g, '')
}

// ============================================================================
// YAML Helpers
// ============================================================================

/** Safely load all YAML documents from a multi-document string */
function loadAllYamlDocuments(content: string): unknown[] {
  const documents: unknown[] = []
  try {
    yaml.loadAll(content, (doc: unknown) => {
      if (doc !== null && doc !== undefined) {
        documents.push(doc)
      }
    })
  } catch {
    // If loadAll fails, try single document
    try {
      const single = yaml.load(content)
      if (single !== null && single !== undefined) {
        documents.push(single)
      }
    } catch {
      // Unparseable YAML
    }
  }
  return documents
}

// ============================================================================
// Utility Helpers
// ============================================================================

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.substring(dot).toLowerCase() : ''
}

function countLines(content: string): number {
  return content.split('\n').length
}

/** Infer mission type from title/description keywords */
function inferMissionType(title: string, description: string): MissionExport['type'] {
  const text = `${title} ${description}`.toLowerCase()
  if (text.includes('troubleshoot') || text.includes('debug') || text.includes('fix')) return 'troubleshoot'
  if (text.includes('upgrade') || text.includes('migrate')) return 'upgrade'
  if (text.includes('deploy') || text.includes('install')) return 'deploy'
  if (text.includes('analyze') || text.includes('audit') || text.includes('review')) return 'analyze'
  if (text.includes('repair') || text.includes('recover') || text.includes('restore')) return 'repair'
  return 'custom'
}

/** Fallback parser: tries JSON, then YAML */
function parseWithFallback(content: string): ParseResult {
  try {
    return parseJsonFile(content)
  } catch {
    try {
      return parseYamlFile(content)
    } catch {
      return makeUnstructured(content, 'yaml', {
        detectedSections: [],
        detectedCommands: [],
        detectedYamlBlocks: 0,
        detectedApiGroups: [],
        totalLines: countLines(content),
      })
    }
  }
}

function makeUnstructured(
  content: string,
  format: 'yaml' | 'markdown',
  preview: Omit<UnstructuredPreview, 'totalLines'> & { totalLines: number },
): ParseResult {
  const detectedProjects = deduplicateProjects(
    (preview.detectedApiGroups || []).map((d) => d.project).filter(Boolean) as ApiGroupMapping[]
  )
  return {
    type: 'unstructured',
    content,
    format,
    preview: preview as UnstructuredPreview,
    detectedProjects,
  }
}
