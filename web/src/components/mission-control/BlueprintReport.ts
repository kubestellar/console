/**
 * BlueprintReport — PDF/print export for the Flight Plan Blueprint.
 *
 * Opens a new browser window pre-loaded with a styled HTML report and
 * triggers the browser's print dialog (Save as PDF).
 */

import type { MissionControlState } from './types'
import type { BlueprintLayout } from './types'
import { generateDefaultPhases } from './BlueprintInfoPanels'

/** HTML-escape a string to prevent XSS when interpolating into HTML templates. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Shorten cluster names like "default/api-fmaas-platform-eval-fmaas-res..." to a readable form */
export function shortenClusterName(name: string): string {
  // Strip context prefix (e.g. "default/")
  const parts = name.split('/')
  const base = parts[parts.length - 1]
  // If still long, take first meaningful segment
  if (base.length > 24) {
    // Try splitting by common separators and taking key parts
    const segments = base.split(/[-_.]/)
    if (segments.length > 2) {
      // Take first 2-3 segments that are informative
      return segments.slice(0, 3).join('-')
    }
    return base.slice(0, 22) + '…'
  }
  return base
}

// ---------------------------------------------------------------------------
// CSS spacing tokens (4px grid) used in the exported HTML
// ---------------------------------------------------------------------------

const REPORT_STYLES = `
  /* Spacing tokens — 4px grid for consistency */
  :root {
    --space-xs: 2px;   /* extra-small: badge margin, tiny padding */
    --space-sm: 4px;   /* small: inline code padding, gap */
    --space-md: 8px;   /* medium: cell padding, heading bottom, table margin */
    --space-lg: 12px;  /* large: description padding, meta padding */
    --space-xl: 16px;  /* extra-large: section margin, body print padding */
    --space-2xl: 20px; /* 2x-large: h3 top margin */
    --space-3xl: 28px; /* 3x-large: h2 top margin */
    --space-4xl: 32px; /* 4x-large: body padding, footer top margin */
    --radius-sm: 4px;  /* border-radius for badges and code */
    --radius-md: 8px;  /* border-radius for containers */
    --border-hairline: 1px; /* table and container borders */
    --border-emphasis: 2px; /* h1 bottom accent */
  }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: var(--space-4xl); color: #1e293b; line-height: 1.5; }
  h1 { font-size: 24px; border-bottom: var(--border-emphasis) solid #6366f1; padding-bottom: var(--space-md); }
  h2 { font-size: 18px; margin-top: var(--space-3xl); color: #4338ca; }
  h3 { font-size: 14px; margin-top: var(--space-2xl); color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin: var(--space-md) 0 var(--space-xl); font-size: 13px; }
  th, td { border: var(--border-hairline) solid #e2e8f0; padding: var(--space-md) var(--space-lg); text-align: left; }
  th { background: #f1f5f9; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .installed { display: inline-block; background: #d1fae5; color: #065f46; padding: var(--space-xs) var(--space-md); border-radius: var(--radius-sm); font-size: 11px; margin: var(--space-xs); }
  .deploy { display: inline-block; background: #fef3c7; color: #92400e; padding: var(--space-xs) var(--space-md); border-radius: var(--radius-sm); font-size: 11px; margin: var(--space-xs); }
  .protected { display: inline-block; background: #d1fae5; color: #065f46; padding: var(--space-xs) var(--space-md); border-radius: var(--radius-sm); font-size: 11px; margin: var(--space-xs); }
  .remove { display: inline-block; background: #fef3c7; color: #92400e; padding: var(--space-xs) var(--space-md); border-radius: var(--radius-sm); font-size: 11px; margin: var(--space-xs); }
  code { background: #f1f5f9; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm); font-size: 12px; }
  .meta { color: #64748b; font-size: 13px; }
  .svg-container { margin: var(--space-xl) 0; border: var(--border-hairline) solid #e2e8f0; border-radius: var(--radius-md); overflow: hidden; }
  .svg-container svg { width: 100%; height: auto; }
  .section { page-break-inside: avoid; }
  .description { background: #f8fafc; border-left: var(--space-sm) solid #6366f1; padding: var(--space-lg) var(--space-xl); margin: var(--space-lg) 0; font-size: 13px; }
  @media print { body { padding: var(--space-xl); } .no-print { display: none; } }
`

export function exportFullReport(
  state: MissionControlState,
  healthyState: MissionControlState,
  installedProjects: Set<string>,
  _layout: BlueprintLayout | null,
  svgContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const effectivePhases = state.phases.length > 0 ? state.phases : generateDefaultPhases(state.projects)
  const rollbackPhases = [...effectivePhases].reverse()
  const toRemove = state.projects.filter(p => !installedProjects.has(p.name))
  const toKeep = state.projects.filter(p => installedProjects.has(p.name))

  // Serialize SVG
  let svgMarkup = ''
  const svgEl = svgContainerRef.current?.querySelector('svg')
  if (svgEl) {
    const clone = svgEl.cloneNode(true) as SVGElement
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', '#0f172a')
    clone.insertBefore(bg, clone.firstChild)
    svgMarkup = new XMLSerializer().serializeToString(clone)
  }

  // Cluster summary
  const clusterRows = healthyState.assignments
    .filter(a => a.projectNames.length > 0)
    .map(a => `<tr>
      <td>${esc(shortenClusterName(a.clusterName))}</td>
      <td>${a.projectNames.length}</td>
      <td>${a.projectNames.map(n =>
        `<span class="${installedProjects.has(n) ? 'installed' : 'deploy'}">${esc(n)}</span>`
      ).join(' ')}</td>
    </tr>`).join('')

  // Phase breakdown
  const phaseRows = effectivePhases.map((phase) => {
    const projs = phase.projectNames.map(n => {
      const isInst = installedProjects.has(n)
      return `<span class="${isInst ? 'installed' : 'deploy'}">${esc(n)}${isInst ? ' ✓' : ''}</span>`
    }).join(' ')
    const est = phase.estimatedSeconds ? `${Math.ceil(phase.estimatedSeconds / 60)} min` : ''
    return `<tr><td>${phase.phase}. ${esc(phase.name)}</td><td>${est}</td><td>${projs}</td></tr>`
  }).join('')

  // Rollback steps
  const rollbackRows = rollbackPhases.map((phase, i) => {
    const removable = phase.projectNames.filter(n => !installedProjects.has(n))
    if (removable.length === 0) return ''
    return `<tr><td>Step ${i + 1}</td><td>Remove ${esc(phase.name)}</td><td>${removable.map(n => `<code>helm uninstall ${esc(n)}</code>`).join('<br/>')}</td></tr>`
  }).filter(Boolean).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Flight Plan: ${esc(state.title || 'Mission Control')}</title>
<style>${REPORT_STYLES}</style></head><body>

<h1>Flight Plan: ${esc(state.title || 'Untitled Mission')}</h1>
<p class="meta">Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · ${state.projects.length} projects · ${healthyState.assignments.filter(a => a.projectNames.length > 0).length} clusters</p>

<div class="section">
<h2>1. Define Mission</h2>
<div class="description">${esc(state.description || 'No description provided')}</div>
<table>
  <thead><tr><th>Project</th><th>Category</th><th>Priority</th><th>Status</th><th>Why</th></tr></thead>
  <tbody>${state.projects.map(p => `<tr>
    <td><strong>${esc(p.displayName)}</strong></td>
    <td>${esc(p.category)}</td>
    <td>${esc(p.priority)}</td>
    <td><span class="${installedProjects.has(p.name) ? 'installed' : 'deploy'}">${installedProjects.has(p.name) ? 'Installed' : 'Needs Deploy'}</span></td>
    <td style="font-size:11px">${esc(p.reason || '')}</td>
  </tr>`).join('')}</tbody>
</table>
</div>

<div class="section">
<h2>2. Chart Course — Cluster Assignments</h2>
<table>
  <thead><tr><th>Cluster</th><th>Projects</th><th>Assignments</th></tr></thead>
  <tbody>${clusterRows}</tbody>
</table>
</div>

<div class="section">
<h2>3. Flight Plan Blueprint</h2>
${svgMarkup ? `<div class="svg-container">${svgMarkup}</div>` : '<p class="meta">SVG blueprint not available</p>'}
</div>

<div class="section">
<h2>4. PHASED Rollout Plan</h2>
<table>
  <thead><tr><th>Phase</th><th>Estimate</th><th>Projects</th></tr></thead>
  <tbody>${phaseRows}</tbody>
</table>
</div>

<div class="section">
<h2>5. YOLO Mode</h2>
<p>Launch all ${state.projects.length} projects simultaneously — no dependency gating.</p>
<p>${state.projects.map(p =>
  `<span class="${installedProjects.has(p.name) ? 'installed' : 'deploy'}">${esc(p.displayName)}${installedProjects.has(p.name) ? ' ✓' : ''}</span>`
).join(' ')}</p>
</div>

<div class="section">
<h2>6. Rollback Plan</h2>
${toKeep.length > 0 ? `
<h3>Protected (will not be removed)</h3>
<p>${toKeep.map(p => `<span class="protected">${esc(p.displayName)} ✓</span>`).join(' ')}</p>
` : ''}
${toRemove.length > 0 ? `
<h3>Removal Order (reverse phases)</h3>
<table>
  <thead><tr><th>Step</th><th>Action</th><th>Commands</th></tr></thead>
  <tbody>${rollbackRows}</tbody>
</table>
` : '<p>All projects are already installed — nothing to roll back.</p>'}
</div>

<p class="meta" style="margin-top:var(--space-4xl); border-top:var(--border-hairline) solid #e2e8f0; padding-top:var(--space-lg);">
  KubeStellar Console · Mission Control Report · Use browser Print (Cmd+P / Ctrl+P) to save as PDF
</p>

<script>window.onload = () => window.print()</script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
