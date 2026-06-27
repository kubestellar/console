/**
 * Render templates for CI/CD and GitHub-oriented widget cards
 */

import { ISSUE_BUTTON, PARSE_BLOCK, WRAP_CLOSE, WRAP_OPEN } from './shared'

export function generateCicdCardRenderFunction(cardType: string): string | null {
  switch (cardType) {
    case 'nightly_e2e_status':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />
          Nightly E2E Status
        </div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const guides = data?.guides || [];
  const platforms = ['OCP', 'GKE', 'CKS'];
  const platformColors = { OCP: '#f97316', GKE: '#3b82f6', CKS: '#a855f7' };
  const conclusionColors = { success: '#22c55e', failure: '#ef4444', cancelled: '#6b7280', skipped: '#6b7280' };
  const totalGuides = guides.length;
  const failing = guides.filter(g => g.latestConclusion === 'failure').length;
  const allRuns = guides.flatMap(g => g.runs || []);
  const completedRuns = allRuns.filter(r => r.status === 'completed');
  const passedRuns = completedRuns.filter(r => r.conclusion === 'success');
  const passRate = completedRuns.length > 0 ? Math.round((passedRuns.length / completedRuns.length) * 100) : 0;
${WRAP_OPEN}
        <div style={styles.cardTitle}>
          <span style={{...styles.statusDot, backgroundColor: failing > 0 ? '#ef4444' : '#22c55e'}} />
          Nightly E2E Status
        </div>
        <div style={{display: 'flex', gap: '16px', marginBottom: '8px'}}>
          <div>
            <div style={{fontSize: '20px', fontWeight: 700, color: '#a855f7'}}>{passRate}%</div>
            <div style={{fontSize: '10px', color: '#9ca3af'}}>Pass Rate</div>
          </div>
          <div>
            <div style={{fontSize: '20px', fontWeight: 700}}>{totalGuides}</div>
            <div style={{fontSize: '10px', color: '#9ca3af'}}>Guides</div>
          </div>
          <div>
            <div style={{fontSize: '20px', fontWeight: 700, color: failing > 0 ? '#ef4444' : '#22c55e'}}>{failing}</div>
            <div style={{fontSize: '10px', color: '#9ca3af'}}>Failing</div>
          </div>
        </div>
        {platforms.map(platform => {
          const platGuides = guides.filter(g => g.platform === platform);
          if (platGuides.length === 0) return null;
          return (
            <div key={platform} style={{marginBottom: '8px'}}>
              <div style={{color: platformColors[platform], fontWeight: 600, fontSize: '10px', marginBottom: '4px'}}>{platform}</div>
              {platGuides.map(g => {
                const workflowUrl = 'https://github.com/' + g.repo + '/actions/workflows/' + g.workflowFile;
                const runs = (g.runs || []).slice(0, 7);
                const completed = runs.filter(r => r.status === 'completed');
                const passed = completed.filter(r => r.conclusion === 'success').length;
                const failedAll = completed.filter(r => r.conclusion === 'failure');
                const gpuFails = failedAll.filter(r => r.failureReason === 'gpu_unavailable').length;
                const failed = failedAll.length;
                const lastRun = runs[0];
                const timeAgo = (ts) => {
                  if (!ts) return '';
                  const ms = Date.now() - new Date(ts).getTime();
                  const h = Math.floor(ms / 3600000);
                  if (h < 1) return Math.floor(ms / 60000) + 'm ago';
                  if (h < 24) return h + 'h ago';
                  return Math.floor(h / 24) + 'd ago';
                };
                const tooltip = g.guide + ' (' + platform + ')\\\\n' +
                  'Pass rate: ' + g.passRate + '% (' + passed + '/' + completed.length + ')\\\\n' +
                  (failed > 0 ? 'Failed: ' + failed + '\\\\n' : '') +
                  (lastRun ? 'Last run: ' + (lastRun.conclusion || lastRun.status) + ' ' + timeAgo(lastRun.updatedAt || lastRun.createdAt) : '');
                return (
                <div key={g.guide + g.platform} style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                  <span className="tip-wrap" style={{width: '28px', fontSize: '10px', fontWeight: 600, color: '#94a3b8', cursor: 'pointer'}} onClick={() => run(\`open "\${workflowUrl}"\`)}>
                    <span className="tip">{tooltip}</span>
                    {g.acronym}
                  </span>
                  <span className="spark-tip-wrap" style={{width: '90px', cursor: 'default'}}>
                    <span className="spark-tip">
                      <div style={{fontWeight: 600, color: '#f1f5f9', marginBottom: 3}}>{g.guide}</div>
                      <div style={{color: platformColors[platform], fontSize: '8px', marginBottom: 4}}>{platform}</div>
                      <div style={{marginBottom: 2}}>Pass rate: <span style={{color: g.passRate >= 80 ? '#22c55e' : g.passRate >= 50 ? '#eab308' : '#ef4444', fontWeight: 600}}>{g.passRate}%</span> ({passed}/{completed.length})</div>
                      {failed > 0 && <div style={{marginBottom: 2}}>
                        <span style={{color: '#ef4444'}}>Failed: {failed - gpuFails}</span>
                        {gpuFails > 0 && <span style={{color: '#f59e0b', marginLeft: 6}}>GPU: {gpuFails}</span>}
                      </div>}
                      {lastRun && <div style={{marginBottom: 4}}>Last: {lastRun.conclusion || lastRun.status} {timeAgo(lastRun.updatedAt || lastRun.createdAt)}</div>}
                      {runs.length > 1 && (() => {
                        const sw = 150, sh = 28, sp = 10;
                        const pts = runs.map((rr, ii) => {
                          const isGpuFail = rr.conclusion === 'failure' && rr.failureReason === 'gpu_unavailable';
                          return {
                            x: sp + (runs.length > 1 ? ii * (sw - 2 * sp) / (runs.length - 1) : sw / 2),
                            y: rr.conclusion === 'success' ? 6 : rr.conclusion === 'failure' ? 22 : 14,
                            c: rr.status !== 'completed' ? '#60a5fa' : rr.conclusion === 'success' ? '#22c55e' : isGpuFail ? '#f59e0b' : rr.conclusion === 'failure' ? '#ef4444' : '#6b7280',
                          };
                        });
                        return (
                          <svg width={sw} height={sh} style={{display: 'block'}}>
                            <polyline points={pts.map(p => p.x + ',' + p.y).join(' ')} fill="none" stroke="#334155" strokeWidth="1.5" strokeLinejoin="round" />
                            {pts.map((p, pi) => <circle key={pi} cx={p.x} cy={p.y} r={3} fill={p.c} />)}
                            <text x={sp} y={sh} textAnchor="start" fontSize="6" fill="#475569">new</text>
                            <text x={sw - sp} y={sh} textAnchor="end" fontSize="6" fill="#475569">old</text>
                          </svg>
                        );
                      })()}
                      {runs.length === 1 && <div style={{fontSize: '8px', color: '#64748b'}}>Only 1 run — no trend yet</div>}
                      {g.llmdImages && Object.keys(g.llmdImages).length > 0 && (
                        <div style={{marginTop: 4, paddingTop: 4, borderTop: '1px solid #334155'}}>
                          <div style={{fontSize: '8px', fontWeight: 600, color: '#64748b', marginBottom: 2}}>llm-d components</div>
                          {Object.entries(g.llmdImages).map(([name, tag]) => (
                            <div key={name} style={{display: 'flex', gap: 4, whiteSpace: 'nowrap'}}>
                              <span style={{color: '#94a3b8'}}>{name}</span>
                              <span style={{color: '#22d3ee', fontFamily: 'monospace'}}>:{String(tag)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {g.otherImages && Object.keys(g.otherImages).length > 0 && (
                        <div style={{marginTop: 4, paddingTop: 4, borderTop: '1px solid #334155'}}>
                          <div style={{fontSize: '8px', fontWeight: 600, color: '#64748b', marginBottom: 2}}>other images</div>
                          {Object.entries(g.otherImages).map(([name, tag]) => (
                            <div key={name} style={{display: 'flex', gap: 4, whiteSpace: 'nowrap'}}>
                              <span style={{color: '#94a3b8'}}>{name}</span>
                              <span style={{color: '#fb923c', fontFamily: 'monospace'}}>:{String(tag)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </span>
                    <span style={{fontSize: '10px', color: '#cbd5e1', display: 'inline-block', width: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{g.guide}</span>
                  </span>
                  <div style={{display: 'flex', gap: '2px', alignItems: 'center'}}>
                    {runs.map((r, i) => {
                      const isGpu = r.conclusion === 'failure' && r.failureReason === 'gpu_unavailable';
                      const isFailed = r.conclusion === 'failure';
                      const isRunning = r.status !== 'completed';
                      const statusColor = isRunning ? '#60a5fa' : r.conclusion === 'success' ? '#22c55e' : isGpu ? '#f59e0b' : isFailed ? '#ef4444' : '#94a3b8';
                      const statusText = isRunning ? 'running' : isGpu ? 'GPU unavailable' : isFailed ? 'failed' : r.conclusion === 'success' ? 'passed' : (r.conclusion || r.status);
                      const dotColor = isRunning ? '#60a5fa' : isGpu ? '#f59e0b' : (conclusionColors[r.conclusion] || '#6b7280');
                      const dotLLMD = r.llmdImages || g.llmdImages;
                      const dotOther = r.otherImages || g.otherImages;
                      const hasLLMD = dotLLMD && Object.keys(dotLLMD).length > 0;
                      const hasOther = dotOther && Object.keys(dotOther).length > 0;
                      return (
                      <span key={i} className={'dot-tip-wrap' + ((isFailed || hasLLMD) ? ' has-links' : '')} onClick={() => r.htmlUrl && run(\`open "\${r.htmlUrl}"\`)}>
                        <span className="tip">
                          <div style={{color: '#cbd5e1', marginBottom: hasLLMD || hasOther ? 3 : 0}}>
                            {r.runNumber ? 'Run #' + r.runNumber + ' · ' : ''}
                            <span style={{color: statusColor}}>{statusText}</span>
                            {' · '}{timeAgo(r.updatedAt || r.createdAt)}
                          </div>
                          {hasLLMD && (
                            <div style={{borderTop: '1px solid #334155', paddingTop: 3, marginTop: 2}}>
                              <div style={{fontSize: '8px', fontWeight: 600, color: '#64748b', marginBottom: 1}}>llm-d components</div>
                              {Object.entries(dotLLMD).map(([name, tag]) => (
                                <div key={name} style={{display: 'flex', gap: 4}}>
                                  <span style={{color: '#94a3b8'}}>{name}</span>
                                  <span style={{color: '#22d3ee', fontFamily: 'monospace'}}>:{String(tag)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {hasOther && (
                            <div style={{borderTop: '1px solid #334155', paddingTop: 3, marginTop: 2}}>
                              <div style={{fontSize: '8px', fontWeight: 600, color: '#64748b', marginBottom: 1}}>other images</div>
                              {Object.entries(dotOther).map(([name, tag]) => (
                                <div key={name} style={{display: 'flex', gap: 4}}>
                                  <span style={{color: '#94a3b8'}}>{name}</span>
                                  <span style={{color: '#fb923c', fontFamily: 'monospace'}}>:{String(tag)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {r.htmlUrl && <div style={{borderTop: '1px solid #334155', paddingTop: 3, marginTop: 2}}><a href={r.htmlUrl + '#logs'} onClick={(e) => { e.stopPropagation(); run(\`open "\${r.htmlUrl}#logs"\`); }} style={{color: '#60a5fa', fontSize: '9px'}}>View Logs</a></div>}
                        </span>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', display: 'inline-block', cursor: 'pointer',
                          backgroundColor: dotColor,
                          animation: r.status !== 'completed' ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                        }} />
                      </span>
                    )})}
                    {runs.length === 0 && <span style={{color: '#4b5563', fontSize: '9px'}}>no runs</span>}
                  </div>
                  <span style={{fontSize: '9px', color: '#9ca3af', marginLeft: 'auto'}}>{g.passRate}%</span>
                </div>
                );
              })}
            </div>
          );
        })}${WRAP_CLOSE}
};`

    case 'nightly_release_pulse':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Nightly Release Pulse</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const repos = data?.repos || [];
  const runs = data?.runs || [];
${WRAP_OPEN}
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
        </div>${WRAP_CLOSE}
};`

    case 'workflow_matrix':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Workflow Matrix</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const workflows = data?.workflows || [];
  const repos = data?.repos || [];
  const days = data?.days || 0;
${WRAP_OPEN}
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
        </div>${WRAP_CLOSE}
};`

    case 'pipeline_flow':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Pipeline Flow</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const runs = data?.runs || [];
  const repos = data?.repos || [];
  const succeeded = runs.filter(r => r.conclusion === 'success').length;
  const failed = runs.filter(r => r.conclusion === 'failure').length;
${WRAP_OPEN}
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
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{runs.length} runs across {repos.length} repos</div>${WRAP_CLOSE}
};`

    case 'recent_failures':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Recent Failures</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const runs = (data?.runs || []).filter(r => r.conclusion === 'failure').slice(0, 6);
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: runs.length > 0 ? styles.colors.error : styles.colors.healthy}} />Recent Failures</div>
        <div style={styles.column}>
          {runs.map((r, i) => (
            <div key={i} style={{fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
              <div style={{color: styles.colors.error}}>{r.name || r.workflow || 'Unknown'}</div>
              <div style={{color: '#64748b', fontSize: '10px'}}>{r.repo || ''}</div>
            </div>
          ))}
          {runs.length === 0 && <div style={{color: styles.colors.healthy, fontSize: '14px'}}>No recent failures</div>}
        </div>${WRAP_CLOSE}
};`

    case 'issue_activity_chart':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />Issue Activity</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const runs = data?.runs || [];
  const repos = data?.repos || [];
  const recent = runs.slice(0, 6);
${WRAP_OPEN}
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
        </div>${WRAP_CLOSE}
};`

    case 'github_ci_monitor':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />GitHub CI Monitor</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const workflows = data?.workflows || [];
  const repos = data?.repos || [];
${WRAP_OPEN}
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
        </div>${WRAP_CLOSE}
};`

    case 'github_activity':
      return `
export const render = ({ output }) => {${PARSE_BLOCK}

  if (error) {${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.error}} />GitHub Activity</div>
        <span style={{color: styles.colors.error}}>Error: {error}</span>${ISSUE_BUTTON}${WRAP_CLOSE}
  }

  const repos = data?.repos || [];
  const runs = data?.runs || [];
${WRAP_OPEN}
        <div style={styles.cardTitle}><span style={{...styles.statusDot, backgroundColor: styles.colors.info}} />GitHub Activity</div>
        <div style={styles.column}>
          {repos.slice(0, 6).map((r, i) => (
            <div key={i} style={{fontSize: '11px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
              {typeof r === 'string' ? r : (r.name || r.repo)}
            </div>
          ))}
          {repos.length === 0 && <div style={{color: '#9ca3af', fontSize: '12px'}}>No activity data</div>}
        </div>
        <div style={{fontSize: '11px', color: '#9ca3af', marginTop: '4px'}}>{runs.length} recent runs</div>${WRAP_CLOSE}
};`

    default:
      return null
  }
}
