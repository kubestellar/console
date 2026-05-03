const express = require('express');
const { execFile, execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const yaml = (() => { try { return require('js-yaml'); } catch (_) { return null; } })();

const app = express();
app.use(express.json());

// Load project config from hive-project.yaml
const CONFIG_PATH = process.env.HIVE_PROJECT_CONFIG || '/etc/hive/hive-project.yaml';
let projectConfig = {};
try {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  if (yaml) {
    projectConfig = yaml.load(raw) || {};
  } else {
    const { execSync } = require('child_process');
    const json = execSync(`python3 -c "import yaml,json,sys; print(json.dumps(yaml.safe_load(sys.stdin)))" < "${CONFIG_PATH}"`, { encoding: 'utf8' });
    projectConfig = JSON.parse(json);
  }
} catch (_) { /* no config file — use defaults */ }

const PROJECT_NAME = (projectConfig.project || {}).name || '';
const PROJECT_PRIMARY_REPO = (projectConfig.project || {}).primary_repo || '';
const PROJECT_ORG = (projectConfig.project || {}).org || '';
const DASHBOARD_TITLE = ((projectConfig.dashboard || {}).title) || (PROJECT_NAME ? PROJECT_NAME + ' Hive' : 'Hive');
const HIVE_REPO_DIR = process.env.HIVE_REPO_DIR || path.resolve(__dirname, '..');
const ENABLED_AGENTS = ((projectConfig.agents || {}).enabled || ['supervisor', 'scanner', 'reviewer', 'architect', 'outreach']);
const ENABLED_AGENTS_PLUS_ALL = [...ENABLED_AGENTS, 'all'];

// ── Centralized backend/model config (JS equivalent of backends.conf) ──────
const KNOWN_BACKENDS = ['claude', 'copilot', 'gemini', 'codex', 'amazonq', 'goose', 'aider'];
const FREE_BACKENDS = ['copilot', 'goose'];

function normalizeModelForBackend(backend, model) {
  if (backend === 'copilot') return model.replace(/(\d+)-(\d+)$/, '$1.$2');
  if (backend === 'claude') return model.replace(/(\d+)\.(\d+)$/, '$1-$2');
  return model;
}

function modelsEqual(a, b) {
  const na = (a || '').replace(/(\d+)\.(\d+)$/, '$1-$2');
  const nb = (b || '').replace(/(\d+)\.(\d+)$/, '$1-$2');
  return na === nb;
}

function modelTier(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.startsWith('gpt-')) return 'gpt';
  if (m.startsWith('gemini-')) return 'gemini';
  return 'unknown';
}

const PORT = process.env.HIVE_DASHBOARD_PORT || ((projectConfig.dashboard || {}).port) || 3001;
const REFRESH_MS = 5000;
const METRICS_DIR = '/var/run/hive-metrics';
const HISTORY_DIR = path.join(METRICS_DIR, 'history');
const AGENT_METRICS_CACHE_FILE = path.join(METRICS_DIR, 'agent-metrics-cache.json');
const HISTORY_FILE = path.join(HISTORY_DIR, 'daily.json');
try { fs.mkdirSync(HISTORY_DIR, { recursive: true }); } catch (_) {}
const PERSIST_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const MAX_PERSISTENT_POINTS = 30 * 24 * 4; // 30 days at 15-min intervals = 2880

// ── Issue-to-merge time metric ──────────────────────────────────────────────
const ISSUE_TO_MERGE_FILE = path.join(METRICS_DIR, 'issue_to_merge.json');
const ISSUE_TO_MERGE_REFRESH_MS = 60 * 1000; // re-read cache file every 60s
let issueToMergeCache = {};
try {
  issueToMergeCache = JSON.parse(fs.readFileSync(ISSUE_TO_MERGE_FILE, 'utf8'));
  console.log(`Loaded issue-to-merge cache: avg=${issueToMergeCache.avg_minutes}m, count=${issueToMergeCache.count}`);
} catch (_) { /* first run or missing file */ }

// Issue-to-merge data is collected by api-collector.sh (which has proper gh auth).
// Server just reads the cache file periodically.
function reloadIssueToMerge() {
  try {
    issueToMergeCache = JSON.parse(fs.readFileSync(ISSUE_TO_MERGE_FILE, 'utf8'));
  } catch (_) { /* file not yet written by collector */ }
}
setInterval(reloadIssueToMerge, ISSUE_TO_MERGE_REFRESH_MS);

// Cache for status data
let statusCache = null;
let lastFetch = 0;
// Last known good beads values (bd timeout returns -1)
let lastGoodBeads = { workers: 0, supervisor: 0 };
let ciPassRate = 0;
let healthChecks = {};
let agentMetrics = {};
try { agentMetrics = JSON.parse(fs.readFileSync(AGENT_METRICS_CACHE_FILE, 'utf8')); } catch (_) {}
let summariesCache = {};
let activityCache = {};
let ghRateLimitsCache = { alerts: [] };

// GitHub API rate limit alerts — read from gh-rate-check.sh output every 30s
const GH_RATE_LIMITS_FILE = '/var/run/hive-metrics/gh_rate_limits.json';
const GH_RATE_REFRESH_MS = 30000; // 30 seconds
function fetchGhRateLimits() {
  try {
    if (fs.existsSync(GH_RATE_LIMITS_FILE)) {
      const raw = fs.readFileSync(GH_RATE_LIMITS_FILE, 'utf8');
      const data = JSON.parse(raw);
      // Prune expired alerts client-side as well
      const now = Math.floor(Date.now() / 1000);
      data.alerts = (data.alerts || []).filter(a => {
        const ttl = a.ttl_seconds || 3600;
        return now - (a.detected_epoch || 0) < ttl;
      });
      ghRateLimitsCache = data;
    }
  } catch (_) { /* file missing or malformed — keep stale cache */ }
}
fetchGhRateLimits();
setInterval(fetchGhRateLimits, GH_RATE_REFRESH_MS);

// GitHub auth health — check every 60s, expose sticky alert when 401
const GH_AUTH_CHECK_MS = 60000;
let ghAuthOk = true;
let ghAuthLastChecked = null;
function checkGhAuth() {
  execFile('bash', ['-c', 'gh api rate_limit --jq .rate.limit 2>&1'], { timeout: 15000 }, (err, stdout, stderr) => {
    const output = (stdout || '') + (stderr || '');
    const was = ghAuthOk;
    const limit = parseInt(stdout.trim(), 10);
    ghAuthOk = !err && limit > 0;
    ghAuthLastChecked = new Date().toISOString();
    if (was && !ghAuthOk) console.error('gh auth DOWN:', output.trim());
    if (!was && ghAuthOk) console.log('gh auth recovered (limit=' + limit + ')');
  });
}
checkGhAuth();
setInterval(checkGhAuth, GH_AUTH_CHECK_MS);

// Fetch CI pass rate + binary health checks every 60s
function fetchHealthChecks() {
  execFile(path.join(__dirname, 'health-check.sh'), [], { timeout: 30000 }, (err, stdout) => {
    if (!err && stdout.trim()) {
      try {
        const d = JSON.parse(stdout.trim());
        ciPassRate = d.ci || 0;
        healthChecks = d;
      } catch (_) {}
    }
  });
}
fetchHealthChecks();
setInterval(fetchHealthChecks, 300000);  // every 5 min (REST API)

// Fetch token usage from JSONL session files every 60s
let tokenCache = {};
const TOKEN_CACHE_FILE = path.join(METRICS_DIR, 'tokens.json');
const TOKEN_COLLECTOR_TIMEOUT_MS = 120000;
function fetchTokens() {
  execFile(path.join(__dirname, 'token-collector.sh'), [], { timeout: TOKEN_COLLECTOR_TIMEOUT_MS }, (err, stdout) => {
    if (!err && stdout.trim()) {
      try {
        tokenCache = JSON.parse(stdout.trim());
        try { fs.writeFileSync(TOKEN_CACHE_FILE, stdout.trim()); } catch (_) {}
      } catch (_) {}
    } else if (!Object.keys(tokenCache).length) {
      try {
        const cached = fs.readFileSync(TOKEN_CACHE_FILE, 'utf8');
        tokenCache = JSON.parse(cached);
      } catch (_) {}
    }
  });
}
fetchTokens();
const TOKEN_REFRESH_MS = 60000;
setInterval(fetchTokens, TOKEN_REFRESH_MS);

// Fetch per-agent metrics every 5 min — cache to disk so rate-limit failures don't blank indicators
function fetchAgentMetrics() {
  execFile(path.join(__dirname, 'agent-metrics.sh'), [], { timeout: 60000 }, (err, stdout) => {
    if (!err && stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout.trim());
        agentMetrics = parsed;
        try { fs.writeFileSync(AGENT_METRICS_CACHE_FILE, stdout.trim()); } catch (_) {}
      } catch (_) {}
    } else if (!Object.keys(agentMetrics).length) {
      try {
        const cached = fs.readFileSync(AGENT_METRICS_CACHE_FILE, 'utf8');
        agentMetrics = JSON.parse(cached);
        console.log('agent-metrics.sh failed, loaded cached metrics from disk');
      } catch (_) {}
    }
  });
}
fetchAgentMetrics();
setInterval(fetchAgentMetrics, 300000);  // every 5 min (REST API)

// Centralized GitHub API collector — runs once, writes cache read by governor + dashboard
function fetchGitHubCache() {
  execFile(path.join(__dirname, 'api-collector.sh'), [], { timeout: 120000 }, (err) => {
    if (err) console.error('api-collector.sh failed:', err.message);
  });
}
fetchGitHubCache();
const API_COLLECTOR_INTERVAL_MS = 300000;
setInterval(fetchGitHubCache, API_COLLECTOR_INTERVAL_MS);

// Fetch agent summaries from ~/.hive/<agent>_status.txt on every status refresh cycle
function fetchSummaries() {
  execFile(path.join(__dirname, 'agent-summaries.sh'), [], { timeout: 10000 }, (err, stdout) => {
    if (!err && stdout.trim()) {
      try {
        const d = JSON.parse(stdout.trim());
        summariesCache = d.summaries || {};
      } catch (_) {}
    }
  });
}
fetchSummaries();
setInterval(fetchSummaries, REFRESH_MS);

// Fetch live agent activity from Claude Code JSONL session files
function fetchActivity() {
  execFile('python3', [path.join(__dirname, 'agent-activity.py')],
    { timeout: 10000 }, (err, stdout) => {
    if (!err && stdout.trim()) {
      try { activityCache = JSON.parse(stdout.trim()); } catch (_) {}
    }
  });
}
fetchActivity();
setInterval(fetchActivity, REFRESH_MS);

// Historical data — keep last 12 hours of snapshots (30s intervals = ~1440 points)
const MAX_HISTORY = 1440;
const SPARK_RECORD_INTERVAL = 6; // record every 6th tick (5s × 6 = 30s)
let sparkTickCount = 0;
const SPARKLINE_FILE = path.join(HISTORY_DIR, 'sparkline.json');
let history = [];
try {
  const raw = fs.readFileSync(SPARKLINE_FILE, 'utf8');
  history = JSON.parse(raw);
  // Trim to cap in case the file grew large before this limit was set
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  console.log(`Loaded ${history.length} sparkline history points`);
} catch (_) { /* first run */ }

// Persistent history — 15-min snapshots, 30 days
let persistentHistory = [];
try {
  const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
  persistentHistory = JSON.parse(raw);
  console.log(`Loaded ${persistentHistory.length} persistent history points`);
} catch (_) { /* first run */ }

function persistSnapshot() {
  if (!statusCache) return;
  const am = agentMetrics || {};
  const snap = {
    t: Date.now(),
    govIssues: statusCache.governor?.issues || 0,
    govPrs: statusCache.governor?.prs || 0,
    govTotal: (statusCache.governor?.issues || 0) + (statusCache.governor?.prs || 0),
    govMode: statusCache.governor?.mode || 'unknown',
    ga4Errors: am.outreach?.ga4Errors || 0,
    adopters: am.outreach?.adopters || 0,
    adopterPrs: am.outreach?.adopterPending || 0,
    ciPassRate: ciPassRate || 0,
    awesomeOpen: am.outreach?.outreachOpen || 0,
    awesomeMerged: am.outreach?.outreachMerged || 0,
    issueToMergeAvg: issueToMergeCache.avg_minutes || 0,
    stars: am.outreach?.stars || 0,
    forks: am.outreach?.forks || 0,
    contributors: am.outreach?.contributors || 0,
    acmm: am.outreach?.acmm || 0,
  };
  persistentHistory.push(snap);
  if (persistentHistory.length > MAX_PERSISTENT_POINTS) {
    persistentHistory = persistentHistory.slice(-MAX_PERSISTENT_POINTS);
  }
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(persistentHistory));
  } catch (e) { console.error('Failed to persist history:', e.message); }
}
// Persist every 15 min
setInterval(persistSnapshot, PERSIST_INTERVAL_MS);
// Also persist on startup after first fetch
setTimeout(persistSnapshot, 10000);

function fetchStatus() {
  return new Promise((resolve) => {
    const hiveEnv = { ...process.env, HIVE_TZ: process.env.HIVE_TZ || 'America/New_York' };
    execFile('/usr/local/bin/hive', ['status', '--json'], { timeout: 30000, env: hiveEnv }, (err, stdout, stderr) => {
      if (err) {
        console.error('hive status --json failed:', err.message, stderr ? 'stderr: ' + stderr.slice(0, 200) : '');
        resolve(statusCache); // return stale data
        return;
      }
      try {
        statusCache = JSON.parse(stdout);
        lastFetch = Date.now();
        // Replace -1 (bd timeout) with last known good beads values
        if (statusCache.beads) {
          if (statusCache.beads.workers >= 0) lastGoodBeads.workers = statusCache.beads.workers;
          else statusCache.beads.workers = lastGoodBeads.workers;
          if (statusCache.beads.supervisor >= 0) lastGoodBeads.supervisor = statusCache.beads.supervisor;
          else statusCache.beads.supervisor = lastGoodBeads.supervisor;
        }
        // Build reviewer metrics from live data
        statusCache.health = healthChecks;
        statusCache.ciPassRate = ciPassRate;
        statusCache.agentMetrics = agentMetrics;
        statusCache.tokens = tokenCache;
        // Attach governor model/budget state
        try {
          const budgetFile = path.join(GOVERNOR_STATE_DIR, 'budget_state');
          if (fs.existsSync(budgetFile)) {
            const blines = fs.readFileSync(budgetFile, 'utf8').trim().split('\n');
            const budget = {};
            for (const l of blines) { const [k,v] = l.split('='); if (k && v) budget[k] = isNaN(v) ? v : Number(v); }
            statusCache.budget = budget;
          }
        } catch (_) {}
        for (const a of (statusCache.agents || [])) {
          try {
            const mf = path.join(GOVERNOR_STATE_DIR, `model_${a.name}`);
            if (fs.existsSync(mf)) {
              const ml = fs.readFileSync(mf, 'utf8').trim().split('\n');
              const m = {};
              for (const l of ml) { const [k,v] = l.split('='); if (k && v) m[k] = v; }
              a.govBackend = m.BACKEND;
              a.govModel = m.MODEL;
              a.govCostWeight = Number(m.COST_WEIGHT || 0);
              a.govReason = m.REASON || '';
            }
          } catch (_) {}
          try {
            const pf = path.join(GOVERNOR_STATE_DIR, `paused_${a.name}`);
            const opf = path.join(GOVERNOR_STATE_DIR, `operator_paused_${a.name}`);
            if (fs.existsSync(pf) || fs.existsSync(opf)) { a.paused = true; a.cadence = 'paused'; }
          } catch (_) {}
          // Pin state
          try {
            const envFile = `${ENV_DIR}/${a.name}.env`;
            if (fs.existsSync(envFile)) {
              const envContent = fs.readFileSync(envFile, 'utf8');
              a.pinnedBoth = /^AGENT_CLI_PINNED=true$/m.test(envContent);
              a.pinnedCli = /^AGENT_PIN_CLI=true$/m.test(envContent);
              a.pinnedModel = /^AGENT_PIN_MODEL=true$/m.test(envContent);
            }
          } catch (_) {}
        }
        // Issue-to-merge time metric
        statusCache.issueToMerge = issueToMergeCache;
        // GitHub API rate limit alerts
        statusCache.ghRateLimits = ghRateLimitsCache;
        // Activity from JSONL tailing + tmux scraping — no stale status file fallback
        statusCache.summaries = summariesCache;
        for (const a of (statusCache.agents || [])) {
          const act = activityCache[a.name] || {};

          if (act.summary) {
            a.liveSummary = act.summary;
            a.summaryUpdated = act.ts ? new Date(act.ts).toISOString() : null;
          } else {
            a.liveSummary = '';
            a.summaryUpdated = null;
          }

          const sm = summariesCache[a.name] || {};
          a.structuredStatus = sm.status || '';
          a.statusEvidence = sm.evidence || '';
        }
        // Record snapshot for sparklines
        const snap = {
          t: lastFetch,
          govIssues: statusCache.governor?.issues || 0,
          govPrs: statusCache.governor?.prs || 0,
          govTotal: (statusCache.governor?.issues || 0) + (statusCache.governor?.prs || 0),
          govActive: statusCache.governor?.active ? 1 : 0,
          govMode: statusCache.governor?.mode || 'unknown',
          beadsWorkers: statusCache.beads?.workers || 0,
          beadsSupervisor: statusCache.beads?.supervisor || 0,
          repos: {},
          agents: {},
          ga4Errors: agentMetrics?.outreach?.ga4Errors || 0,
          adopters: agentMetrics?.outreach?.adopters || 0,
          adopterPrs: agentMetrics?.outreach?.adopterPending || 0,
          awesomeOpen: agentMetrics?.outreach?.outreachOpen || 0,
          awesomeMerged: agentMetrics?.outreach?.outreachMerged || 0,
          stars: agentMetrics?.outreach?.stars || 0,
          forks: agentMetrics?.outreach?.forks || 0,
          contributors: agentMetrics?.outreach?.contributors || 0,
          acmm: agentMetrics?.outreach?.acmm || 0,
          tokens: {},
          tokenTotal: 0,
          tokenInput: 0,
          tokenOutput: 0,
          tokenCacheRead: 0,
          tokenCacheCreate: 0,
          tokenMessages: 0,
        };
        // Token sparkline data
        const tc = tokenCache || {};
        const ba = tc.byAgent || {};
        let tokenTotal = 0;
        for (const [name, stats] of Object.entries(ba)) {
          const t = (stats.input || 0) + (stats.output || 0) + (stats.cacheRead || 0);
          snap.tokens[name] = t;
          tokenTotal += t;
        }
        snap.tokenTotal = tokenTotal;
        const tt = tc.totals || {};
        snap.tokenInput = tt.input || 0;
        snap.tokenOutput = tt.output || 0;
        snap.tokenCacheRead = tt.cacheRead || 0;
        snap.tokenCacheCreate = tt.cacheCreate || 0;
        snap.tokenMessages = tt.messages || 0;
        // Per-model token data
        snap.tokenModels = {};
        const bm = tc.byModel || {};
        for (const [name, stats] of Object.entries(bm)) {
          snap.tokenModels[name] = (stats.input || 0) + (stats.output || 0) + (stats.cacheRead || 0);
        }
        for (const r of (statusCache.repos || [])) {
          snap.repos[r.name] = { issues: r.issues || 0, prs: r.prs || 0 };
        }
        for (const a of (statusCache.agents || [])) {
          snap.agents[a.name] = { busy: a.busy === 'working' ? 1 : 0, restarts: a.restarts || 0 };
        }
        sparkTickCount++;
        if (sparkTickCount % SPARK_RECORD_INTERVAL === 0) {
          history.push(snap);
          if (history.length > MAX_HISTORY) history.shift();
        }
        // Persist sparkline every 2 min (~4 recorded points)
        if (sparkTickCount % (SPARK_RECORD_INTERVAL * 4) === 0) {
          try { fs.writeFileSync(SPARKLINE_FILE, JSON.stringify(history)); } catch (_) {}
        }
        resolve(statusCache);
      } catch (e) {
        console.error('JSON parse error:', e.message);
        resolve(statusCache);
      }
    });
  });
}

// Background refresh loop — fast (agents only, no GH API calls)
setInterval(fetchStatus, REFRESH_MS);
fetchStatus();

// Repo data — read from centralized api-collector cache (no additional GH API calls)
const REPO_REFRESH_MS = 60000;
const GITHUB_CACHE_PATH = path.join(process.env.HIVE_METRICS_DIR || '/var/run/hive-metrics', 'github-cache.json');
function fetchRepoStatus() {
  try {
    const raw = fs.readFileSync(GITHUB_CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (statusCache && data.repos) statusCache.repos = data.repos;
  } catch (_) {}
}
setInterval(fetchRepoStatus, REPO_REFRESH_MS);
fetchRepoStatus();

// Serve static files
app.use(express.static(__dirname));

// Git version — cached, refreshed every 5 min
let gitVersionCache = { hash: '?', short: '?', behind: 0, dirty: false, ts: 0 };
const GIT_VERSION_REFRESH_MS = 300000;
function refreshGitVersion() {
  const hiveDir = HIVE_REPO_DIR;
  execFile('git', ['-C', hiveDir, 'rev-parse', 'HEAD'], { timeout: 5000 }, (err, hash) => {
    if (err) return;
    gitVersionCache.hash = hash.trim();
    gitVersionCache.short = hash.trim().slice(0, 7);
    gitVersionCache.ts = Date.now();
    execFile('git', ['-C', hiveDir, 'status', '--porcelain'], { timeout: 5000 }, (e2, status) => {
      if (!e2) gitVersionCache.dirty = status.trim().length > 0;
    });
    execFile('git', ['-C', hiveDir, 'fetch', 'origin', 'main', '--quiet'], { timeout: 10000 }, () => {
      execFile('git', ['-C', hiveDir, 'rev-list', 'HEAD..origin/main', '--count'], { timeout: 5000 }, (e3, count) => {
        if (!e3) gitVersionCache.behind = parseInt(count.trim(), 10) || 0;
      });
    });
  });
}
refreshGitVersion();
setInterval(refreshGitVersion, GIT_VERSION_REFRESH_MS);

app.get('/api/version', (_req, res) => res.json(gitVersionCache));

app.get('/api/config', (_req, res) => res.json({
  projectName: PROJECT_NAME,
  primaryRepo: PROJECT_PRIMARY_REPO,
  org: PROJECT_ORG,
  dashboardTitle: DASHBOARD_TITLE,
}));

const BUDGET_IGNORE_FLAG = path.join(METRICS_DIR, 'budget_ignore');
app.get('/api/budget-ignore', (_req, res) => {
  res.json({ ignored: fs.existsSync(BUDGET_IGNORE_FLAG) });
});
app.post('/api/budget-ignore', (req, res) => {
  const { ignored } = req.body || {};
  if (ignored) {
    try { fs.writeFileSync(BUDGET_IGNORE_FLAG, new Date().toISOString()); } catch (_) {}
  } else {
    try { fs.unlinkSync(BUDGET_IGNORE_FLAG); } catch (_) {}
  }
  res.json({ ignored: fs.existsSync(BUDGET_IGNORE_FLAG) });
});

// JSON API
app.get('/api/status', async (_req, res) => {
  const data = statusCache || await fetchStatus();
  res.json(data || { error: 'no data yet' });
});

// History API — downsample to ~120 points for sparklines
app.get('/api/history', (_req, res) => {
  const step = Math.max(1, Math.floor(history.length / 120));
  const sampled = history.filter((_, i) => i % step === 0 || i === history.length - 1);
  res.json(sampled);
});

// Persistent history API — day/week/month trends
app.get('/api/trends', (req, res) => {
  const range = req.query?.range || 'week';
  const now = Date.now();
  const ranges = { day: 86400000, week: 604800000, month: 2592000000 };
  const cutoff = now - (ranges[range] || ranges.week);
  const filtered = persistentHistory.filter(s => s.t >= cutoff);
  // Downsample to ~200 points max
  const step = Math.max(1, Math.floor(filtered.length / 200));
  const sampled = filtered.filter((_, i) => i % step === 0 || i === filtered.length - 1);
  res.json(sampled);
});

// Timeline API — 24h of mode snapshots for the governor timeline strip
const TIMELINE_24H_MS = 24 * 60 * 60 * 1000;
app.get('/api/timeline', (_req, res) => {
  const cutoff = Date.now() - TIMELINE_24H_MS;
  // Combine persistent (15-min) + recent (5s) history, deduped by time
  const combined = [...persistentHistory, ...history]
    .filter(s => s.t >= cutoff)
    .sort((a, b) => a.t - b.t);
  // Downsample to ~200 ticks for the strip
  const MAX_TICKS = 200;
  const step = Math.max(1, Math.floor(combined.length / MAX_TICKS));
  const sampled = combined.filter((_, i) => i % step === 0 || i === combined.length - 1);
  res.json(sampled.map(s => ({ t: s.t, mode: s.govMode || 'unknown' })));
});

// SSE stream
// Tmux pane preview — last N lines of an agent's tmux session
const TMUX_PREVIEW_LINES = 30;
app.get('/api/pane/:agent', (req, res) => {
  const agent = req.params.agent;
  const session = TMUX_SESSION[agent];
  if (!session) return res.status(400).json({ error: `unknown agent: ${agent}` });
  execFile('tmux', ['capture-pane', '-t', session, '-p', '-S', `-${TMUX_PREVIEW_LINES}`],
    { timeout: 5000 }, (err, stdout) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ agent, session, lines: stdout.split('\n').slice(-TMUX_PREVIEW_LINES) });
    });
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = () => {
    if (statusCache) {
      res.write(`data: ${JSON.stringify(statusCache)}\n\n`);
    }
  };

  send();
  const interval = setInterval(send, REFRESH_MS);
  req.on('close', () => clearInterval(interval));
});

// Widget download — serves the JSX file directly
app.get('/api/widget', (_req, res) => {
  const widgetFile = path.join(__dirname, 'ubersicht', 'hive-status.widget.jsx');
  if (!fs.existsSync(widgetFile)) {
    return res.status(404).json({ error: 'widget not found', path: widgetFile });
  }
  res.setHeader('Content-Type', 'text/jsx; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hive-status.widget.jsx"');
  fs.createReadStream(widgetFile).pipe(res);
});

// Map dashboard agent names to tmux session names
const TMUX_SESSION = {
  scanner: 'scanner',
  reviewer: 'reviewer',
  architect: 'feature',
  outreach: 'outreach',
  supervisor: 'supervisor',
};

// Control endpoints
app.post('/api/kick/:agent', (req, res) => {
  const agent = req.params.agent;
  const allowed = ENABLED_AGENTS_PLUS_ALL;
  if (!allowed.includes(agent)) {
    return res.status(400).json({ error: `invalid agent: ${agent}` });
  }
  const extraPrompt = (req.body && req.body.prompt) ? req.body.prompt.trim() : '';
  if (extraPrompt && agent !== 'all') {
    const session = TMUX_SESSION[agent];
    if (!session) {
      return res.status(400).json({ error: `no tmux session for ${agent}` });
    }
    execFile('tmux', ['send-keys', '-t', session, '-l', `OPERATOR DIRECTIVE: ${extraPrompt}`], { timeout: 10000 }, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const ENTER_COUNT = 3;
      let sent = 0;
      const sendNext = () => {
        if (sent >= ENTER_COUNT) {
          return res.json({ ok: true, output: `Sent custom prompt to ${agent}` });
        }
        sent++;
        execFile('tmux', ['send-keys', '-t', session, 'Enter'], { timeout: 5000 }, sendNext);
      };
      sendNext();
    });
  } else {
    execFile('/usr/local/bin/hive', ['kick', agent], { timeout: 30000 }, (err, stdout) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, output: stdout.trim() });
    });
  }
});

app.post('/api/switch/:agent/:backend', (req, res) => {
  const { agent, backend } = req.params;
  const allowedAgents = ENABLED_AGENTS;
  const allowedBackends = ['copilot', 'claude', 'gemini', 'goose'];
  if (!allowedAgents.includes(agent)) {
    return res.status(400).json({ error: `invalid agent: ${agent}` });
  }
  if (!allowedBackends.includes(backend)) {
    return res.status(400).json({ error: `invalid backend: ${backend}` });
  }
  // Check if CLI is pinned — reject switch if so
  const switchEnvFile = `${ENV_DIR}/${agent}.env`;
  try {
    const envContent = fs.readFileSync(switchEnvFile, 'utf8');
    const pinned = /^AGENT_CLI_PINNED=true$/m.test(envContent) || /^AGENT_PIN_CLI=true$/m.test(envContent);
    if (pinned) {
      return res.status(400).json({ error: `${agent} CLI is pinned — unpin first` });
    }
  } catch (_) { /* no env file */ }
  // Detect running model from status cache (process-based), not model file
  let currentModel = 'claude-opus-4-6';
  const switchAgentData = (statusCache.agents || []).find(a => a.name === agent);
  if (switchAgentData && switchAgentData.govModel) {
    currentModel = switchAgentData.govModel;
  } else {
    try {
      const mf = path.join(GOVERNOR_STATE_DIR, `model_${agent}`);
      const content = fs.readFileSync(mf, 'utf8');
      const match = content.match(/^MODEL=(.+)$/m);
      if (match) currentModel = match[1];
    } catch (_) { /* use default */ }
  }
  const modelFile = path.join(GOVERNOR_STATE_DIR, `model_${agent}`);
  const newContent = `BACKEND=${backend}\nMODEL=${currentModel}\n`;
  try {
    fs.writeFileSync(modelFile, newContent);
  } catch (e) {
    return res.status(500).json({ error: `failed to write model file: ${e.message}` });
  }
  // Keep backend state file in sync for kick-agents.sh
  try { fs.writeFileSync(`/var/run/agent-backends/${agent}`, backend); } catch (_) {}
  execFile(`${HIVE_REPO_DIR}/bin/kick-agents.sh`, [agent], { timeout: 60000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, output: `switched ${agent} backend to ${backend}` });
  });
});

app.post('/api/model/:agent/:model', (req, res) => {
  const { agent, model } = req.params;
  const allowedAgents = ENABLED_AGENTS;
  if (!allowedAgents.includes(agent)) {
    return res.status(400).json({ error: `invalid agent: ${agent}` });
  }
  // Detect running backend from status cache (process-based), not model file
  let currentBackend = 'claude';
  const agentData = (statusCache.agents || []).find(a => a.name === agent);
  if (agentData && agentData.cli && agentData.cli !== '?') {
    currentBackend = agentData.cli;
  } else {
    try {
      const mf2 = path.join(GOVERNOR_STATE_DIR, `model_${agent}`);
      const content = fs.readFileSync(mf2, 'utf8');
      const match = content.match(/^BACKEND=(.+)$/m);
      if (match) currentBackend = match[1];
    } catch (_) { /* use default */ }
  }
  const decodedModel = decodeURIComponent(model);
  // Check if CLI is pinned — if so, keep current backend unless incompatible
  const envFile = `${ENV_DIR}/${agent}.env`;
  let cliPinned = false;
  try {
    const envContent = fs.readFileSync(envFile, 'utf8');
    cliPinned = /^AGENT_CLI_PINNED=true$/m.test(envContent) || /^AGENT_PIN_CLI=true$/m.test(envContent);
  } catch (_) { /* no env file */ }
  if (cliPinned) {
    // Read pinned backend from state file (set by switch endpoint), not stale statusCache
    try {
      const stateBackend = fs.readFileSync(`/var/run/agent-backends/${agent}`, 'utf8').trim();
      if (stateBackend) currentBackend = stateBackend;
    } catch (_) { /* keep statusCache value */ }
  }
  // Model→backend compatibility: auto-switch CLI only if model is incompatible
  // claude CLI: claude-* models only
  // copilot CLI: claude-* and gpt-* models
  const normalized = decodedModel.toLowerCase();
  const isGpt = normalized.startsWith('gpt');
  const isGemini = normalized.startsWith('gemini');
  if (cliPinned) {
    if (isGpt && currentBackend === 'claude') {
      return res.status(400).json({ error: `cannot run GPT model on pinned claude CLI — unpin CLI first or switch CLI to copilot` });
    }
    if (isGemini && currentBackend !== 'gemini') {
      return res.status(400).json({ error: `cannot run Gemini model on pinned ${currentBackend} CLI — unpin CLI first or switch CLI to gemini` });
    }
  } else {
    if (isGpt && currentBackend === 'claude') {
      currentBackend = 'copilot';
    } else if (isGemini && currentBackend !== 'gemini') {
      currentBackend = 'gemini';
    }
  }
  const normalizedModel = normalizeModelForBackend(currentBackend, decodedModel);
  const newContent = `BACKEND=${currentBackend}\nMODEL=${normalizedModel}\n`;
  const modelFile = path.join(GOVERNOR_STATE_DIR, `model_${agent}`);
  try {
    fs.writeFileSync(modelFile, newContent);
  } catch (e) {
    return res.status(500).json({ error: `failed to write model file: ${e.message}` });
  }
  // Keep backend state file in sync for kick-agents.sh
  const BACKEND_STATE_DIR = '/var/run/agent-backends';
  try { fs.writeFileSync(`${BACKEND_STATE_DIR}/${agent}`, currentBackend); } catch (_) {}
  execFile(`${HIVE_REPO_DIR}/bin/kick-agents.sh`, [agent], { timeout: 60000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, output: `switched ${agent} model to ${decodedModel} (backend: ${currentBackend})` });
  });
});

// Pause / Resume agent — uses a flag file that the governor respects
const GOVERNOR_CADENCE_DIR = '/var/run/kick-governor';

// Cadence matrix (seconds) — mirrors kick-governor.sh defaults.
// 0 means paused in that mode.
const CADENCE_MATRIX = {
  scanner:    { surge: 900, busy: 900,  quiet: 900,  idle: 900  },
  reviewer:   { surge: 0,   busy: 3600, quiet: 2700, idle: 900  },
  architect:  { surge: 0,   busy: 0,    quiet: 0,    idle: 1800 },
  outreach:   { surge: 0,   busy: 0,    quiet: 0,    idle: 7200 },
  supervisor: { surge: 300, busy: 600,  quiet: 900,  idle: 1800 },
};

const SEC_TO_LABEL = (s) => {
  if (s <= 0) return 'paused';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}min`;
  return `${s / 3600}h`;
};

function lookupCadenceForAgent(agent) {
  const modeFile = path.join(GOVERNOR_CADENCE_DIR, 'mode');
  let mode = 'busy';
  try { if (fs.existsSync(modeFile)) mode = fs.readFileSync(modeFile, 'utf8').trim(); } catch (_) {}
  const agentMatrix = CADENCE_MATRIX[agent];
  if (!agentMatrix) return '15min';
  const secs = agentMatrix[mode] || 0;
  return SEC_TO_LABEL(secs);
}

app.post('/api/pause/:agent', (req, res) => {
  const agent = req.params.agent;
  const allowed = ENABLED_AGENTS;
  if (!allowed.includes(agent)) {
    return res.status(400).json({ error: `cannot pause ${agent}` });
  }
  const pauseFlag = path.join(GOVERNOR_CADENCE_DIR, `paused_${agent}`);
  const operatorFlag = path.join(GOVERNOR_CADENCE_DIR, `operator_paused_${agent}`);
  try {
    fs.writeFileSync(pauseFlag, new Date().toISOString());
    fs.writeFileSync(operatorFlag, new Date().toISOString());
    fs.writeFileSync(path.join(GOVERNOR_CADENCE_DIR, `cadence_${agent}`), 'paused');
  } catch (e) {
    return res.status(500).json({ error: `failed to write pause flag: ${e.message}` });
  }
  // Send 4x Esc to cancel any pending work, C-c + C-u to clear prompt, then /rename, then stop
  const PAUSE_ESC_TO_CLEAR_MS = 2000;
  const PAUSE_CLEAR_TO_RENAME_MS = 1000;
  const PAUSE_RENAME_TO_STOP_MS = 3000;
  try {
    execSync(`tmux send-keys -t ${agent} Escape Escape Escape Escape`, { timeout: 5000 });
  } catch (_) { /* session may not exist */ }
  setTimeout(() => {
    try {
      execSync(`tmux send-keys -t ${agent} C-c`, { timeout: 5000 });
      execSync(`tmux send-keys -t ${agent} C-u`, { timeout: 5000 });
    } catch (_) { /* ignore */ }
    setTimeout(() => {
      try {
        execSync(`tmux send-keys -t ${agent} '/rename ${agent}-paused' Enter`, { timeout: 5000 });
      } catch (_) { /* ignore */ }
      setTimeout(() => {
        execFile('/usr/local/bin/hive', ['stop', agent], { timeout: 30000 }, (err) => {
          if (err) console.error(`pause stop error for ${agent}:`, err.message);
          res.json({ ok: true, output: `${agent} paused` });
        });
      }, PAUSE_RENAME_TO_STOP_MS);
    }, PAUSE_CLEAR_TO_RENAME_MS);
  }, PAUSE_ESC_TO_CLEAR_MS);
});

app.post('/api/resume/:agent', (req, res) => {
  const agent = req.params.agent;
  const allowed = ENABLED_AGENTS;
  if (!allowed.includes(agent)) {
    return res.status(400).json({ error: `cannot resume ${agent}` });
  }
  const pauseFlag = path.join(GOVERNOR_CADENCE_DIR, `paused_${agent}`);
  const operatorFlag = path.join(GOVERNOR_CADENCE_DIR, `operator_paused_${agent}`);
  const cadenceFlag = path.join(GOVERNOR_CADENCE_DIR, `cadence_${agent}`);
  const wasPausedFlag = path.join(GOVERNOR_CADENCE_DIR, `was_paused_${agent}`);
  try {
    if (fs.existsSync(pauseFlag)) fs.unlinkSync(pauseFlag);
    if (fs.existsSync(operatorFlag)) fs.unlinkSync(operatorFlag);
    if (fs.existsSync(wasPausedFlag)) fs.unlinkSync(wasPausedFlag);
    // Write the correct cadence for the current governor mode instead of deleting.
    // Governor will overwrite on next cycle; this prevents a gap where interval shows "?".
    const cadenceForMode = lookupCadenceForAgent(agent);
    fs.writeFileSync(cadenceFlag, cadenceForMode);
  } catch (e) {
    return res.status(500).json({ error: `failed to remove pause flag: ${e.message}` });
  }
  // Start the systemd service first (hive stop killed it), then kick after CLI is ready
  // supervisor.sh handles /rename via AGENT_CLAUDE_RENAME_TO on startup
  const RESUME_KICK_DELAY_MS = 20000;
  execFile('sudo', ['systemctl', 'start', `hive@${agent}`], { timeout: 30000 }, (startErr) => {
    if (startErr) return res.status(500).json({ error: `failed to start ${agent}: ${startErr.message}` });
    setTimeout(() => {
      execFile('/usr/local/bin/kick-agents.sh', [agent], { timeout: 30000 }, (kickErr) => {
        if (kickErr) console.error(`resume kick error for ${agent}:`, kickErr.message);
      });
    }, RESUME_KICK_DELAY_MS);
    res.json({ ok: true, output: `${agent} resumed` });
  });
});

// Pin / Unpin — supports granular pinning (cli, model, or both)
// POST /api/pin/:agent           — pin both (legacy)
// POST /api/pin/:agent/cli       — pin backend only
// POST /api/pin/:agent/model     — pin model only
// POST /api/unpin/:agent         — unpin all
// POST /api/unpin/:agent/cli     — unpin backend only
// POST /api/unpin/:agent/model   — unpin model only
const PIN_ALLOWED = ['scanner', 'reviewer', 'architect', 'outreach', 'supervisor'];
const ENV_DIR = '/etc/hive';

function setEnvFlag(agent, flag, value) {
  const envFile = `${ENV_DIR}/${agent}.env`;
  writeEnvVar(envFile, flag, value);
}

function removeEnvFlag(agent, flag) {
  const envFile = `${ENV_DIR}/${agent}.env`;
  removeEnvVar(envFile, flag);
}

app.post('/api/pin/:agent{/:dimension}', (req, res) => {
  const { agent, dimension } = req.params;
  if (!PIN_ALLOWED.includes(agent)) {
    return res.status(400).json({ error: `cannot pin ${agent}` });
  }
  try {
    if (!dimension || dimension === 'both') {
      setEnvFlag(agent, 'AGENT_CLI_PINNED', 'true');
      const lockFile = path.join(GOVERNOR_STATE_DIR, `model_lock_${agent}`);
      try { const { execSync: es } = require('child_process'); es(`sudo touch ${lockFile}`); } catch (_) {}
      // Snapshot current backend to state file
      const pinBothData = (statusCache.agents || []).find(a => a.name === agent);
      if (pinBothData && pinBothData.cli && pinBothData.cli !== '?') {
        try { fs.writeFileSync(`/var/run/agent-backends/${agent}`, pinBothData.cli); } catch (_) {}
      }
      res.json({ ok: true, output: `${agent} pinned (both cli+model)` });
    } else if (dimension === 'cli') {
      setEnvFlag(agent, 'AGENT_PIN_CLI', 'true');
      // Snapshot current backend to state file so model endpoint reads the correct pinned value
      const pinAgentData = (statusCache.agents || []).find(a => a.name === agent);
      if (pinAgentData && pinAgentData.cli && pinAgentData.cli !== '?') {
        try { fs.writeFileSync(`/var/run/agent-backends/${agent}`, pinAgentData.cli); } catch (_) {}
      }
      res.json({ ok: true, output: `${agent} cli pinned` });
    } else if (dimension === 'model') {
      setEnvFlag(agent, 'AGENT_PIN_MODEL', 'true');
      res.json({ ok: true, output: `${agent} model pinned` });
    } else {
      res.status(400).json({ error: `invalid dimension: ${dimension} (valid: cli, model, both)` });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/unpin/:agent{/:dimension}', (req, res) => {
  const { agent, dimension } = req.params;
  if (!PIN_ALLOWED.includes(agent)) {
    return res.status(400).json({ error: `cannot unpin ${agent}` });
  }
  try {
    if (!dimension || dimension === 'both') {
      removeEnvFlag(agent, 'AGENT_CLI_PINNED');
      removeEnvFlag(agent, 'AGENT_PIN_CLI');
      removeEnvFlag(agent, 'AGENT_PIN_MODEL');
      const lockFile = path.join(GOVERNOR_STATE_DIR, `model_lock_${agent}`);
      try { const { execSync: es } = require('child_process'); es(`sudo rm -f ${lockFile}`); } catch (_) {}
      res.json({ ok: true, output: `${agent} unpinned (all)` });
    } else if (dimension === 'cli') {
      removeEnvFlag(agent, 'AGENT_PIN_CLI');
      const envFile = `${ENV_DIR}/${agent}.env`;
      const hadLegacy = fs.existsSync(envFile) && /^AGENT_CLI_PINNED=true$/m.test(fs.readFileSync(envFile, 'utf8'));
      removeEnvFlag(agent, 'AGENT_CLI_PINNED');
      if (hadLegacy) setEnvFlag(agent, 'AGENT_PIN_MODEL', 'true');
      res.json({ ok: true, output: `${agent} cli unpinned` });
    } else if (dimension === 'model') {
      removeEnvFlag(agent, 'AGENT_PIN_MODEL');
      const envFile = `${ENV_DIR}/${agent}.env`;
      const hadLegacy = fs.existsSync(envFile) && /^AGENT_CLI_PINNED=true$/m.test(fs.readFileSync(envFile, 'utf8'));
      removeEnvFlag(agent, 'AGENT_CLI_PINNED');
      if (hadLegacy) setEnvFlag(agent, 'AGENT_PIN_CLI', 'true');
      res.json({ ok: true, output: `${agent} model unpinned` });
    } else {
      res.status(400).json({ error: `invalid dimension: ${dimension} (valid: cli, model, both)` });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restart agent — kill tmux session so hive@.service respawns it
app.post('/api/restart/:agent', (req, res) => {
  const agent = req.params.agent;
  const allowed = ENABLED_AGENTS;
  if (!allowed.includes(agent)) {
    return res.status(400).json({ error: `invalid agent: ${agent}` });
  }
  const session = TMUX_SESSION[agent];
  if (!session) {
    return res.status(400).json({ error: `no tmux session mapped for ${agent}` });
  }
  execFile('tmux', ['kill-session', '-t', session], { timeout: 10000 }, (err) => {
    if (err) return res.status(500).json({ error: `tmux kill-session failed: ${err.message}` });
    res.json({ ok: true, output: `${agent} session killed — supervisor will respawn` });
  });
});

// Reset restart counter for an agent
app.post('/api/reset-restarts/:agent', (req, res) => {
  const agent = req.params.agent;
  const allowed = ENABLED_AGENTS;
  if (!allowed.includes(agent)) {
    return res.status(400).json({ error: `invalid agent: ${agent}` });
  }
  const restartFile = path.join(GOVERNOR_STATE_DIR, `restarts_${agent}`);
  try {
    if (fs.existsSync(restartFile)) {
      const { execSync } = require('child_process');
      execSync(`sudo truncate -s 0 ${restartFile}`);
    }
    res.json({ ok: true, output: `${agent} restart counter reset` });
  } catch (e) {
    res.status(500).json({ error: `failed to reset: ${e.message}` });
  }
});

// Token usage
app.get('/api/tokens', (_req, res) => {
  res.json(tokenCache || { error: 'no data yet' });
});

// Per-issue token cost data — produced by bin/token-collector.sh
app.get('/api/issue-costs', (_req, res) => {
  const costsFile = path.join(METRICS_DIR, 'issue-costs.json');
  try {
    if (fs.existsSync(costsFile)) {
      const raw = fs.readFileSync(costsFile, 'utf8');
      const data = JSON.parse(raw);
      return res.json(data);
    }
    res.json([]);
  } catch (_) {
    res.json([]);
  }
});

// Model advisor — reads governor state files
const GOVERNOR_STATE_DIR = '/var/run/kick-governor';
app.get('/api/model-advisor', (_req, res) => {
  const agents = ['scanner', 'reviewer', 'architect', 'outreach', 'supervisor'];
  const result = { mode: 'unknown', budget: {}, agents: [] };

  try {
    const modeFile = path.join(GOVERNOR_STATE_DIR, 'mode');
    if (fs.existsSync(modeFile)) result.mode = fs.readFileSync(modeFile, 'utf8').trim();
  } catch (_) {}

  try {
    const budgetFile = path.join(GOVERNOR_STATE_DIR, 'budget_state');
    if (fs.existsSync(budgetFile)) {
      const lines = fs.readFileSync(budgetFile, 'utf8').trim().split('\n');
      for (const line of lines) {
        const [k, v] = line.split('=');
        if (k && v) result.budget[k] = isNaN(v) ? v : Number(v);
      }
    }
  } catch (_) {}

  for (const agent of agents) {
    const entry = { name: agent, backend: 'unknown', model: 'unknown', costWeight: 0, reason: '' };
    try {
      const mf = path.join(GOVERNOR_STATE_DIR, `model_${agent}`);
      if (fs.existsSync(mf)) {
        const lines = fs.readFileSync(mf, 'utf8').trim().split('\n');
        for (const line of lines) {
          const [k, v] = line.split('=');
          if (k === 'BACKEND') entry.backend = v;
          else if (k === 'MODEL') entry.model = v;
          else if (k === 'COST_WEIGHT') entry.costWeight = Number(v);
          else if (k === 'REASON') entry.reason = v;
          else if (k === 'PREV_BACKEND' && v) entry.prevBackend = v;
          else if (k === 'PREV_MODEL' && v) entry.prevModel = v;
        }
        entry.changed = (entry.prevBackend && entry.prevBackend !== entry.backend) ||
                         (entry.prevModel && entry.prevModel !== entry.model);
      }
    } catch (_) {}

    try {
      const cf = path.join(GOVERNOR_STATE_DIR, `cadence_${agent}`);
      if (fs.existsSync(cf)) entry.cadence = fs.readFileSync(cf, 'utf8').trim();
    } catch (_) {}

    try {
      const pf = path.join(GOVERNOR_STATE_DIR, `paused_${agent}`);
      const opf = path.join(GOVERNOR_STATE_DIR, `operator_paused_${agent}`);
      if (fs.existsSync(pf) || fs.existsSync(opf)) entry.paused = true;
    } catch (_) {}

    result.agents.push(entry);
  }
  res.json(result);
});

// GitHub auth health
app.get('/api/gh-auth', (_req, res) => {
  res.json({ ok: ghAuthOk, lastChecked: ghAuthLastChecked });
});

// GitHub API rate limit alerts
app.get('/api/gh-rate-limits', (_req, res) => {
  res.json(ghRateLimitsCache || { alerts: [] });
});

// Comprehensive exec summaries (task + progress + results)
app.get('/api/summaries', (req, res) => {
  execFile(path.join(__dirname, 'agent-summaries.sh'), [], { timeout: 10000 }, (err, stdout) => {
    if (err) {
      return res.json({ summaries: {} });
    }
    try {
      const data = JSON.parse(stdout.trim());
      res.json(data);
    } catch (e) {
      res.json({ summaries: {} });
    }
  });
});

// ── Configuration Dialog API ──────────────���──────────────────────────────────
const GOVERNOR_ENV_PATH = '/etc/hive/governor.env';

// Security: validate agent names and env keys to prevent shell injection
const VALID_AGENT_NAME = /^[a-z][a-z0-9_-]{0,30}$/;
const VALID_ENV_KEY = /^[A-Z_][A-Z0-9_]{0,60}$/;

function validateAgentName(name, res) {
  if (!VALID_AGENT_NAME.test(name) || !ENABLED_AGENTS.includes(name)) {
    res.status(400).json({ error: 'invalid or unknown agent: ' + name });
    return false;
  }
  return true;
}

function shellQuote(s) {
  return "'" + s.replace(/'/g, "'\\''" ) + "'";
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
    if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return vars;
}

function writeEnvVar(filePath, key, value) {
  if (!VALID_ENV_KEY.test(key)) throw new Error(`invalid env key: ${key}`);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
  let updated;
  if (regex.test(content)) {
    updated = content.replace(regex, `${key}=${value}`);
  } else {
    updated = content.trimEnd() + `\n${key}=${value}\n`;
  }
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, updated, { mode: 0o644 });
  execSync(`sudo mv ${shellQuote(tmp)} ${shellQuote(filePath)}`);
}

function removeEnvVar(filePath, key) {
  if (!VALID_ENV_KEY.test(key)) throw new Error(`invalid env key: ${key}`);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const updated = content.replace(new RegExp(`^${escapedKey}=.*\n?`, 'gm'), '');
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, updated, { mode: 0o644 });
  execSync(`sudo mv ${shellQuote(tmp)} ${shellQuote(filePath)}`);
}

function deriveCli(launchCmd) {
  if (/copilot/i.test(launchCmd)) return 'copilot';
  if (/claude/i.test(launchCmd)) return 'claude';
  if (/aider/i.test(launchCmd)) return 'aider';
  return 'claude';
}

app.get('/api/config/agent/:name', (req, res) => {
  const { name } = req.params;
  if (!ENABLED_AGENTS.includes(name)) {
    return res.status(404).json({ error: `unknown agent: ${name}` });
  }
  try {
    const agentEnv = parseEnvFile(`${ENV_DIR}/${name}.env`);
    const govEnv = parseEnvFile(GOVERNOR_ENV_PATH);
    const upper = name.toUpperCase();

    const launchCmd = agentEnv.AGENT_LAUNCH_CMD || '';
    const modelMatch = launchCmd.match(/--model\s+(\S+)/);
    const general = {
      launchCmd,
      cliPinned: agentEnv.AGENT_CLI_PINNED === 'true' || agentEnv.AGENT_PIN_CLI === 'true',
      cliPinValue: agentEnv.AGENT_CLI_PIN_VALUE || agentEnv.AGENT_CLI || deriveCli(launchCmd),
      staleTimeout: parseInt(agentEnv.AGENT_STALE_TIMEOUT_SEC || agentEnv.AGENT_STALE_MAX_SEC || '1200', 10),
      restartStrategy: agentEnv.AGENT_RESTART_STRATEGY || 'immediate',
      model: modelMatch ? modelMatch[1] : '',
    };

    const cadences = {
      surge: parseInt(govEnv[`CADENCE_${upper}_SURGE_SEC`] || String((CADENCE_MATRIX[name] || {}).surge || 0), 10),
      busy: parseInt(govEnv[`CADENCE_${upper}_BUSY_SEC`] || String((CADENCE_MATRIX[name] || {}).busy || 0), 10),
      quiet: parseInt(govEnv[`CADENCE_${upper}_QUIET_SEC`] || String((CADENCE_MATRIX[name] || {}).quiet || 0), 10),
      idle: parseInt(govEnv[`CADENCE_${upper}_IDLE_SEC`] || String((CADENCE_MATRIX[name] || {}).idle || 0), 10),
    };

    const models = {
      surge: govEnv[`MODEL_${upper}_SURGE`] || '',
      busy: govEnv[`MODEL_${upper}_BUSY`] || '',
      quiet: govEnv[`MODEL_${upper}_QUIET`] || '',
      idle: govEnv[`MODEL_${upper}_IDLE`] || '',
    };

    const pipeline = {};
    for (const stage of ['resolve-beads', 'track-prs', 'stale-check', 'repo-scan', 'coverage-gate', 'prompt-compose', 'budget-check', 'api-collect', 'final-compose']) {
      const key = `PIPELINE_SKIP_${stage.replace(/-/g, '_').toUpperCase()}`;
      pipeline[stage] = agentEnv[key] !== 'true';
    }

    const hooks = {
      preKick: agentEnv.PRE_KICK_HOOKS ? agentEnv.PRE_KICK_HOOKS.split(',').filter(Boolean) : [],
      postIdle: agentEnv.POST_IDLE_HOOKS ? agentEnv.POST_IDLE_HOOKS.split(',').filter(Boolean) : [],
    };

    const restrictions = agentEnv.AGENT_RESTRICTIONS ? agentEnv.AGENT_RESTRICTIONS.split(',').filter(Boolean) : [];

    let prompt = '';
    try {
      const kickScript = fs.readFileSync(path.join(HIVE_REPO_DIR, 'bin', 'kick-agents.sh'), 'utf8');
      const msgVar = `${upper}_MSG=`;
      const msgIdx = kickScript.indexOf(msgVar);
      if (msgIdx !== -1) {
        const afterEq = kickScript.indexOf('"', msgIdx);
        if (afterEq !== -1) {
          let depth = 0;
          let end = afterEq + 1;
          while (end < kickScript.length) {
            if (kickScript[end] === '\\') { end += 2; continue; }
            if (kickScript[end] === '"' && depth === 0) break;
            if (kickScript[end] === '$' && kickScript[end + 1] === '{') depth++;
            if (kickScript[end] === '}' && depth > 0) depth--;
            end++;
          }
          const raw = kickScript.slice(afterEq + 1, end);
          prompt = raw.replace(/\$\{[^}]+\}/g, '(…)').slice(0, 4000);
        }
      }
    } catch (_) {}

    res.json({ general, cadences, models, pipeline, hooks, restrictions, prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/general', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const envFile = `${ENV_DIR}/${name}.env`;
  try {
    const { launchCmd, cliPinned, cliPinValue, staleTimeout, restartStrategy, model } = req.body;
    if (launchCmd !== undefined) writeEnvVar(envFile, 'AGENT_LAUNCH_CMD', launchCmd);
    if (cliPinned !== undefined) writeEnvVar(envFile, 'AGENT_CLI_PINNED', String(cliPinned));
    if (cliPinValue !== undefined) writeEnvVar(envFile, 'AGENT_CLI_PIN_VALUE', cliPinValue);
    if (staleTimeout !== undefined) writeEnvVar(envFile, 'AGENT_STALE_TIMEOUT_SEC', String(staleTimeout));
    if (restartStrategy !== undefined) writeEnvVar(envFile, 'AGENT_RESTART_STRATEGY', restartStrategy);
    if (model !== undefined) {
      const currentCmd = parseEnvFile(envFile).AGENT_LAUNCH_CMD || '';
      const updatedCmd = currentCmd.includes('--model')
        ? currentCmd.replace(/--model\s+\S+/, `--model ${model}`)
        : `${currentCmd} --model ${model}`;
      writeEnvVar(envFile, 'AGENT_LAUNCH_CMD', updatedCmd.trim());
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/cadences', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const upper = name.toUpperCase();
  try {
    const { surge, busy, quiet, idle } = req.body;
    if (surge !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `CADENCE_${upper}_SURGE_SEC`, String(surge));
    if (busy !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `CADENCE_${upper}_BUSY_SEC`, String(busy));
    if (quiet !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `CADENCE_${upper}_QUIET_SEC`, String(quiet));
    if (idle !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `CADENCE_${upper}_IDLE_SEC`, String(idle));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/models', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const upper = name.toUpperCase();
  try {
    const { surge, busy, quiet, idle } = req.body;
    if (surge !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `MODEL_${upper}_SURGE`, surge);
    if (busy !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `MODEL_${upper}_BUSY`, busy);
    if (quiet !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `MODEL_${upper}_QUIET`, quiet);
    if (idle !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, `MODEL_${upper}_IDLE`, idle);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/pipeline', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const envFile = `${ENV_DIR}/${name}.env`;
  try {
    for (const [stage, enabled] of Object.entries(req.body)) {
      const key = `PIPELINE_SKIP_${stage.replace(/-/g, '_').toUpperCase()}`;
      if (enabled === false) {
        writeEnvVar(envFile, key, 'true');
      } else {
        removeEnvVar(envFile, key);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/hooks', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const envFile = `${ENV_DIR}/${name}.env`;
  try {
    const { preKick, postIdle } = req.body;
    if (preKick !== undefined) writeEnvVar(envFile, 'PRE_KICK_HOOKS', preKick.join(','));
    if (postIdle !== undefined) writeEnvVar(envFile, 'POST_IDLE_HOOKS', postIdle.join(','));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/restrictions', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const envFile = `${ENV_DIR}/${name}.env`;
  try {
    const list = req.body.list || [];
    writeEnvVar(envFile, 'AGENT_RESTRICTIONS', list.join(','));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/agent/:name/prompt', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  try {
    const kickScript = fs.readFileSync(path.join(HIVE_REPO_DIR, 'bin', 'kick-agents.sh'), 'utf8');
    const upper = name.toUpperCase();
    const msgVar = `${upper}_MSG=`;
    const msgIdx = kickScript.indexOf(msgVar);
    let prompt = '';
    if (msgIdx !== -1) {
      const afterEq = kickScript.indexOf('"', msgIdx);
      if (afterEq !== -1) {
        let depth = 0;
        let end = afterEq + 1;
        while (end < kickScript.length) {
          if (kickScript[end] === '\\') { end += 2; continue; }
          if (kickScript[end] === '"' && depth === 0) break;
          if (kickScript[end] === '$' && kickScript[end + 1] === '{') depth++;
          if (kickScript[end] === '}' && depth > 0) depth--;
          end++;
        }
        const raw = kickScript.slice(afterEq + 1, end);
        prompt = raw.replace(/\$\{[^}]+\}/g, '(…)').slice(0, 4000);
      }
    }
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/governor', (_req, res) => {
  try {
    const govEnv = parseEnvFile(GOVERNOR_ENV_PATH);
    const agents = ENABLED_AGENTS.slice();

    const thresholds = {
      surge: parseInt(govEnv.SURGE_THRESHOLD || '20', 10),
      busy: parseInt(govEnv.BUSY_THRESHOLD || '10', 10),
      quiet: parseInt(govEnv.QUIET_THRESHOLD || '2', 10),
    };

    const labels = govEnv.EXEMPT_LABELS ? govEnv.EXEMPT_LABELS.split(',').filter(Boolean) : [];

    const budget = {
      totalTokens: parseInt(govEnv.BUDGET_TOTAL_TOKENS || '0', 10),
      periodDays: parseInt(govEnv.BUDGET_PERIOD_DAYS || '7', 10),
      criticalPct: parseInt(govEnv.BUDGET_CRITICAL_PCT || '90', 10),
    };

    const notifications = {
      ntfyServer: govEnv.NTFY_SERVER || '',
      ntfyTopic: govEnv.NTFY_TOPIC || '',
      discordWebhook: govEnv.DISCORD_WEBHOOK ? '(configured)' : '',
    };

    const health = {
      healthcheckInterval: parseInt(govEnv.HEALTHCHECK_INTERVAL_SEC || '300', 10),
      restartCooldown: parseInt(govEnv.RESTART_COOLDOWN_SEC || '60', 10),
      modelLock: govEnv.MODEL_LOCK === 'true',
    };

    res.json({ agents, thresholds, labels, budget, notifications, health });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/thresholds', (req, res) => {
  try {
    const { surge, busy, quiet } = req.body;
    if (surge !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'SURGE_THRESHOLD', String(surge));
    if (busy !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'BUSY_THRESHOLD', String(busy));
    if (quiet !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'QUIET_THRESHOLD', String(quiet));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/labels', (req, res) => {
  try {
    const list = req.body.list || [];
    writeEnvVar(GOVERNOR_ENV_PATH, 'EXEMPT_LABELS', list.join(','));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/budget', (req, res) => {
  try {
    const { totalTokens, periodDays, criticalPct } = req.body;
    if (totalTokens !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'BUDGET_TOTAL_TOKENS', String(totalTokens));
    if (periodDays !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'BUDGET_PERIOD_DAYS', String(periodDays));
    if (criticalPct !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'BUDGET_CRITICAL_PCT', String(criticalPct));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/notifications', (req, res) => {
  try {
    const { ntfyServer, ntfyTopic, discordWebhook } = req.body;
    if (ntfyServer !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'NTFY_SERVER', ntfyServer);
    if (ntfyTopic !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'NTFY_TOPIC', ntfyTopic);
    if (discordWebhook && discordWebhook !== '••••••••') writeEnvVar(GOVERNOR_ENV_PATH, 'DISCORD_WEBHOOK', discordWebhook);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/health', (req, res) => {
  try {
    const { healthcheckInterval, restartCooldown, modelLock } = req.body;
    if (healthcheckInterval !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'HEALTHCHECK_INTERVAL_SEC', String(healthcheckInterval));
    if (restartCooldown !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'RESTART_COOLDOWN_SEC', String(restartCooldown));
    if (modelLock !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'MODEL_LOCK', String(modelLock));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/governor/agents', (req, res) => {
  const { name } = req.body;
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    return res.status(400).json({ error: 'Invalid agent name (lowercase alphanumeric + hyphens)' });
  }
  try {
    const envFile = `${ENV_DIR}/${name}.env`;
    if (!fs.existsSync(envFile)) {
      const initContent = `# ${name} agent config\nAGENT_LAUNCH_CMD=agent-launch.sh\nAGENT_CLI_PINNED=false\n`;
      const tmp = envFile + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, initContent, { mode: 0o644 });
      execSync(`sudo mv ${shellQuote(tmp)} ${shellQuote(envFile)}`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/config/governor/agents/:name', (req, res) => {
  const { name } = req.params;
  if (!VALID_AGENT_NAME.test(name)) {
    return res.status(400).json({ error: 'invalid agent name' });
  }
  try {
    const envFile = `${ENV_DIR}/${name}.env`;
    if (fs.existsSync(envFile)) {
      execSync(`sudo rm ${shellQuote(envFile)}`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/backends', (_req, res) => {
  try {
    const backendsFile = path.join(HIVE_REPO_DIR, 'config', 'backends.conf');
    const content = fs.existsSync(backendsFile) ? fs.readFileSync(backendsFile, 'utf8') : '';
    res.json({ raw: content, backends: KNOWN_BACKENDS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🐝 Hive Dashboard running at http://localhost:${PORT}`);
});
