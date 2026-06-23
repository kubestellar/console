/**
 * Stack Overflow knowledge source — searches Stack Exchange API for
 * high-quality Q&A related to CNCF projects.
 *
 * Public API: https://api.stackexchange.com/2.3/
 * No API key needed (300 requests/day quota).
 */
import { BaseSource, slugify, buildMission } from './base-source.mjs'
import { computeSinceDate } from './search-state.mjs'

export class StackOverflowSource extends BaseSource {
  constructor(config) {
    super('stackoverflow', config)
    this.minVotes = config.minVotes || 10
  }

  canonicalId(item) {
    return `so:${item.question_id}`
  }

  async search(project, sourceState) {
    const sinceDate = computeSinceDate(sourceState, this.searchWindow)
    const items = []

    // Build tag-based search: project name + kubernetes
    const tags = project.sources?.stackoverflow?.tags || [project.name]
    const tagStr = tags.join(';')

    // Build time filter (Stack Exchange uses epoch seconds)
    const fromDate = sinceDate
      ? Math.floor(new Date(sinceDate).getTime() / 1000)
      : Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000)

    const url = `https://api.stackexchange.com/2.3/search/advanced?` +
      `tagged=${encodeURIComponent(tagStr)}` +
      `&answers=1` +
      `&accepted=True` +
      `&sort=votes` +
      `&order=desc` +
      `&fromdate=${fromDate}` +
      `&site=stackoverflow` +
      `&filter=withbody` +
      `&pagesize=25`

    try {
      await this.throttle()
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) })

      if (!response.ok) {
        console.warn(`  SO: ${response.status} for ${project.name}, skipping`)
        return { items: [] }
      }

      const data = await response.json()

      if (data.quota_remaining != null) {
        console.log(`  SO: quota remaining: ${data.quota_remaining}`)
        if (data.quota_remaining < 10) {
          console.warn(`  SO: Quota nearly exhausted, stopping`)
          return { items: [] }
        }
      }

      for (const q of data.items || []) {
        if (q.score < this.minVotes) continue
        if (!q.is_answered) continue

        const cid = this.canonicalId(q)
        if (sourceState.processedIds.includes(cid)) continue

        items.push(q)
        if (items.length >= this.maxPerProject) break
      }
    } catch (err) {
      console.warn(`  SO: Error searching for ${project.name}: ${err.message}`)
    }

    // Also try a text search if tag search returned few results
    if (items.length < 3) {
      try {
        await this.throttle()
        const textUrl = `https://api.stackexchange.com/2.3/search/advanced?` +
          `q=${encodeURIComponent(project.name + ' kubernetes')}` +
          `&answers=1` +
          `&sort=votes` +
          `&order=desc` +
          `&fromdate=${fromDate}` +
          `&site=stackoverflow` +
          `&filter=withbody` +
          `&pagesize=15`

        const response = await fetch(textUrl, { signal: AbortSignal.timeout(15000) })
        if (response.ok) {
          const data = await response.json()
          const existingIds = new Set(items.map(i => i.question_id))
          for (const q of data.items || []) {
            if (existingIds.has(q.question_id)) continue
            if (q.score < this.minVotes) continue
            if (!q.is_answered) continue
            const cid = this.canonicalId(q)
            if (sourceState.processedIds.includes(cid)) continue
            items.push(q)
            if (items.length >= this.maxPerProject) break
          }
        }
      } catch (err) {
        console.warn(`  SO: Text search error: ${err.message}`)
      }
    }

    return { items }
  }

  async extractMission(item, project) {
    const title = item.title || 'Stack Overflow Q&A'
    const body = item.body || ''
    const url = item.link || `https://stackoverflow.com/q/${item.question_id}`
    const tags = item.tags || []

    // Fetch accepted answer
    const answer = await this.fetchAcceptedAnswer(item.question_id)
    if (!answer) return null

    const problem = stripHtml(body).slice(0, 500)
    const solution = stripHtml(answer.body || '')

    // Extract code blocks
    const yamlSnippets = extractHtmlCodeBlocks(body + '\n' + (answer.body || ''))

    const allText = `${title} ${body} ${solution}`
    const resourceKinds = extractResourceKinds(allText)
    const difficulty = item.score > 50 ? 'advanced' : item.score > 20 ? 'intermediate' : 'beginner'

    return await buildMission({
      title: `${project.name}: ${cleanHtmlEntities(title)}`,
      description: problem,
      problem,
      solution,
      steps: extractStepsFromHtml(answer.body || ''),
      yamlSnippets,
      difficulty,
      type: detectTypeFromTags(tags),
      labels: [...new Set([project.name, project.category, ...tags.slice(0, 5)])],
      resourceKinds,
      sourceUrl: url,
      sourceType: 'stackoverflow',
      project,
    })
  }

  async fetchAcceptedAnswer(questionId) {
    try {
      await this.throttle()
      const url = `https://api.stackexchange.com/2.3/questions/${questionId}/answers?` +
        `order=desc&sort=votes&site=stackoverflow&filter=withbody`
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) return null

      const data = await response.json()
      // Prefer accepted answer, fall back to highest-voted
      const accepted = (data.items || []).find(a => a.is_accepted)
      return accepted || (data.items || [])[0] || null
    } catch {
      return null
    }
  }
}

function stripHtml(html) {
  return html
    .replace(/<pre><code[^>]*>[\s\S]*?<\/code><\/pre>/g, '[code block]')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanHtmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractHtmlCodeBlocks(html) {
  const blocks = []
  const regex = /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const block = stripHtml(match[1]).trim()
    // Only include blocks that look like YAML or kubectl commands
    if (block.length > 20 && block.length < 5000) {
      if (block.includes('apiVersion:') || block.includes('kind:') || block.includes('kubectl') || block.includes('helm')) {
        blocks.push(block)
      }
    }
  }
  return blocks
}

function extractStepsFromHtml(html) {
  const steps = []
  // Look for <ol><li> lists
  const liRegex = /<li>([\s\S]*?)<\/li>/gi
  let match
  while ((match = liRegex.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim()
    if (text.length > 10) steps.push(text)
    if (steps.length >= 10) break
  }
  return steps
}

function extractResourceKinds(text) {
  const kinds = ['Pod', 'Deployment', 'Service', 'Ingress', 'ConfigMap', 'Secret', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'PersistentVolumeClaim', 'NetworkPolicy', 'ServiceAccount', 'ClusterRole', 'HorizontalPodAutoscaler']
  return kinds.filter(k => text.includes(k) || text.toLowerCase().includes(k.toLowerCase()))
}

function detectTypeFromTags(tags) {
  const tagStr = tags.join(' ').toLowerCase()
  if (tagStr.includes('performance') || tagStr.includes('memory') || tagStr.includes('cpu')) return 'performance'
  if (tagStr.includes('security') || tagStr.includes('rbac') || tagStr.includes('tls')) return 'security'
  if (tagStr.includes('networking') || tagStr.includes('dns') || tagStr.includes('ingress')) return 'networking'
  return 'troubleshooting'
}
