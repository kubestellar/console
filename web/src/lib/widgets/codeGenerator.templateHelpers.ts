/**
 * TemplateHelpers type shared by codeGenerator.templates.ts and its
 * per-category siblings (codeGenerator.templates.{ci,cluster,infra}.ts).
 *
 * Split out as a dependency-free leaf (see kubestellar/console architect
 * circular-dependency pass) so the siblings can import the type without
 * importing codeGenerator.templates.ts itself, which previously created a
 * type-only circular dependency (madge flagged it; TypeScript erases
 * `import type` at compile time, so this was never a runtime cycle, but it
 * still broke static dependency-graph tooling).
 */
export interface TemplateHelpers {
  parseBlock: string
  wrapOpen: string
  wrapClose: string
  issueButton: string
  title: string
}
