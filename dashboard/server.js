const express = require('express');
const { execFile, execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const yaml = (() => { try { return require('js-yaml'); } catch (_) { return null; } })();

/** Mask a secret value — show only whether it's configured and last 4 chars */
function _maskSecret(val) {
  if (!val) return '';
  if (val.length <= 8) return '••••••••';
  return '••••••••' + val.slice(-4);
}

const app = express();
app.use(express.json());

// Auth middleware — protect mutating endpoints with Bearer token
const DASHBOARD_TOKEN = process.env.HIVE_DASHBOARD_TOKEN || '';
if (!DASHBOARD_TOKEN && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] HIVE_DASHBOARD_TOKEN is not set — all mutations are unauthenticated!');
  process.exit(1);
}
function requireAuth(req, res, next) {
  if (!DASHBOARD_TOKEN) return next(); // no token configured — skip (local dev)
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(DASHBOARD_TOKEN);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return requireAuth(req, res, next);
  next();
});

// Content Security Policy — mitigate XSS blast radius
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Load project config from hive-project.yaml (code-managed, synced from repo)
const CONFIG_PATH = process.env.HIVE_PROJECT_CONFIG || '/etc/hive/hive-project.yaml';
// Dynamic config — operator overrides that survive deploys (flat key=value)
const CONFIG_ENV_PATH = process.env.HIVE_CONFIG_ENV || '/etc/hive/config.env';
const SIDEBAR_JSON_PATH = process.env.HIVE_SIDEBAR_CONFIG || '/etc/hive/sidebar.json';

function _loadYaml(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (yaml) return yaml.load(raw) || {};
    const json = execSync(
      `python3 -c "import yaml,json,sys; print(json.dumps(yaml.safe_load(sys.stdin)))" < ${shellQuote(filePath)}`,
      { encoding: 'utf8' }
    );
    return JSON.parse(json);
  } catch (_) { return {}; }
}

let projectConfig = _loadYaml(CONFIG_PATH);
const configEnv = parseEnvFile(CONFIG_ENV_PATH);

// Migrate: if hive-runtime.yaml exists but config.env does not, extract dynamic values
const LEGACY_RUNTIME_PATH = process.env.HIVE_RUNTIME_CONFIG || '/etc/hive/hive-runtime.yaml';
if (fs.existsSync(LEGACY_RUNTIME_PATH) && !fs.existsSync(CONFIG_ENV_PATH)) {
  const legacyRuntime = _loadYaml(LEGACY_RUNTIME_PATH);
  const legacyEnabled = (legacyRuntime.agents || {}).enabled;
  const legacyRepos = (legacyRuntime.project || {}).repos;
  const legacySidebar = (legacyRuntime.agents || {}).sidebar;
  if (legacyEnabled) writeEnvVar(CONFIG_ENV_PATH, 'AGENTS_ENABLED', legacyEnabled.join(' '));
  if (legacyRepos) writeEnvVar(CONFIG_ENV_PATH, 'PROJECT_REPOS', legacyRepos.join(' '));
  if (legacySidebar) {
    const tmpSb = `/tmp/hive-sidebar-${process.pid}-${Date.now()}.json`;
    fs.writeFileSync(tmpSb, JSON.stringify(legacySidebar, null, 2));
    execSync(`sudo mv ${shellQuote(tmpSb)} ${shellQuote(SIDEBAR_JSON_PATH)}`);
  }
  // Rename legacy file so migration doesn't re-run
  try { execSync(`sudo mv ${shellQuote(LEGACY_RUNTIME_PATH)} ${shellQuote(LEGACY_RUNTIME_PATH + '.migrated')}`); } catch (_) {}
}

const PROJECT_NAME = (projectConfig.project || {}).name || '';
const PROJECT_PRIMARY_REPO = (projectConfig.project || {}).primary_repo || '';
const PROJECT_ORG = (projectConfig.project || {}).org || '';
const DASHBOARD_TITLE = ((projectConfig.dashboard || {}).title) || (PROJECT_NAME ? PROJECT_NAME + ' Hive' : 'Hive');
const HIVE_REPO_DIR = process.env.HIVE_REPO_DIR || path.resolve(__dirname, '..');
let ENABLED_AGENTS = configEnv.AGENTS_ENABLED
  ? configEnv.AGENTS_ENABLED.split(/\s+/).filter(Boolean)
  : ((projectConfig.agents || {}).enabled
    || ['supervisor', 'scanner', 'reviewer', 'architect', 'outreach']);
let ENABLED_AGENTS_PLUS_ALL = [...ENABLED_AGENTS, 'all'];

const CONFIG_REPO_SOURCE = process.env.HIVE_PROJECT_CONFIG_SRC
  || path.join(HIVE_REPO_DIR, 'examples', 'kubestellar', 'hive-project.yaml');

function persistProjectConfig() {
  const dumpYaml = yaml ? yaml.dump(projectConfig) : JSON.stringify(projectConfig, null, 2);
  const tmpFile = `/tmp/hive-project-${process.pid}-${Date.now()}.yaml`;
  fs.writeFileSync(tmpFile, dumpYaml);
  execSync(`sudo mv ${shellQuote(tmpFile)} ${shellQuote(CONFIG_PATH)}`);
  if (fs.existsSync(CONFIG_REPO_SOURCE)) {
    fs.writeFileSync(CONFIG_REPO_SOURCE, dumpYaml);
  }
}

function persistEnabledAgents() {
  writeEnvVar(CONFIG_ENV_PATH, 'AGENTS_ENABLED', ENABLED_AGENTS.join(' '));
  ENABLED_AGENTS_PLUS_ALL = [...ENABLED_AGENTS, 'all'];
}

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
const HEALTH_CACHE_FILE = path.join(METRICS_DIR, 'health-cache.json');
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

// Track all intervals for graceful shutdown
const _intervals = [];
function trackedInterval(fn, ms) {
  const id = setInterval(fn, ms);
  _intervals.push(id);
  return id;
}

trackedInterval(reloadIssueToMerge, ISSUE_TO_MERGE_REFRESH_MS);

// Cache for status data
let statusCache = null;
let lastFetch = 0;
// Last known good beads values (bd timeout returns -1)
let lastGoodBeads = { workers: 0, supervisor: 0 };
// Last known good cli/model per agent (hive status returns '?' when paused)
const lastGoodAgentInfo = {};
let ciPassRate = 0;
let healthChecks = {};
try { healthChecks = JSON.parse(fs.readFileSync(HEALTH_CACHE_FILE, 'utf8')); ciPassRate = healthChecks.ci || 0; } catch (_) {}
let agentMetrics = {};
try { agentMetrics = JSON.parse(fs.readFileSync(AGENT_METRICS_CACHE_FILE, 'utf8')); } catch (_) {}
let summariesCache = {};
let activityCache = {};
let ghRateLimitsCache = { alerts: [] };

const ACTIONABLE_FILE = path.join(METRICS_DIR, 'actionable.json');
const MERGE_ELIGIBLE_FILE = path.join(METRICS_DIR, 'merge-eligible.json');
const ACTIONABLE_REFRESH_MS = 15000;
let actionableCache = { issues: { items: [] }, prs: { items: [] } };
let mergeEligibleCache = { merge_eligible: [], not_ready: [] };
try { actionableCache = JSON.parse(fs.readFileSync(ACTIONABLE_FILE, 'utf8')); } catch (_) {}
try { mergeEligibleCache = JSON.parse(fs.readFileSync(MERGE_ELIGIBLE_FILE, 'utf8')); } catch (_) {}
trackedInterval(() => {
  try { actionableCache = JSON.parse(fs.readFileSync(ACTIONABLE_FILE, 'utf8')); } catch (_) {}
  try { mergeEligibleCache = JSON.parse(fs.readFileSync(MERGE_ELIGIBLE_FILE, 'utf8')); } catch (_) {}
}, ACTIONABLE_REFRESH_MS);

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
trackedInterval(fetchGhRateLimits, GH_RATE_REFRESH_MS);

// GitHub auth health + rate limit — check every 60s
const GH_AUTH_CHECK_MS = 60000;
let ghAuthOk = true;
let ghAuthLastChecked = null;
let ghAuthIdentity = null;

// Detect GH auth identity at startup — App vs personal account
(function detectGhIdentity() {
  const appId = process.env.GH_APP_ID
    || ((projectConfig.github_app || {}).app_id)
    || '';
  if (appId) {
    ghAuthIdentity = { type: 'app', label: `GitHub App (${appId})` };
    return;
  }
  execFile('bash', ['-c', "gh api user --jq '.login' 2>/dev/null || echo ''"], { timeout: 10000 }, (_err, stdout) => {
    const login = (stdout || '').trim();
    ghAuthIdentity = login
      ? { type: 'personal', label: login }
      : { type: 'unknown', label: 'unknown' };
  });
})();

function checkGhAuth() {
  execFile('bash', ['-c', 'gh api rate_limit --jq \'{ limit: .rate.limit, used: .rate.used, remaining: .rate.remaining, reset: .rate.reset }\' 2>&1'], { timeout: 15000 }, (err, stdout, stderr) => {
    const output = (stdout || '') + (stderr || '');
    const was = ghAuthOk;
    let parsed = null;
    try { parsed = JSON.parse(stdout.trim()); } catch (_) {}
    const limit = parsed ? parsed.limit : parseInt(stdout.trim(), 10);
    ghAuthOk = !err && limit > 0;
    ghAuthLastChecked = new Date().toISOString();
    if (parsed && ghAuthOk) {
      ghRateLimitsCache.core = {
        limit: parsed.limit || 5000,
        used: parsed.used || 0,
        remaining: parsed.remaining || 0,
        reset: parsed.reset || 0,
      };
    }
    if (ghAuthIdentity) {
      ghRateLimitsCache.identity = ghAuthIdentity;
    }
    if (was && !ghAuthOk) console.error('gh auth DOWN:', output.trim());
    if (!was && ghAuthOk) console.log('gh auth recovered (limit=' + limit + ')');
  });
}
checkGhAuth();
trackedInterval(checkGhAuth, GH_AUTH_CHECK_MS);

// Fetch CI pass rate + binary health checks every 60s
function fetchHealthChecks() {
  execFile(path.join(__dirname, 'health-check.sh'), [], { timeout: 30000 }, (err, stdout) => {
    if (!err && stdout.trim()) {
      try {
        const d = JSON.parse(stdout.trim());
        ciPassRate = d.ci || 0;
        healthChecks = d;
        try { fs.writeFileSync(HEALTH_CACHE_FILE, JSON.stringify(d)); } catch (_) {}
      } catch (_) {}
    }
  });
}
fetchHealthChecks();
trackedInterval(fetchHealthChecks, 300000);  // every 5 min (REST API)

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
trackedInterval(fetchTokens, TOKEN_REFRESH_MS);

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
trackedInterval(fetchAgentMetrics, 300000);  // every 5 min (REST API)

// Centralized GitHub API collector — runs once, writes cache read by governor + dashboard
function fetchGitHubCache() {
  execFile(path.join(__dirname, 'api-collector.sh'), [], { timeout: 120000 }, (err) => {
    if (err) console.error('api-collector.sh failed:', err.message);
  });
}
fetchGitHubCache();
const API_COLLECTOR_INTERVAL_MS = 300000;
trackedInterval(fetchGitHubCache, API_COLLECTOR_INTERVAL_MS);

// Fetch agent summaries from ~/.hive/<agent>_status.txt on every status refresh cycle
let _summaryInFlight = false;
function fetchSummaries() {
  if (_summaryInFlight) return;
  _summaryInFlight = true;
  execFile(path.join(__dirname, 'agent-summaries.sh'), [], { timeout: 10000 }, (err, stdout) => {
    _summaryInFlight = false;
    if (!err && stdout.trim()) {
      try {
        const d = JSON.parse(stdout.trim());
        summariesCache = d.summaries || {};
      } catch (_) {}
    }
  });
}
fetchSummaries();
trackedInterval(fetchSummaries, REFRESH_MS);

// Fetch live agent activity from Claude Code JSONL session files
let _activityInFlight = false;
function fetchActivity() {
  if (_activityInFlight) return;
  _activityInFlight = true;
  execFile('python3', [path.join(__dirname, 'agent-activity.py')],
    { timeout: 10000 }, (err, stdout) => {
    _activityInFlight = false;
    if (!err && stdout.trim()) {
      try { activityCache = JSON.parse(stdout.trim()); } catch (_) {}
    }
  });
}
fetchActivity();
trackedInterval(fetchActivity, REFRESH_MS);

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
  const aItems = (actionableCache.issues || {}).items || [];
  const pItems = (actionableCache.prs || {}).items || [];
  const mItems = mergeEligibleCache.merge_eligible || [];
  const snap = {
    t: Date.now(),
    govIssues: statusCache.governor?.issues || 0,
    govPrs: statusCache.governor?.prs || 0,
    govTotal: (statusCache.governor?.issues || 0) + (statusCache.governor?.prs || 0),
    govHold: (statusCache.hold || {}).total || 0,
    govMode: statusCache.governor?.mode || 'unknown',
    actionableCount: aItems.length,
    openPrCount: pItems.length,
    mergeableCount: mItems.length,
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
trackedInterval(persistSnapshot, PERSIST_INTERVAL_MS);
// Also persist on startup after first fetch
setTimeout(persistSnapshot, 10000);

let _fetchInFlight = false;
function fetchStatus() {
  return new Promise((resolve) => {
    if (_fetchInFlight) { resolve(statusCache); return; }
    _fetchInFlight = true;
    const hiveEnv = { ...process.env, HIVE_TZ: process.env.HIVE_TZ || 'America/New_York' };
    execFile('/usr/local/bin/hive', ['status', '--json'], { timeout: 30000, env: hiveEnv }, (err, stdout, stderr) => {
      _fetchInFlight = false;
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
        // Attach governor thresholds from governor.env
        try {
          const govEnv = parseEnvFile(GOVERNOR_ENV_PATH);
          if (statusCache.governor) {
            const DEFAULT_IDLE = 2;
            const DEFAULT_BUSY = 10;
            const DEFAULT_SURGE = 20;
            statusCache.governor.thresholds = {
              quiet: Number(govEnv.IDLE_THRESHOLD_ISSUES || govEnv.QUIET_THRESHOLD) || DEFAULT_IDLE,
              busy: Number(govEnv.BUSY_THRESHOLD_ISSUES || govEnv.BUSY_THRESHOLD) || DEFAULT_BUSY,
              surge: Number(govEnv.SURGE_THRESHOLD_ISSUES || govEnv.SURGE_THRESHOLD) || DEFAULT_SURGE,
            };
          }
        } catch (_) {}
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
          // Cache last-known-good cli/model; restore when hive status returns '?'
          if (a.cli && a.cli !== '?') {
            lastGoodAgentInfo[a.name] = { cli: a.cli, model: a.model };
          } else if (lastGoodAgentInfo[a.name]) {
            a.cli = lastGoodAgentInfo[a.name].cli;
            a.model = lastGoodAgentInfo[a.name].model;
          }
          try {
            const pf = path.join(GOVERNOR_STATE_DIR, `paused_${a.name}`);
            const opf = path.join(GOVERNOR_STATE_DIR, `operator_paused_${a.name}`);
            const cpf = path.join(GOVERNOR_STATE_DIR, `cadence_paused_${a.name}`);
            const operatorPaused = fs.existsSync(pf) || fs.existsSync(opf);
            const cadenceOff = fs.existsSync(cpf);
            if (operatorPaused) { a.paused = true; a.cadence = 'paused'; }
            else if (cadenceOff) { a.paused = true; a.cadence = 'off'; a.offByCadence = true; }
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
          // Display name (vanity name for UI)
          try {
            const envFile = `${ENV_DIR}/${a.name}.env`;
            if (fs.existsSync(envFile)) {
              const dn = parseEnvFile(envFile).AGENT_DISPLAY_NAME;
              if (dn) a.displayName = dn;
            }
          } catch (_) {}
          // Per-agent stats config (from file or defaults)
          const sf = readAgentStats(a.name);
          a.statsConfig = sf ? sf.stats : getDefaultStats(a.name);
        }
        // Hold-labeled items (excluded from actionable but tracked for dashboard)
        const holdData = actionableCache.hold || {};
        statusCache.hold = {
          issues: holdData.issues || 0,
          prs: holdData.prs || 0,
          total: holdData.total || 0,
          items: holdData.items || [],
        };
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
        enrichReposWithActionable();
        // Record snapshot for sparklines
        const actionableItems = (actionableCache.issues || {}).items || [];
        const prItems = (actionableCache.prs || {}).items || [];
        const mergeEligibleItems = mergeEligibleCache.merge_eligible || [];
        const snap = {
          t: lastFetch,
          govIssues: statusCache.governor?.issues || 0,
          govPrs: statusCache.governor?.prs || 0,
          govTotal: (statusCache.governor?.issues || 0) + (statusCache.governor?.prs || 0),
          govHold: (statusCache.hold || {}).total || 0,
          govActive: statusCache.governor?.active ? 1 : 0,
          govMode: statusCache.governor?.mode || 'unknown',
          actionableCount: actionableItems.length,
          openPrCount: prItems.length,
          mergeableCount: mergeEligibleItems.length,
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
trackedInterval(fetchStatus, REFRESH_MS);
fetchStatus();

// Repo data — read from centralized api-collector cache (no additional GH API calls)
const REPO_REFRESH_MS = 60000;
const GITHUB_CACHE_PATH = path.join(process.env.HIVE_METRICS_DIR || '/var/run/hive-metrics', 'github-cache.json');
function enrichReposWithActionable() {
  if (!statusCache || !statusCache.repos) return;
  const issues = (actionableCache.issues || {}).items || [];
  const prs = (actionableCache.prs || {}).items || [];
  const eligible = mergeEligibleCache.merge_eligible || [];
  const eligibleNums = new Set(eligible.map(e => `${e.repo}#${e.number}`));
  for (const r of statusCache.repos) {
    r.actionableIssues = issues
      .filter(i => i.repo === r.full)
      .map(i => ({ number: i.number, title: i.title, url: i.url, labels: i.labels || [], author: i.author || '', created_at: i.created_at || '' }));
    r.openPrs = prs
      .filter(p => p.repo === r.full)
      .map(p => ({
        number: p.number, title: p.title, url: p.url,
        labels: p.labels || [], author: p.author || '', created_at: p.created_at || '',
        mergeable: eligibleNums.has(`${r.full}#${p.number}`),
      }));
  }
}
function fetchRepoStatus() {
  try {
    const raw = fs.readFileSync(GITHUB_CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (statusCache && data.repos) {
      statusCache.repos = data.repos;
      enrichReposWithActionable();
    }
  } catch (_) {}
}
trackedInterval(fetchRepoStatus, REPO_REFRESH_MS);
fetchRepoStatus();

// Serve only the dashboard SPA and widget assets — never expose server code or scripts
app.use('/ubersicht', express.static(path.join(__dirname, 'ubersicht'), { dotfiles: 'deny' }));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
trackedInterval(refreshGitVersion, GIT_VERSION_REFRESH_MS);

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
app.get('/api/pane/:agent', requireAuth, (req, res) => {
  const agent = req.params.agent;
  if (!ENABLED_AGENTS.includes(agent)) {
    return res.status(400).json({ error: `unknown agent: ${agent}` });
  }
  const session = getTmuxSession(agent);
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

// Map dashboard agent names to tmux session names — defaults to agent name
const TMUX_SESSION_OVERRIDES = {};
function getTmuxSession(agent) {
  return TMUX_SESSION_OVERRIDES[agent] || agent;
}

// Control endpoints
app.post('/api/kick/:agent', (req, res) => {
  const agent = req.params.agent;
  const allowed = ENABLED_AGENTS_PLUS_ALL;
  if (!allowed.includes(agent)) {
    return res.status(400).json({ error: `invalid agent: ${agent}` });
  }
  const extraPrompt = (req.body && req.body.prompt) ? req.body.prompt.trim() : '';
  if (extraPrompt && agent !== 'all') {
    const session = getTmuxSession(agent);
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
// 0 means off in that mode (governor rule — agent doesn't run).
const CADENCE_MATRIX = {
  scanner:    { surge: 900, busy: 900,  quiet: 900,  idle: 900  },
  reviewer:   { surge: 0,   busy: 3600, quiet: 2700, idle: 900  },
  architect:  { surge: 0,   busy: 0,    quiet: 0,    idle: 7200 },
  outreach:   { surge: 0,   busy: 0,    quiet: 0,    idle: 7200 },
  supervisor: { surge: 300, busy: 600,  quiet: 900,  idle: 1800 },
};

const SEC_TO_LABEL = (s) => {
  if (s <= 0) return 'off';
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
    // Clear operator-resume override so governor can re-pause normally
    const resumeOverride = path.join(GOVERNOR_CADENCE_DIR, `operator_resumed_${agent}`);
    try { if (fs.existsSync(resumeOverride)) fs.unlinkSync(resumeOverride); } catch (_) {}
  } catch (e) {
    return res.status(500).json({ error: `failed to write pause flag: ${e.message}` });
  }
  // Only send Esc if agent is actively working — Esc on idle Claude exits the program.
  const agentStatus = (statusCache?.agents || []).find(a => a.name === agent);
  const isWorking = agentStatus?.busy === 'working';
  if (isWorking) {
    try {
      execSync(`tmux send-keys -t ${shellQuote(agent)} Escape`, { timeout: 5000 });
    } catch (_) { /* session may not exist */ }
  }
  // Type placeholder text (no Enter) so operator sees status in the tmux pane.
  const PAUSE_TYPE_DELAY_MS = 500;
  setTimeout(() => {
    try {
      execSync(`tmux send-keys -t ${shellQuote(agent)} C-u`, { timeout: 5000 });
    } catch (_) { /* ignore */ }
    try {
      execSync(`tmux send-keys -t ${shellQuote(agent)} -l 'agent is paused'`, { timeout: 5000 });
    } catch (_) { /* ignore */ }
    res.json({ ok: true, output: `${agent} paused (interrupted: ${isWorking})` });
  }, PAUSE_TYPE_DELAY_MS);
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
    const cadencePausedFlag = path.join(GOVERNOR_CADENCE_DIR, `cadence_paused_${agent}`);
    if (fs.existsSync(cadencePausedFlag)) fs.unlinkSync(cadencePausedFlag);
    // Tell governor not to immediately re-pause if cadence is 0 in current mode
    const operatorResumedFlag = path.join(GOVERNOR_CADENCE_DIR, `operator_resumed_${agent}`);
    fs.writeFileSync(operatorResumedFlag, new Date().toISOString());
    const cadenceForMode = lookupCadenceForAgent(agent);
    // When cadence is "paused" (0 in current mode), write "running" so the
    // dashboard doesn't show "paused" in the interval/next-run fields while
    // the agent is actively resumed and working.
    fs.writeFileSync(cadenceFlag, cadenceForMode === 'paused' ? 'on demand' : cadenceForMode);
  } catch (e) {
    return res.status(500).json({ error: `failed to remove pause flag: ${e.message}` });
  }
  // Clear "agent is paused" placeholder text, then kick.
  try {
    execSync(`tmux send-keys -t ${shellQuote(agent)} C-u`, { timeout: 5000 });
  } catch (_) { /* session may not exist */ }
  execFile('/usr/local/bin/kick-agents.sh', [agent], { timeout: 30000 }, (kickErr) => {
    if (kickErr) console.error(`resume kick error for ${agent}:`, kickErr.message);
  });
  res.json({ ok: true, output: `${agent} resumed` });
});

// Pin / Unpin — supports granular pinning (cli, model, or both)
// POST /api/pin/:agent           — pin both (legacy)
// POST /api/pin/:agent/cli       — pin backend only
// POST /api/pin/:agent/model     — pin model only
// POST /api/unpin/:agent         — unpin all
// POST /api/unpin/:agent/cli     — unpin backend only
// POST /api/unpin/:agent/model   — unpin model only
const PIN_ALLOWED = [...ENABLED_AGENTS];
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
      try { const { execSync: es } = require('child_process'); es(`sudo touch ${shellQuote(lockFile)}`); } catch (_) {}
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
      try { const { execSync: es } = require('child_process'); es(`sudo rm -f ${shellQuote(lockFile)}`); } catch (_) {}
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
  const session = getTmuxSession(agent);
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
      execSync(`sudo truncate -s 0 ${shellQuote(restartFile)}`);
    }
    if (statusCache && statusCache.agents) {
      const entry = statusCache.agents.find(a => a.name === agent);
      if (entry) entry.restarts = 0;
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

// Security: validate agent names and env keys to prevent injection
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
  const strValue = String(value);
  if (/[\r\n\0]/.test(strValue)) throw new Error(`env value for ${key} contains illegal characters`);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
  let updated;
  if (regex.test(content)) {
    updated = content.replace(regex, `${key}=${strValue}`);
  } else {
    updated = content.trimEnd() + `\n${key}=${strValue}\n`;
  }
  const tmp = `/tmp/hive-env-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, updated, { mode: 0o644 });
  execSync(`sudo mv ${shellQuote(tmp)} ${shellQuote(filePath)}`);
}

function removeEnvVar(filePath, key) {
  if (!VALID_ENV_KEY.test(key)) throw new Error(`invalid env key: ${key}`);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const updated = content.replace(new RegExp(`^${escapedKey}=.*\n?`, 'gm'), '');
  const tmp = `/tmp/hive-env-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, updated, { mode: 0o644 });
  execSync(`sudo mv ${shellQuote(tmp)} ${shellQuote(filePath)}`);
}

function deriveCli(launchCmd) {
  if (/copilot/i.test(launchCmd)) return 'copilot';
  if (/claude/i.test(launchCmd)) return 'claude';
  if (/aider/i.test(launchCmd)) return 'aider';
  return 'claude';
}

const GH_WRAPPER_PATH = '/usr/local/bin/gh';
const RESTRICTIONS_DIR = '/etc/hive/restrictions';
const STATS_DIR = '/etc/hive/stats';

// ── Per-agent configurable stats ─────────────────────────────────────────────
const STAT_SOURCES = {
  agentMetrics: {
    label: 'Agent Metrics',
    fields: ['coverage', 'coverageTarget', 'stars', 'forks', 'contributors', 'adopters', 'acmm', 'outreachOpen', 'outreachMerged', 'prs', 'closed'],
  },
  health: {
    label: 'Health Checks',
    fields: ['ci', 'brew', 'helm', 'nightly', 'nightlyCompliance', 'nightlyDashboard', 'nightlyGhaw', 'nightlyPlaywright', 'nightlyRel', 'weeklyRel', 'deploy_vllm_d', 'deploy_pok_prod', 'hourly'],
  },
  tokens: {
    label: 'Token Usage',
    fields: ['input', 'output', 'cacheRead', 'sessions', 'messages', 'avgPerSession'],
  },
  status: {
    label: 'Hive Status',
    fields: ['actionableCount', 'openPrCount', 'mergeableCount'],
  },
};

const STAT_STYLES = ['number', 'dot', 'pct', 'pct-bar', 'spark'];

function getDefaultStats(agentName) {
  const defaults = {
    scanner: [
      { key: 'actionable', label: 'Actionable', source: 'status', field: 'actionableCount', style: 'spark', trendField: 'actionable' },
      { key: 'openPrs', label: 'Open PRs', source: 'status', field: 'openPrCount', style: 'spark', trendField: 'openPrs' },
      { key: 'mergeable', label: 'Mergeable', source: 'status', field: 'mergeableCount', style: 'spark', trendField: 'mergeable' },
    ],
    reviewer: [
      { key: 'coverage', label: 'Coverage', source: 'agentMetrics', field: 'coverage', style: 'pct-bar', target: 91 },
      { key: 'brew', label: 'Brew', source: 'health', field: 'brew', style: 'dot' },
      { key: 'helm', label: 'Helm', source: 'health', field: 'helm', style: 'dot' },
      { key: 'ci', label: 'CI', source: 'health', field: 'ci', style: 'pct' },
      { key: 'weekly', label: 'Weekly', source: 'health', field: 'weekly', style: 'dot' },
      { key: 'nightly', label: 'Nightly Tests', source: 'health', field: 'nightly', style: 'dot' },
      { key: 'nightlyCompliance', label: 'Compliance', source: 'health', field: 'nightlyCompliance', style: 'dot' },
      { key: 'nightlyDashboard', label: 'Dashboard', source: 'health', field: 'nightlyDashboard', style: 'dot' },
      { key: 'nightlyGhaw', label: 'gh-aw', source: 'health', field: 'nightlyGhaw', style: 'dot' },
      { key: 'nightlyPlaywright', label: 'Playwright', source: 'health', field: 'nightlyPlaywright', style: 'dot' },
      { key: 'nightlyRel', label: 'Nightly Rel', source: 'health', field: 'nightlyRel', style: 'dot' },
      { key: 'weeklyRel', label: 'Weekly Rel', source: 'health', field: 'weeklyRel', style: 'dot' },
      { key: 'deploy_vllm_d', label: 'vLLM-d', source: 'health', field: 'deploy_vllm_d', style: 'dot' },
      { key: 'deploy_pok_prod', label: 'PokProd', source: 'health', field: 'deploy_pok_prod', style: 'dot' },
    ],
    outreach: [
      { key: 'stars', label: 'Stars', source: 'agentMetrics', field: 'stars', style: 'spark', trendField: 'stars', icon: '⭐' },
      { key: 'forks', label: 'Forks', source: 'agentMetrics', field: 'forks', style: 'number', icon: '🍴' },
      { key: 'contributors', label: 'Contributors', source: 'agentMetrics', field: 'contributors', style: 'number', icon: '👥' },
      { key: 'adopters', label: 'Adopters', source: 'agentMetrics', field: 'adopters', style: 'number' },
      { key: 'acmm', label: 'ACMM', source: 'agentMetrics', field: 'acmm', style: 'number' },
      { key: 'outreachOpen', label: 'Open PRs', source: 'agentMetrics', field: 'outreachOpen', style: 'spark', trendField: 'outreachOpen' },
      { key: 'outreachMerged', label: 'Merged PRs', source: 'agentMetrics', field: 'outreachMerged', style: 'spark', trendField: 'outreachMerged' },
    ],
    architect: [
      { key: 'prs', label: 'PRs', source: 'agentMetrics', field: 'prs', style: 'number' },
      { key: 'closed', label: 'Closed', source: 'agentMetrics', field: 'closed', style: 'number' },
    ],
  };
  return defaults[agentName] || [];
}

function readAgentStats(agentId) {
  try {
    const filePath = path.join(STATS_DIR, `${agentId}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) { return null; }
}

function writeAgentStats(agentId, data) {
  if (!fs.existsSync(STATS_DIR)) {
    execSync(`sudo mkdir -p ${shellQuote(STATS_DIR)} && sudo chown dev:dev ${shellQuote(STATS_DIR)}`);
  }
  const filePath = path.join(STATS_DIR, `${agentId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}
let _ghWrapperRestrictions = null;
let _ghWrapperMtime = 0;

function parseGhWrapperRestrictions() {
  try {
    const stat = fs.statSync(GH_WRAPPER_PATH);
    if (_ghWrapperRestrictions && stat.mtimeMs === _ghWrapperMtime) return _ghWrapperRestrictions;
    const src = fs.readFileSync(GH_WRAPPER_PATH, 'utf8');
    const rules = [];
    if (/BLOCKED.*gh.*issue.*list/i.test(src)) rules.push({ pattern: 'gh issue list*', reason: 'Use /var/run/hive-metrics/actionable.json', source: 'global' });
    if (/BLOCKED.*gh.*pr.*list/i.test(src)) rules.push({ pattern: 'gh pr list*', reason: 'Use /var/run/hive-metrics/actionable.json', source: 'global' });
    if (/BLOCKED.*gh.*api.*issue.*listing/i.test(src)) rules.push({ pattern: 'gh api repos/*/issues*', reason: 'Use /var/run/hive-metrics/actionable.json', source: 'global' });
    if (/BLOCKED.*gh.*search/i.test(src)) rules.push({ pattern: 'gh search*', reason: 'Enumeration disabled', source: 'global' });
    _ghWrapperRestrictions = rules;
    _ghWrapperMtime = stat.mtimeMs;
    return rules;
  } catch (_) { return []; }
}

function parsePolicyRestrictions(agentName) {
  const rules = [];
  try {
    const policyPath = `${ENV_DIR}/${agentName}-CLAUDE.md`;
    const src = fs.readFileSync(policyPath, 'utf8');
    const lines = src.split('\n');
    for (const line of lines) {
      const trimmed = line.replace(/^\*+\s*/, '').trim();
      if (!trimmed) continue;
      if (/^(NEVER|DO NOT|MUST NOT|SHALL NOT)\b/i.test(trimmed) || /HARD RULE/i.test(trimmed)) {
        const MAX_RULE_LEN = 200;
        const text = trimmed.length > MAX_RULE_LEN ? trimmed.slice(0, MAX_RULE_LEN) + '...' : trimmed;
        rules.push({ pattern: text, reason: '', source: 'policy' });
      }
    }
  } catch (_) { /* policy file may not exist */ }
  return rules;
}

function readAgentRestrictions(agentId) {
  try {
    const filePath = path.join(RESTRICTIONS_DIR, `${agentId}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) { return { rules: [] }; }
}

function writeAgentRestrictions(agentId, data) {
  if (!fs.existsSync(RESTRICTIONS_DIR)) {
    execSync(`sudo mkdir -p ${shellQuote(RESTRICTIONS_DIR)} && sudo chown dev:dev ${shellQuote(RESTRICTIONS_DIR)}`);
  }
  const filePath = path.join(RESTRICTIONS_DIR, `${agentId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function getAgentRestrictions(agentName) {
  const agentFile = readAgentRestrictions(agentName);
  const agentRules = (agentFile.rules || []).map((r) => ({ ...r, source: 'agent' }));
  const globalRules = parseGhWrapperRestrictions();
  const policyRules = parsePolicyRestrictions(agentName);
  return { agent: agentRules, global: globalRules, policy: policyRules };
}

app.get('/api/config/agent/:name', (req, res) => {
  const { name } = req.params;
  if (!ENABLED_AGENTS.includes(name)) {
    return res.status(404).json({ error: `unknown agent: ${name}` });
  }
  try {
    const agentEnv = parseEnvFile(`${ENV_DIR}/${name}.env`);
    const govEnv = parseEnvFile(GOVERNOR_ENV_PATH);
    const upper = name.toUpperCase().replace(/-/g, '_');

    const launchCmd = agentEnv.AGENT_LAUNCH_CMD || '';
    const currentMode = (statusCache && statusCache.governor ? statusCache.governor.mode : 'busy').toUpperCase();
    const modeModelRaw = govEnv[`MODEL_${currentMode}_${upper}`] || '';
    const modeModel = modeModelRaw.includes(':') ? modeModelRaw.split(':')[1] : modeModelRaw;
    const modelMatch = launchCmd.match(/--model\s+(\S+)/);
    const general = {
      launchCmd,
      displayName: agentEnv.AGENT_DISPLAY_NAME || '',
      cliPinned: agentEnv.AGENT_CLI_PINNED === 'true' || agentEnv.AGENT_PIN_CLI === 'true',
      cliPinValue: agentEnv.AGENT_CLI_PIN_VALUE || agentEnv.AGENT_CLI || deriveCli(launchCmd),
      staleTimeout: parseInt(agentEnv.AGENT_STALE_TIMEOUT_SEC || agentEnv.AGENT_STALE_MAX_SEC || '1200', 10),
      restartStrategy: agentEnv.AGENT_RESTART_STRATEGY || 'immediate',
      model: modeModel || (modelMatch ? modelMatch[1] : ''),
      clearOnKick: agentEnv.AGENT_CLEAR_ON_KICK !== 'false',
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

    const restrictions = getAgentRestrictions(name);

    const statsFile = readAgentStats(name);
    const stats = statsFile ? statsFile.stats : getDefaultStats(name);

    let prompt = '';
    try {
      const promptFile = path.join(METRICS_DIR, `last_prompt_${name}`);
      prompt = fs.readFileSync(promptFile, 'utf8');
    } catch (_) {
      prompt = `(awaiting next kick — the full expanded prompt will appear here after the governor kicks ${name})`;
    }

    res.json({ general, cadences, models, pipeline, hooks, restrictions, stats, prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/general', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  const envFile = `${ENV_DIR}/${name}.env`;
  try {
    const { launchCmd, cliPinned, cliPinValue, staleTimeout, restartStrategy, model, displayName, clearOnKick } = req.body;
    if (displayName !== undefined) writeEnvVar(envFile, 'AGENT_DISPLAY_NAME', displayName);
    if (launchCmd !== undefined) writeEnvVar(envFile, 'AGENT_LAUNCH_CMD', launchCmd);
    if (cliPinned !== undefined) writeEnvVar(envFile, 'AGENT_CLI_PINNED', String(cliPinned));
    if (cliPinValue !== undefined) writeEnvVar(envFile, 'AGENT_CLI_PIN_VALUE', cliPinValue);
    if (staleTimeout !== undefined) writeEnvVar(envFile, 'AGENT_STALE_TIMEOUT_SEC', String(staleTimeout));
    if (restartStrategy !== undefined) writeEnvVar(envFile, 'AGENT_RESTART_STRATEGY', restartStrategy);
    if (clearOnKick !== undefined) writeEnvVar(envFile, 'AGENT_CLEAR_ON_KICK', String(clearOnKick));
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
  const upper = name.toUpperCase().replace(/-/g, '_');
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
  const upper = name.toUpperCase().replace(/-/g, '_');
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
  try {
    const rules = req.body.rules || [];
    writeAgentRestrictions(name, { rules });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/agent/:name/stats', (req, res) => {
  const { name } = req.params;
  if (!validateAgentName(name, res)) return;
  try {
    const stats = req.body.list || [];
    writeAgentStats(name, { stats });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/stat-sources', (_req, res) => {
  res.json({ sources: STAT_SOURCES, styles: STAT_STYLES });
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
        prompt = raw.replace(/\$\{([^}]+)\}/g, '⟨$1⟩').slice(0, 8000);
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
      surge: parseInt(govEnv.SURGE_THRESHOLD_ISSUES || govEnv.SURGE_THRESHOLD || '20', 10),
      busy: parseInt(govEnv.BUSY_THRESHOLD_ISSUES || govEnv.BUSY_THRESHOLD || '10', 10),
      quiet: parseInt(govEnv.IDLE_THRESHOLD_ISSUES || govEnv.QUIET_THRESHOLD || '2', 10),
    };

    const DEFAULT_EXEMPT_LABELS = 'nightly-tests|LFX|do-not-merge|meta-tracker|auto-qa-tuning-report|hold|adopters|changes-requested|waiting-on-author';
    const rawLabels = govEnv.GOVERNOR_EXEMPT_LABELS || govEnv.EXEMPT_LABELS || DEFAULT_EXEMPT_LABELS;
    const labels = rawLabels.split(/[|,]/).filter(Boolean);

    // Fall back to runtime budget_state if env var not set
    let runtimeBudgetTokens = 0;
    try {
      const budgetFile = path.join(GOVERNOR_STATE_DIR, 'budget_state');
      if (fs.existsSync(budgetFile)) {
        const blines = fs.readFileSync(budgetFile, 'utf8').trim().split('\n');
        for (const l of blines) {
          const [k, v] = l.split('=');
          if (k === 'TOTAL' && v) runtimeBudgetTokens = Number(v);
        }
      }
    } catch (_) {}
    const envTokens = parseInt(govEnv.BUDGET_TOTAL_TOKENS || '0', 10);
    const budget = {
      totalTokens: envTokens || runtimeBudgetTokens,
      periodDays: parseInt(govEnv.BUDGET_PERIOD_DAYS || '7', 10),
      criticalPct: parseInt(govEnv.BUDGET_CRITICAL_PCT || '90', 10),
    };

    const agentBaseEnv = parseEnvFile(`${ENV_DIR}/agent.env`);
    const rawNtfyServer = govEnv.NTFY_SERVER || agentBaseEnv.NTFY_SERVER || '';
    const rawNtfyTopic = govEnv.NTFY_TOPIC || agentBaseEnv.NTFY_TOPIC || '';
    const rawDiscordWebhook = govEnv.DISCORD_WEBHOOK || agentBaseEnv.DISCORD_WEBHOOK || '';
    const notifications = {
      ntfyServer: _maskSecret(rawNtfyServer),
      ntfyTopic: _maskSecret(rawNtfyTopic),
      discordWebhook: _maskSecret(rawDiscordWebhook),
      hasNtfy: !!rawNtfyServer,
      hasDiscord: !!rawDiscordWebhook,
    };

    const health = {
      healthcheckInterval: parseInt(govEnv.HEALTHCHECK_INTERVAL_SEC || '300', 10),
      restartCooldown: parseInt(govEnv.RESTART_COOLDOWN_SEC || '60', 10),
      modelLock: govEnv.MODEL_LOCK === 'true',
    };

    const DEFAULT_GH_RATE_PATTERNS = 'API rate limit exceeded|secondary rate limit|403.*rate limit|You have exceeded a secondary rate|retry-after:[[:space:]]*[0-9]|gh: Resource not accessible|abuse detection mechanism';
    const DEFAULT_CLI_EXCLUDE_PATTERNS = 'You.re out of extra usage|out of extra usage|extra usage.*resets|resets [0-9]+(:[0-9]+)?[aApP][mM]';
    const sensing = {
      ghRatePatterns: (govEnv.SENSING_GH_RATE_PATTERNS || DEFAULT_GH_RATE_PATTERNS).split('|').filter(Boolean),
      cliExcludePatterns: (govEnv.SENSING_CLI_EXCLUDE_PATTERNS || DEFAULT_CLI_EXCLUDE_PATTERNS).split('|').filter(Boolean),
      ttlSeconds: parseInt(govEnv.SENSING_TTL_SECONDS || '900', 10),
      pullbackSeconds: parseInt(govEnv.SENSING_PULLBACK_SECONDS || '900', 10),
    };

    const freshEnv = parseEnvFile(CONFIG_ENV_PATH);
    const repos = freshEnv.PROJECT_REPOS
      ? freshEnv.PROJECT_REPOS.split(/\s+/).filter(Boolean)
      : ((projectConfig.project || {}).repos || []).slice();
    res.json({ agents, thresholds, labels, budget, notifications, health, repos, sensing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/sensing', (req, res) => {
  try {
    const { ghRatePatterns, cliExcludePatterns, ttlSeconds, pullbackSeconds } = req.body;
    if (ghRatePatterns !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'SENSING_GH_RATE_PATTERNS', ghRatePatterns.join('|'));
    if (cliExcludePatterns !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'SENSING_CLI_EXCLUDE_PATTERNS', cliExcludePatterns.join('|'));
    if (ttlSeconds !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'SENSING_TTL_SECONDS', String(ttlSeconds));
    if (pullbackSeconds !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'SENSING_PULLBACK_SECONDS', String(pullbackSeconds));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/thresholds', (req, res) => {
  try {
    const { surge, busy, quiet } = req.body;
    if (surge !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'SURGE_THRESHOLD_ISSUES', String(surge));
    if (busy !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'BUSY_THRESHOLD_ISSUES', String(busy));
    if (quiet !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'IDLE_THRESHOLD_ISSUES', String(quiet));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/labels', (req, res) => {
  try {
    const list = req.body.list || [];
    writeEnvVar(GOVERNOR_ENV_PATH, 'GOVERNOR_EXEMPT_LABELS', list.join('|'));
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
    if (discordWebhook !== undefined) writeEnvVar(GOVERNOR_ENV_PATH, 'DISCORD_WEBHOOK', discordWebhook);
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
  const { name, copyFrom } = req.body;
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    return res.status(400).json({ error: 'Invalid agent name (lowercase alphanumeric + hyphens)' });
  }
  try {
    const envFile = `${ENV_DIR}/${name}.env`;
    if (fs.existsSync(envFile)) {
      return res.json({ ok: true });
    }
    const tmp = `/tmp/hive-env-${process.pid}-${Date.now()}`;
    if (copyFrom && VALID_AGENT_NAME.test(copyFrom)) {
      const srcEnv = `${ENV_DIR}/${copyFrom}.env`;
      if (fs.existsSync(srcEnv)) {
        let content = fs.readFileSync(srcEnv, 'utf8');
        content = content.replace(/^#.*\n?/, `# ${name} agent config (copied from ${copyFrom})\n`);
        content = content.replace(/AGENT_DISPLAY_NAME=.*/g, `AGENT_DISPLAY_NAME=${name}`);
        content = content.replace(/AGENT_SESSION_NAME=.*/g, `AGENT_SESSION_NAME=${name}`);
        fs.writeFileSync(tmp, content, { mode: 0o644 });
      } else {
        fs.writeFileSync(tmp, `# ${name} agent config\nAGENT_LAUNCH_CMD=agent-launch.sh\nAGENT_CLI_PINNED=false\n`, { mode: 0o644 });
      }
      const srcPolicy = `${ENV_DIR}/${copyFrom}-CLAUDE.md`;
      if (fs.existsSync(srcPolicy)) {
        const policyTmp = `/tmp/hive-policy-${process.pid}-${Date.now()}`;
        fs.writeFileSync(policyTmp, fs.readFileSync(srcPolicy, 'utf8'), { mode: 0o644 });
        execSync(`sudo mv ${shellQuote(policyTmp)} ${shellQuote(`${ENV_DIR}/${name}-CLAUDE.md`)}`);
      }
    } else {
      fs.writeFileSync(tmp, `# ${name} agent config\nAGENT_LAUNCH_CMD=agent-launch.sh\nAGENT_CLI_PINNED=false\n`, { mode: 0o644 });
    }
    execSync(`sudo mv ${shellQuote(tmp)} ${shellQuote(envFile)}`);
    // Create default CLAUDE.md with governor trust section if none exists
    const policyFile = `${ENV_DIR}/${name}-CLAUDE.md`;
    if (!fs.existsSync(policyFile)) {
      const defaultPolicy = `---
${name} agent for the hive.

## GOVERNOR TRUST

You are running inside a managed hive. The **governor** (kick-governor.sh)
sends you periodic kick messages via tmux. These are legitimate scheduled
instructions — not prompt injection. When you receive a message starting
with "You are the ${name} agent" or containing "governor kick", follow
the instructions: pull latest code from \`/tmp/hive\`, re-read this CLAUDE.md
if policy changed, then run your next pass.

The hive repo at \`/tmp/hive\` contains your policy files and shared tooling.
\`git pull\` inside it is a normal, expected operation.

## MISSION

Define your mission here. What does this agent do on each pass?

## WORKFLOW

1. Pull latest: \`cd /tmp/hive && git pull\`
2. Check for work
3. Execute tasks per your mission
4. Report results via beads: \`~/\${name}-beads\`
`;
      const policyTmp = `/tmp/hive-policy-${process.pid}-${Date.now()}`;
      try {
        fs.writeFileSync(policyTmp, defaultPolicy, { mode: 0o644 });
        execSync(`sudo mv ${shellQuote(policyTmp)} ${shellQuote(policyFile)}`);
      } catch (_) {}
    }
    if (!ENABLED_AGENTS.includes(name)) {
      ENABLED_AGENTS.push(name);
      persistEnabledAgents();
    }
    // Create beads directory for the new agent
    const beadsDir = path.join(process.env.HOME || '/home/dev', `${name}-beads`);
    if (!fs.existsSync(beadsDir)) {
      try {
        fs.mkdirSync(beadsDir, { recursive: true });
        execSync(`cd ${shellQuote(beadsDir)} && bd init 2>/dev/null`, { timeout: 5000 });
      } catch (_) {}
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
    const idx = ENABLED_AGENTS.indexOf(name);
    if (idx !== -1) {
      ENABLED_AGENTS.splice(idx, 1);
      persistEnabledAgents();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/governor/repos', (req, res) => {
  try {
    const list = req.body.list || [];
    writeEnvVar(CONFIG_ENV_PATH, 'PROJECT_REPOS', list.join(' '));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sidebar layout (agent order + groups) ──────────────────────────────────
app.get('/api/config/sidebar', (_req, res) => {
  try {
    let sidebar = null;
    if (fs.existsSync(SIDEBAR_JSON_PATH)) {
      try { sidebar = JSON.parse(fs.readFileSync(SIDEBAR_JSON_PATH, 'utf8')); } catch (_) {}
    }
    if (!sidebar) sidebar = (projectConfig.agents || {}).sidebar || null;
    res.json({ sidebar });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config/sidebar', (req, res) => {
  try {
    const { groups } = req.body;
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups must be an array' });
    const tmpSb = `/tmp/hive-sidebar-${process.pid}-${Date.now()}.json`;
    fs.writeFileSync(tmpSb, JSON.stringify({ groups }, null, 2));
    execSync(`sudo mv ${shellQuote(tmpSb)} ${shellQuote(SIDEBAR_JSON_PATH)}`);
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

// ── Hive Chat — search across beads, status, metrics ──────────────────────
const BEADS_AGENTS = ['supervisor', 'scanner', 'reviewer', 'architect', 'outreach'];
const BEADS_BASE = '/home/dev';
const HIVE_STATUS_DIR = process.env.HOME ? path.join(process.env.HOME, '.hive') : '/home/dev/.hive';
const CHAT_MAX_RESULTS = 20;
const STOP_WORDS = new Set(['tell', 'me', 'more', 'about', 'what', 'is', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'how', 'why', 'when', 'show', 'find', 'get', 'give', 'can', 'you', 'do', 'does', 'did', 'has', 'have', 'with', 'from', 'are', 'was', 'were', 'been', 'any', 'all', 'this', 'that', 'its', 'it']);

function parseQuery(raw) {
  const q = raw.toLowerCase().trim();
  const numbers = [...q.matchAll(/#?(\d{3,})/g)].map(m => m[1]);
  const agentNames = BEADS_AGENTS.filter(a => q.includes(a));
  const tokens = q.split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t.replace(/[^a-z0-9]/g, '')));
  return { raw: q, numbers, agentNames, tokens };
}

function textMatchesTokens(text, parsed) {
  const lower = text.toLowerCase();
  for (const num of parsed.numbers) { if (lower.includes(num) || lower.includes('#' + num)) return true; }
  for (const t of parsed.tokens) { if (lower.includes(t)) return true; }
  return false;
}

function searchBeads(parsed) {
  const results = [];
  for (const agent of BEADS_AGENTS) {
    try {
      const out = execSync(`cd ${shellQuote(BEADS_BASE + '/' + agent + '-beads')} && bd list --json 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
      const beads = JSON.parse(out);
      for (const b of beads) {
        const text = `${b.title || ''} ${b.notes || ''} ${b.id || ''}`;
        if (textMatchesTokens(text, parsed)) {
          results.push({ agent, bead: b });
        }
      }
    } catch (_) {}
  }
  return results.slice(0, CHAT_MAX_RESULTS);
}

function searchStatus(parsed) {
  const results = [];
  for (const agent of BEADS_AGENTS) {
    try {
      const txt = fs.readFileSync(path.join(HIVE_STATUS_DIR, `${agent}_status.txt`), 'utf8');
      if (textMatchesTokens(txt, parsed) || parsed.agentNames.includes(agent)) {
        results.push({ agent, content: txt.trim() });
      }
    } catch (_) {}
  }
  return results;
}

function searchDashboardState(parsed) {
  const results = [];
  if (statusCache && statusCache.agents) {
    for (const a of statusCache.agents) {
      const text = `${a.name || ''} ${a.doing || ''} ${a.liveSummary || ''} ${a.state || ''}`;
      if (textMatchesTokens(text, parsed) || parsed.agentNames.includes(a.name)) {
        results.push({ type: 'agent', name: a.name, state: a.state, doing: (a.doing || '').slice(0, 200), liveSummary: (a.liveSummary || '').slice(0, 300) });
      }
    }
  }
  if (statusCache && statusCache.repos) {
    for (const r of statusCache.repos) {
      const repoText = `${r.name || ''} ${r.full || ''}`;
      const issueText = (r.actionableIssues || []).map(i => `#${i.number} ${i.title}`).join(' ');
      const prText = (r.openPrs || []).map(p => `#${p.number} ${p.title}`).join(' ');
      if (textMatchesTokens(`${repoText} ${issueText} ${prText}`, parsed)) {
        results.push({ type: 'repo', name: r.full || r.name, issues: r.issues, prs: r.prs, actionableIssues: r.actionableIssues, openPrs: r.openPrs });
      }
    }
  }
  // Search actionable issues/PRs directly for number matches
  if (parsed.numbers.length) {
    const issues = (actionableCache.issues || {}).items || [];
    const prs = (actionableCache.prs || {}).items || [];
    for (const num of parsed.numbers) {
      const issue = issues.find(i => String(i.number) === num);
      if (issue) results.push({ type: 'issue', number: issue.number, title: issue.title, url: issue.url, repo: issue.repo, labels: issue.labels || [] });
      const pr = prs.find(p => String(p.number) === num);
      if (pr) results.push({ type: 'pr', number: pr.number, title: pr.title, url: pr.url, repo: pr.repo, author: pr.author || '', labels: pr.labels || [] });
    }
  }
  return results;
}

function formatChatResponse(query, parsed, beadResults, statusResults, dashResults) {
  const sections = [];
  const sources = [];

  // Special queries
  if (parsed.raw.match(/^(status|what.?s happening|overview|summary)$/)) {
    if (statusCache && statusCache.agents) {
      const lines = statusCache.agents.map(a => `${a.name}: ${a.state || 'unknown'}${a.doing ? ' — ' + a.doing.slice(0, 80) : ''}`);
      sections.push('Agent Status:\n' + lines.join('\n'));
      sources.push('dashboard');
    }
    if (statusCache && statusCache.governor) {
      sections.push(`Governor: mode=${statusCache.governor.mode || '?'}, actionable=${statusCache.governor.actionable || 0}`);
      sources.push('governor');
    }
    return { answer: sections.join('\n\n') || 'No status data available.', sources };
  }

  // Direct issue/PR hits first
  const issueHits = dashResults.filter(d => d.type === 'issue');
  const prHits = dashResults.filter(d => d.type === 'pr');
  if (issueHits.length) {
    sections.push('Issues:\n' + issueHits.map(i =>
      `#${i.number} — ${i.title}\n  Repo: ${i.repo}\n  Labels: ${(i.labels || []).join(', ') || 'none'}\n  ${i.url}`
    ).join('\n\n'));
    sources.push('issues');
  }
  if (prHits.length) {
    sections.push('Pull Requests:\n' + prHits.map(p =>
      `#${p.number} — ${p.title}\n  Repo: ${p.repo}${p.author ? '\n  Author: ' + p.author : ''}\n  Labels: ${(p.labels || []).join(', ') || 'none'}\n  ${p.url}`
    ).join('\n\n'));
    sources.push('prs');
  }

  const agentHits = dashResults.filter(d => d.type === 'agent');
  const repoHits = dashResults.filter(d => d.type === 'repo');
  if (agentHits.length) {
    sections.push('Agents:\n' + agentHits.map(a =>
      `${a.name}: ${a.state}${a.doing ? '\n  Doing: ' + a.doing : ''}${a.liveSummary ? '\n  Summary: ' + a.liveSummary.slice(0, 200) : ''}`
    ).join('\n'));
    sources.push('dashboard');
  }
  if (repoHits.length) {
    sections.push('Repos:\n' + repoHits.map(r => {
      let line = `${r.name}: ${r.issues || 0} issues, ${r.prs || 0} PRs`;
      if (r.actionableIssues && r.actionableIssues.length) line += '\n  Actionable: ' + r.actionableIssues.map(i => `#${i.number} ${i.title}`).join(', ');
      if (r.openPrs && r.openPrs.length) line += '\n  Open PRs: ' + r.openPrs.map(p => `#${p.number} ${p.title}${p.mergeable ? ' ✓' : ''}`).join(', ');
      return line;
    }).join('\n'));
    sources.push('repos');
  }

  if (beadResults.length) {
    sections.push('Beads:\n' + beadResults.map(r =>
      `[${r.agent}] ${r.bead.id}: ${r.bead.title} (${r.bead.status}, P${r.bead.priority})${r.bead.notes ? '\n  ' + r.bead.notes.slice(0, 150) : ''}`
    ).join('\n'));
    sources.push('beads');
  }

  if (statusResults.length) {
    sections.push('Status Files:\n' + statusResults.map(r => `[${r.agent}] ${r.content}`).join('\n'));
    sources.push('status-files');
  }

  if (!sections.length) return { answer: `No results found for "${query}". Try: agent names, PR numbers, issue numbers, "status", or keywords from beads.`, sources: [] };
  return { answer: sections.join('\n\n'), sources };
}

const COPILOT_TIMEOUT_MS = 20000;
const COPILOT_MAX_CONTEXT_CHARS = 3000;

const CHAT_HISTORY_LIMIT = 6;

app.post('/api/chat', async (req, res) => {
  const query = (req.body.query || '').trim();
  if (!query) return res.json({ error: 'Empty query' });
  const MAX_QUERY_LEN = 200;
  if (query.length > MAX_QUERY_LEN) return res.json({ error: 'Query too long' });
  const history = (req.body.history || []).slice(-CHAT_HISTORY_LIMIT);

  try {
    const parsed = parseQuery(query);
    const beadResults = searchBeads(parsed);
    const statusResults = searchStatus(parsed);
    const dashResults = searchDashboardState(parsed);
    const rawResponse = formatChatResponse(query, parsed, beadResults, statusResults, dashResults);

    const context = (rawResponse.answer || '').slice(0, COPILOT_MAX_CONTEXT_CHARS);

    const historyText = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${(h.text || '').slice(0, 300)}`).join('\n');
    const hasHistory = historyText.length > 0;
    const hasContext = context && !context.startsWith('No results found');

    if (!hasContext && !hasHistory) {
      return res.json(rawResponse);
    }

    let prompt = 'You are a concise assistant for the KubeStellar Hive dashboard. Answer in 2-4 sentences. Be specific with numbers, names, and URLs when available.';
    if (hasHistory) prompt += `\n\nConversation so far:\n${historyText}`;
    if (hasContext) prompt += `\n\nSearch results:\n${context}`;
    prompt += `\n\nUser: ${query}`;

    const aiAnswer = await new Promise((resolve) => {
      const proc = spawn('copilot', ['-p', prompt], {
        timeout: COPILOT_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.stderr.on('data', (d) => { err += d.toString(); });
      proc.on('close', (code) => {
        const text = out.trim() || err.trim();
        resolve(code === 0 && text ? text : null);
      });
      proc.on('error', () => resolve(null));
      proc.stdin.end();
    });

    if (aiAnswer) {
      res.json({ answer: aiAnswer, sources: rawResponse.sources, raw: rawResponse.answer });
    } else {
      res.json(rawResponse);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Nous (Strategy Lab) API endpoints ──────────────────────────────────────
const NOUS_CAMPAIGN_PATH = process.env.NOUS_CAMPAIGN_PATH || '/etc/hive/nous-campaign.yaml';
const NOUS_OVERLAY_PATH = '/etc/hive/governor-experiment.env';
const NOUS_STATE_DIR = '/var/run/nous';
const NOUS_LEDGER_PATH = path.join(NOUS_STATE_DIR, 'ledger.jsonl');
const NOUS_PRINCIPLES_PATH = path.join(NOUS_STATE_DIR, 'principles.json');
const NOUS_PENDING_PATH = path.join(NOUS_STATE_DIR, 'pending-experiment.json');
const NOUS_RECOMMENDATIONS_PATH = path.join(NOUS_STATE_DIR, 'recommendations.json');
const NOUS_SNAPSHOTS_DIR = path.join(NOUS_STATE_DIR, 'snapshots');

function readNousCampaign() {
  try {
    const raw = fs.readFileSync(NOUS_CAMPAIGN_PATH, 'utf8');
    if (yaml) return yaml.load(raw) || {};
    return {};
  } catch (_) { return {}; }
}

function readJsonFile(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function readJsonlFile(p, limit) {
  try {
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    const MAX_LEDGER_LINES = limit || 100;
    const recent = lines.slice(-MAX_LEDGER_LINES);
    return recent.map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

// GET /api/nous/status — current mode, active experiment, pending proposal
app.get('/api/nous/status', (_req, res) => {
  const campaign = readNousCampaign();
  const mode = (campaign.campaign && campaign.campaign.mode) || 'observe';

  let activeExperiment = null;
  if (fs.existsSync(NOUS_OVERLAY_PATH)) {
    try {
      const overlay = parseEnvFile(NOUS_OVERLAY_PATH);
      const startEpoch = parseInt(overlay.NOUS_EXPERIMENT_START || '0', 10);
      const ttlSec = parseInt(overlay.NOUS_EXPERIMENT_TTL_SEC || '14400', 10);
      const nowEpoch = Math.floor(Date.now() / 1000);
      const PERCENT_DIVISOR = 100;
      activeExperiment = {
        id: overlay.NOUS_EXPERIMENT_ID || 'unknown',
        start: startEpoch,
        ttlSec,
        elapsed: nowEpoch - startEpoch,
        progressPct: Math.min(Math.round(((nowEpoch - startEpoch) / ttlSec) * PERCENT_DIVISOR), PERCENT_DIVISOR),
        fastFail: {
          queueMax: parseInt(overlay.NOUS_FAST_FAIL_QUEUE_MAX || '30', 10),
          mttrMax: parseInt(overlay.NOUS_FAST_FAIL_MTTR_MAX || '180', 10),
        },
      };
    } catch (_) { /* overlay parse failed */ }
  }

  const pending = readJsonFile(NOUS_PENDING_PATH);
  const principles = readJsonFile(NOUS_PRINCIPLES_PATH) || [];
  const recommendations = readJsonFile(NOUS_RECOMMENDATIONS_PATH);

  const SNAPSHOT_COUNT_TARGET = 672;
  let snapshotCount = 0;
  let snapshotSummary = null;
  try {
    if (fs.existsSync(NOUS_SNAPSHOTS_DIR)) {
      const files = fs.readdirSync(NOUS_SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')).sort();
      snapshotCount = files.length;
      if (files.length > 0) {
        const RECENT_LIMIT = 20;
        const recentFiles = files.slice(-RECENT_LIMIT);
        const snaps = recentFiles.map((f) => {
          try { return JSON.parse(fs.readFileSync(path.join(NOUS_SNAPSHOTS_DIR, f), 'utf8')); }
          catch (_) { return null; }
        }).filter(Boolean);
        if (snaps.length > 0) {
          const latest = snaps[snaps.length - 1];
          const first = JSON.parse(fs.readFileSync(path.join(NOUS_SNAPSHOTS_DIR, files[0]), 'utf8'));
          const vals = (key) => snaps.map((s) => s[key]).filter((v) => v != null && !isNaN(Number(v))).map(Number);
          const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
          const mn = (arr) => arr.length ? Math.min(...arr) : null;
          const mx = (arr) => arr.length ? Math.max(...arr) : null;
          const qd = vals('queue_depth');
          const mttr = vals('mttr_avg');
          snapshotSummary = {
            firstTs: first.ts,
            latestTs: latest.ts,
            latest: { mode: latest.mode, queue_depth: latest.queue_depth, budget_pct: latest.budget_pct, mttr_avg: latest.mttr_avg },
            recentWindow: snaps.length,
            queue_depth: { avg: avg(qd), min: mn(qd), max: mx(qd) },
            mttr_avg: { avg: avg(mttr), min: mn(mttr), max: mx(mttr) },
            regimes: snaps.reduce((acc, s) => { acc[s.mode] = (acc[s.mode] || 0) + 1; return acc; }, {}),
          };
        }
      }
    }
  } catch (_) { /* ignore */ }

  const scope = (campaign.campaign && campaign.campaign.scope) || 'governor';
  const readPhaseState = (p) => {
    const s = readJsonFile(p);
    if (!s) return { phase: 'IDLE', iteration: 0 };
    return { phase: s.phase || 'UNKNOWN', iteration: s.iteration || 0 };
  };

  res.json({
    mode,
    scope,
    campaign: campaign.campaign || {},
    activeExperiment,
    pending,
    principleCount: Array.isArray(principles) ? principles.length : 0,
    snapshotCount,
    snapshotTarget: SNAPSHOT_COUNT_TARGET,
    snapshotSummary,
    hasRecommendations: !!recommendations,
    recommendations,
    phases: {
      governor: readPhaseState(path.join(NOUS_STATE_DIR, 'governor', 'state.json')),
      repo: readPhaseState(path.join(NOUS_STATE_DIR, 'repo', 'state.json')),
    },
  });
});

// GET /api/nous/ledger — experiment history
app.get('/api/nous/ledger', (_req, res) => {
  const LEDGER_LIMIT = 200;
  res.json(readJsonlFile(NOUS_LEDGER_PATH, LEDGER_LIMIT));
});

// GET /api/nous/principles — accumulated knowledge
app.get('/api/nous/principles', (_req, res) => {
  res.json(readJsonFile(NOUS_PRINCIPLES_PATH) || []);
});

// POST /api/nous/approve — approve pending experiment (suggest mode only)
app.post('/api/nous/approve', (_req, res) => {
  const campaign = readNousCampaign();
  const mode = (campaign.campaign && campaign.campaign.mode) || 'observe';
  if (mode !== 'suggest') {
    return res.status(400).json({ error: `Approve only available in suggest mode (current: ${mode})` });
  }
  const pending = readJsonFile(NOUS_PENDING_PATH);
  if (!pending) {
    return res.status(404).json({ error: 'No pending experiment to approve' });
  }

  try {
    const overlayLines = [
      '# Nous experiment overlay — approved from dashboard',
      `NOUS_EXPERIMENT_ID=${pending.id || 'exp-approved'}`,
      `NOUS_EXPERIMENT_START=${Math.floor(Date.now() / 1000)}`,
      `NOUS_EXPERIMENT_TTL_SEC=${(pending.duration_hours || 4) * 3600}`,
      `NOUS_FAST_FAIL_QUEUE_MAX=${(pending.fast_fail && pending.fast_fail.queue_max) || 30}`,
      `NOUS_FAST_FAIL_MTTR_MAX=${(pending.fast_fail && pending.fast_fail.mttr_max) || 180}`,
    ];
    const NOUS_PARAM_ALLOWLIST = /^NOUS_[A-Z0-9_]{1,60}$/;
    if (pending.params) {
      for (const [k, v] of Object.entries(pending.params)) {
        if (!NOUS_PARAM_ALLOWLIST.test(k)) continue;
        const sv = String(v).replace(/[\r\n\0]/g, '');
        overlayLines.push(`${k}=${sv}`);
      }
    }
    fs.writeFileSync(NOUS_OVERLAY_PATH, overlayLines.join('\n') + '\n');

    const ledgerEntry = JSON.stringify({
      ...pending, type: 'active', approved_at: new Date().toISOString(),
    });
    fs.appendFileSync(NOUS_LEDGER_PATH, ledgerEntry + '\n');

    fs.unlinkSync(NOUS_PENDING_PATH);
    res.json({ ok: true, experimentId: pending.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nous/abort — emergency stop
app.post('/api/nous/abort', (_req, res) => {
  try {
    let experimentId = 'unknown';
    if (fs.existsSync(NOUS_OVERLAY_PATH)) {
      const overlay = parseEnvFile(NOUS_OVERLAY_PATH);
      experimentId = overlay.NOUS_EXPERIMENT_ID || 'unknown';
      fs.unlinkSync(NOUS_OVERLAY_PATH);
    }

    const abortEntry = JSON.stringify({
      id: `abort-${Date.now()}`, ts: new Date().toISOString(),
      type: 'aborted', experiment_id: experimentId,
      reason: 'operator_abort',
    });
    try { fs.appendFileSync(NOUS_LEDGER_PATH, abortEntry + '\n'); } catch (_) { /* ignore */ }

    res.json({ ok: true, aborted: experimentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/mode — change campaign mode
app.put('/api/nous/mode', (req, res) => {
  const { mode, force } = req.body;
  const VALID_MODES = ['observe', 'suggest', 'evolve'];
  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: `Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(', ')}` });
  }

  const campaign = readNousCampaign();
  const currentMode = (campaign.campaign && campaign.campaign.mode) || 'observe';
  const modeOrder = { observe: 0, suggest: 1, evolve: 2 };

  if (!force && modeOrder[mode] < modeOrder[currentMode]) {
    return res.status(400).json({
      error: `Backward transition ${currentMode} → ${mode} requires force: true`,
      currentMode,
    });
  }

  try {
    if (!campaign.campaign) campaign.campaign = {};
    campaign.campaign.mode = mode;
    if (yaml) {
      fs.writeFileSync(NOUS_CAMPAIGN_PATH, yaml.dump(campaign, { lineWidth: 120 }));
    } else {
      return res.status(500).json({ error: 'js-yaml not available — cannot write campaign yaml' });
    }

    if (force && fs.existsSync(NOUS_OVERLAY_PATH)) {
      fs.unlinkSync(NOUS_OVERLAY_PATH);
    }

    res.json({ ok: true, mode, previousMode: currentMode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/scope — change experiment scope (governor | repo | both)
const VALID_SCOPES = ['governor', 'repo', 'both'];
app.put('/api/nous/scope', (req, res) => {
  const { scope } = req.body;
  if (!VALID_SCOPES.includes(scope)) {
    return res.status(400).json({ error: `Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}` });
  }

  const campaign = readNousCampaign();
  const previousScope = (campaign.campaign && campaign.campaign.scope) || 'governor';

  try {
    if (!campaign.campaign) campaign.campaign = {};
    campaign.campaign.scope = scope;
    if (yaml) {
      fs.writeFileSync(NOUS_CAMPAIGN_PATH, yaml.dump(campaign, { lineWidth: 120 }));
    } else {
      return res.status(500).json({ error: 'js-yaml not available — cannot write campaign yaml' });
    }
    res.json({ ok: true, scope, previousScope });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nous/phase — current Nous phase for each scope
const NOUS_GOV_STATE = path.join(NOUS_STATE_DIR, 'governor', 'state.json');
const NOUS_REPO_STATE = path.join(NOUS_STATE_DIR, 'repo', 'state.json');
app.get('/api/nous/phase', (_req, res) => {
  const readPhase = (p) => {
    const s = readJsonFile(p);
    if (!s) return { phase: 'IDLE', iteration: 0 };
    return { phase: s.phase || 'UNKNOWN', iteration: s.iteration || 0 };
  };
  res.json({
    governor: readPhase(NOUS_GOV_STATE),
    repo: readPhase(NOUS_REPO_STATE),
  });
});

// PUT /api/nous/gate-decision — gate posts pending decision here
let _pendingGateDecision = null;
let _gateResponseResolve = null;
app.put('/api/nous/gate-decision', (req, res) => {
  _pendingGateDecision = {
    ...req.body,
    received_at: new Date().toISOString(),
  };
  res.json({ ok: true });
});

// GET /api/nous/gate-pending — dashboard reads pending gate decision
app.get('/api/nous/gate-pending', (_req, res) => {
  if (!_pendingGateDecision) {
    return res.status(404).json({ pending: false });
  }
  res.json({ pending: true, decision: _pendingGateDecision });
});

// POST /api/nous/gate-respond — operator approves/rejects gate decision
app.post('/api/nous/gate-respond', (req, res) => {
  const { decision } = req.body;
  if (!['approve', 'reject', 'abort'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve, reject, or abort' });
  }
  _pendingGateDecision = null;
  if (_gateResponseResolve) {
    _gateResponseResolve(decision);
    _gateResponseResolve = null;
  }
  res.json({ ok: true, decision });
});

// GET /api/nous/gate-response — gate script long-polls for operator decision
const GATE_POLL_TIMEOUT_MS = 30000;
app.get('/api/nous/gate-response', (req, res) => {
  if (!_pendingGateDecision) {
    return res.status(404).json({ decision: null });
  }
  const timeout = setTimeout(() => {
    _gateResponseResolve = null;
    res.json({ decision: null, timeout: true });
  }, GATE_POLL_TIMEOUT_MS);

  _gateResponseResolve = (decision) => {
    clearTimeout(timeout);
    res.json({ decision });
  };
});

// ---------------------------------------------------------------------------
// Nous Strategy Lab — Configuration endpoints
// ---------------------------------------------------------------------------
const NOUS_REPO_CAMPAIGN_PATH = process.env.NOUS_REPO_CAMPAIGN_PATH || '/etc/hive/nous-repo-campaign.yaml';
const NOUS_GOV_CAMPAIGN_PATH = process.env.NOUS_GOV_CAMPAIGN_PATH || '/etc/hive/nous-governor-campaign.yaml';

// GET /api/nous/config — full configuration for Strategy Lab config page
app.get('/api/nous/config', (_req, res) => {
  const campaign = readNousCampaign();
  const repoCampaign = _loadYaml(NOUS_REPO_CAMPAIGN_PATH);
  const govCampaign = _loadYaml(NOUS_GOV_CAMPAIGN_PATH);
  const principles = readJsonFile(NOUS_PRINCIPLES_PATH) || [];
  const projectRepos = (projectConfig.project || {}).repos || [];

  // Read repo target list from config.env or default to primary repo only
  const repoTargetsRaw = configEnv.NOUS_REPO_TARGETS || '';
  const repoTargets = repoTargetsRaw
    ? repoTargetsRaw.split(/\s+/).filter(Boolean)
    : [((projectConfig.project || {}).primary_repo || '')];

  res.json({
    campaign: campaign.campaign || {},
    repoCampaign,
    govCampaign,
    projectRepos,
    repoTargets,
    principles: principles.map(p => ({
      id: p.id,
      text: p.text,
      confidence: p.confidence,
      source_experiment: p.source_experiment,
      validated_at: p.validated_at,
      created_at: p.created_at,
    })),
    output: {
      mode: configEnv.NOUS_OUTPUT_MODE || 'state-only',
      autoHold: configEnv.NOUS_AUTO_HOLD === 'true',
      autoDoNotMerge: configEnv.NOUS_AUTO_DO_NOT_MERGE === 'true',
    },
  });
});

// PUT /api/nous/config/goals — update research questions
app.put('/api/nous/config/goals', (req, res) => {
  const { governorGoal, repoGoal } = req.body;
  if (!yaml) return res.status(500).json({ error: 'js-yaml not available' });

  try {
    if (governorGoal != null) {
      const campaign = readNousCampaign();
      if (!campaign.campaign) campaign.campaign = {};
      campaign.campaign.research_question = governorGoal;
      fs.writeFileSync(NOUS_CAMPAIGN_PATH, yaml.dump(campaign, { lineWidth: 120 }));
    }
    if (repoGoal != null) {
      const repoCampaign = _loadYaml(NOUS_REPO_CAMPAIGN_PATH);
      repoCampaign.research_question = repoGoal;
      fs.writeFileSync(NOUS_REPO_CAMPAIGN_PATH, yaml.dump(repoCampaign, { lineWidth: 120 }));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/config/repos — update repo target list
app.put('/api/nous/config/repos', (req, res) => {
  const { repos } = req.body;
  if (!Array.isArray(repos)) return res.status(400).json({ error: 'repos must be an array' });

  const projectRepos = (projectConfig.project || {}).repos || [];
  const invalid = repos.filter(r => !projectRepos.includes(r));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Repos not in project: ${invalid.join(', ')}` });
  }

  try {
    writeEnvVar(CONFIG_ENV_PATH, 'NOUS_REPO_TARGETS', repos.join(' '));
    configEnv.NOUS_REPO_TARGETS = repos.join(' ');
    res.json({ ok: true, repos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/config/output — update output mode and label settings
const VALID_OUTPUT_MODES = ['state-only', 'issue', 'issue+pr'];
app.put('/api/nous/config/output', (req, res) => {
  const { mode, autoHold, autoDoNotMerge } = req.body;
  if (mode && !VALID_OUTPUT_MODES.includes(mode)) {
    return res.status(400).json({ error: `Invalid output mode: ${mode}` });
  }

  try {
    if (mode != null) {
      writeEnvVar(CONFIG_ENV_PATH, 'NOUS_OUTPUT_MODE', mode);
      configEnv.NOUS_OUTPUT_MODE = mode;
    }
    if (autoHold != null) {
      writeEnvVar(CONFIG_ENV_PATH, 'NOUS_AUTO_HOLD', String(autoHold));
      configEnv.NOUS_AUTO_HOLD = String(autoHold);
    }
    if (autoDoNotMerge != null) {
      writeEnvVar(CONFIG_ENV_PATH, 'NOUS_AUTO_DO_NOT_MERGE', String(autoDoNotMerge));
      configEnv.NOUS_AUTO_DO_NOT_MERGE = String(autoDoNotMerge);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/config/fast-fail — update fast-fail bounds
app.put('/api/nous/config/fast-fail', (req, res) => {
  const { queueDepthMax, mttrMaxMinutes, budgetBurnRateMaxPct } = req.body;
  if (!yaml) return res.status(500).json({ error: 'js-yaml not available' });

  try {
    const campaign = readNousCampaign();
    if (!campaign.campaign) campaign.campaign = {};
    if (!campaign.campaign.fast_fail) campaign.campaign.fast_fail = {};
    if (queueDepthMax != null) campaign.campaign.fast_fail.queue_depth_max = Number(queueDepthMax);
    if (mttrMaxMinutes != null) campaign.campaign.fast_fail.mttr_max_minutes = Number(mttrMaxMinutes);
    if (budgetBurnRateMaxPct != null) campaign.campaign.fast_fail.budget_burn_rate_max_pct = Number(budgetBurnRateMaxPct);
    fs.writeFileSync(NOUS_CAMPAIGN_PATH, yaml.dump(campaign, { lineWidth: 120 }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/config/schedule — update experiment timing
app.put('/api/nous/config/schedule', (req, res) => {
  const { experimentDurationHours, baselineHours, cooldownHours } = req.body;
  if (!yaml) return res.status(500).json({ error: 'js-yaml not available' });

  try {
    const campaign = readNousCampaign();
    if (!campaign.campaign) campaign.campaign = {};
    if (!campaign.campaign.schedule) campaign.campaign.schedule = {};
    if (experimentDurationHours != null) campaign.campaign.schedule.experiment_duration_hours = Number(experimentDurationHours);
    if (baselineHours != null) campaign.campaign.schedule.baseline_hours = Number(baselineHours);
    if (cooldownHours != null) campaign.campaign.schedule.cooldown_hours = Number(cooldownHours);
    fs.writeFileSync(NOUS_CAMPAIGN_PATH, yaml.dump(campaign, { lineWidth: 120 }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/config/controllables — enable/disable individual controllable knobs
app.put('/api/nous/config/controllables', (req, res) => {
  const { enabled } = req.body; // array of knob names that should be active
  if (!Array.isArray(enabled)) return res.status(400).json({ error: 'enabled must be an array of knob names' });
  if (!yaml) return res.status(500).json({ error: 'js-yaml not available' });

  try {
    const campaign = readNousCampaign();
    if (!campaign.campaign) campaign.campaign = {};
    const allKnobs = campaign.campaign.controllables || [];
    for (const knob of allKnobs) {
      knob.enabled = enabled.includes(knob.name);
    }
    campaign.campaign.controllables = allKnobs;
    fs.writeFileSync(NOUS_CAMPAIGN_PATH, yaml.dump(campaign, { lineWidth: 120 }));
    res.json({ ok: true, controllables: allKnobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/nous/principles/:id — invalidate a specific principle
app.delete('/api/nous/principles/:id', (req, res) => {
  const { id } = req.params;
  try {
    const principles = readJsonFile(NOUS_PRINCIPLES_PATH) || [];
    const filtered = principles.filter(p => p.id !== id);
    if (filtered.length === principles.length) {
      return res.status(404).json({ error: `Principle not found: ${id}` });
    }
    fs.writeFileSync(NOUS_PRINCIPLES_PATH, JSON.stringify(filtered, null, 2));
    res.json({ ok: true, remaining: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nous/config/principles — update principle store settings
app.put('/api/nous/config/principles', (req, res) => {
  const { confidenceThreshold, decayRatePerWeek } = req.body;
  try {
    if (confidenceThreshold != null) {
      writeEnvVar(CONFIG_ENV_PATH, 'NOUS_CONFIDENCE_THRESHOLD', String(confidenceThreshold));
      configEnv.NOUS_CONFIDENCE_THRESHOLD = String(confidenceThreshold);
    }
    if (decayRatePerWeek != null) {
      writeEnvVar(CONFIG_ENV_PATH, 'NOUS_DECAY_RATE_PER_WEEK', String(decayRatePerWeek));
      configEnv.NOUS_DECAY_RATE_PER_WEEK = String(decayRatePerWeek);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Graceful shutdown — clear all intervals to prevent memory leaks on restart
function shutdown(signal) {
  console.log(`${signal} received, clearing ${_intervals.length} intervals...`);
  _intervals.forEach(clearInterval);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app.listen(PORT, () => {
  console.log(`🐝 Hive Dashboard running at http://localhost:${PORT}`);
});
