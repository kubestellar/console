/**
 * Focused card renderers extracted from codeGenerator.templates.ts.
 */

import type { CardRenderContext } from './shared'

export function generateGithubCardRender(cardType: string, context: CardRenderContext): string | undefined {
  const { card, parseBlock, wrapOpen, wrapClose, issueButton } = context

  switch (cardType) {
    case 'opencost_overview':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />OpenCost Overview</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const costs = data?.costs || data || {};
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />OpenCost Overview</div>
        <div style={{fontSize: '12px', color: '#9ca3af'}}>Cost data from cluster</div>
        <pre style={{fontSize: '10px', color: '#94a3b8', overflow: 'auto', maxHeight: '80px', margin: '8px 0 0 0'}}>
          {JSON.stringify(costs, null, 2)}
        </pre>${wrapClose}
};`

    case 'active_alerts':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Active Alerts</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const alerts = data?.events || data?.alerts || [];
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: alerts.length > 0 ? styles.colors.warning : styles.colors.healthy}} />Active Alerts</div>
        <div style={{textAlign: 'center', marginBottom: '8px'}}>
          <div style={{fontSize: '28px', fontWeight: 700, color: alerts.length > 0 ? styles.colors.warning : styles.colors.healthy}}>{alerts.length}</div>
          <div style={{fontSize: '12px', color: '#9ca3af'}}>Warning Events</div>
        </div>
        <div style={styles.column}>
          {alerts.slice(0, 4).map((a, i) => (
            <div key={i} style={{fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <div style={{color: styles.colors.warning, fontWeight: 600}}>{a.reason}</div>
              <div style={{color: '#9ca3af', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px'}}>{a.message}</div>
            </div>
          ))}
          {alerts.length === 0 && <div style={{color: styles.colors.healthy}}>No active alerts</div>}
        </div>${wrapClose}
};`

    case 'helm_releases':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Helm Releases</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const releases = data?.releases || [];
  const deployed = releases.filter(r => r.status === 'deployed').length;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Helm Releases</div>
        <div style={styles.column}>
          {releases.slice(0, 6).map((r, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{r.name}</span>
              <span style={{color: r.status === 'deployed' ? styles.colors.healthy : styles.colors.warning, fontSize: '10px'}}>{r.status} {r.app_version || ''}</span>
            </div>
          ))}
          {releases.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No releases found</div>}
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{deployed}/{releases.length} deployed</div>${wrapClose}
};`

    case 'provider_health':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Provider Health</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const providers = data?.providers || [];
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Provider Health</div>
        <div style={styles.column}>
          {providers.map((p, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}>
              <span style={{color: '#e2e8f0'}}>{p.name}</span>
              <span style={{color: p.healthy ? styles.colors.healthy : styles.colors.error}}>{p.healthy ? 'Healthy' : 'Unhealthy'}</span>
            </div>
          ))}
          {providers.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No provider data</div>}
        </div>${wrapClose}
};`

    case 'nightly_release_pulse':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Nightly Release Pulse</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const repos = data?.repos || [];
  const runs = data?.runs || [];
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.purple}} />Nightly Release Pulse</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{repos.length}</span>
            <span style={styles.statLabel}>Repos</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{runs.length}</span>
            <span style={styles.statLabel}>Runs</span>
          </div>
        </div>${wrapClose}
};`

    case 'workflow_matrix':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Workflow Matrix</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const workflows = data?.workflows || [];
  const repos = data?.repos || [];
  const days = data?.days || 0;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Workflow Matrix</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{workflows.length}</span>
            <span style={styles.statLabel}>Workflows</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{repos.length}</span>
            <span style={styles.statLabel}>Repos</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{days}</span>
            <span style={styles.statLabel}>Days</span>
          </div>
        </div>${wrapClose}
};`

    case 'pipeline_flow':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Pipeline Flow</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const runs = data?.runs || [];
  const repos = data?.repos || [];
  const succeeded = runs.filter(r => r.conclusion === 'success').length;
  const failed = runs.filter(r => r.conclusion === 'failure').length;
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: failed > 0 ? styles.colors.warning : styles.colors.healthy}} />Pipeline Flow</div>
        <div style={styles.row}>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.healthy}\`}}>
            <span style={{...styles.statValue, color: styles.colors.healthy}}>{succeeded}</span>
            <span style={styles.statLabel}>Passed</span>
          </div>
          <div style={{...styles.statBlock, borderLeft: \`3px solid \${styles.colors.error}\`}}>
            <span style={{...styles.statValue, color: failed > 0 ? styles.colors.error : styles.colors.info}}>{failed}</span>
            <span style={styles.statLabel}>Failed</span>
          </div>
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{runs.length} runs across {repos.length} repos</div>${wrapClose}
};`

    case 'recent_failures':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Recent Failures</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const runs = (data?.runs || []).filter(r => r.conclusion === 'failure').slice(0, 6);
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: runs.length > 0 ? styles.colors.error : styles.colors.healthy}} />Recent Failures</div>
        <div style={styles.column}>
          {runs.map((r, i) => (
            <div key={i} style={{fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <div style={{color: styles.colors.error}}>{r.name || r.workflow || 'Unknown'}</div>
              <div style={{color: '#64748b', fontSize: '10px'}}>{r.repo || ''}</div>
            </div>
          ))}
          {runs.length === 0 && <div style={{color: styles.colors.healthy, fontSize: '14px'}}>No recent failures</div>}
        </div>${wrapClose}
};`

    case 'issue_activity_chart':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Issue Activity</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const runs = data?.runs || [];
  const repos = data?.repos || [];
  const recent = runs.slice(0, 6);
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />Daily Issues & PRs</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{runs.length}</span>
            <span style={styles.statLabel}>Runs</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{repos.length}</span>
            <span style={styles.statLabel}>Repos</span>
          </div>
        </div>
        <div style={styles.column}>
          {recent.map((r, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <span style={{color: '#e2e8f0', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{r.name || r.workflow || 'Run'}</span>
              <span style={{color: r.conclusion === 'success' ? styles.colors.healthy : r.conclusion === 'failure' ? styles.colors.error : '#9ca3af', fontSize: '10px'}}>{r.conclusion || r.status || ''}</span>
            </div>
          ))}
          {runs.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No recent activity</div>}
        </div>${wrapClose}
};`

    case 'github_ci_monitor':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />GitHub CI Monitor</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const workflows = data?.workflows || [];
  const repos = data?.repos || [];
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />GitHub CI Monitor</div>
        <div style={styles.row}>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{workflows.length}</span>
            <span style={styles.statLabel}>Workflows</span>
          </div>
          <div style={styles.statBlock}>
            <span style={styles.statValue}>{repos.length}</span>
            <span style={styles.statLabel}>Repos</span>
          </div>
        </div>${wrapClose}
};`

    case 'github_activity':
      return `
export const render = ({ output }) => {${parseBlock}

  if (error) {${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />GitHub Activity</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${issueButton}${wrapClose}
  }

  const repos = data?.repos || [];
  const runs = data?.runs || [];
${wrapOpen}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />GitHub Activity</div>
        <div style={styles.column}>
          {repos.slice(0, 6).map((r, i) => (
            <div key={i} style={{fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
              {typeof r === 'string' ? r : (r.name || r.repo)}
            </div>
          ))}
          {repos.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No activity data</div>}
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{runs.length} recent runs</div>${wrapClose}
};`

    default:
      return undefined
  }
}
