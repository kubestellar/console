/**
 * Zod schemas for auth-related API responses.
 *
 * These provide runtime validation for endpoints where the frontend
 * previously used unsafe `as { ... } | null` type assertions.
 */
import { z } from 'zod'

/** POST /auth/refresh — body carries { refreshed, onboarded }. */
export const AuthRefreshResponseSchema = z.object({
  refreshed: z.boolean().optional(),
  onboarded: z.boolean().optional(),
})
export type AuthRefreshResponse = z.infer<typeof AuthRefreshResponseSchema>

/** GET /api/me — current authenticated user. */
export const UserSchema = z.object({
  id: z.string(),
  github_id: z.string(),
  github_login: z.string(),
  email: z.string().optional(),
  slack_id: z.string().optional(),
  avatar_url: z.string().optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  onboarded: z.boolean(),
})
export type User = z.infer<typeof UserSchema>
