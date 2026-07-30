/**
 * Zod schemas for security-related API responses.
 *
 * Covers the /security-issues endpoint consumed by useCachedData.ts.
 */
import { z } from 'zod'

export const SecurityIssueSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  cluster: z.string().optional(),
  issue: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  details: z.string().optional(),
})

export const SecurityIssuesResponseSchema = z.object({
  issues: z.array(SecurityIssueSchema),
})
export type SecurityIssuesResponse = z.infer<typeof SecurityIssuesResponseSchema>
