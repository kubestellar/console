#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'fs/promises';
import path, { join, relative, extname } from 'path';
import { parse as parseYaml } from 'yaml';
import { scoreMissionAdvanced, MIN_SCORE } from './advanced-quality-scorer.mjs';
// Companion: kubestellar/console#8148 exposes these index fields via /api/missions/scores.

const SOLUTIONS_DIR = join(process.cwd(), 'fixes');
const RUNBOOKS_DIR = join(process.cwd(), 'runbooks');
const INDEX_PATH = join(SOLUTIONS_DIR, 'index.json');

async function walkDir(dir) {
  const entries = [];
  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...await walkDir(fullPath));
    } else if (['.yaml', '.yml', '.json'].includes(extname(item.name).toLowerCase())) {
      if (item.name === 'index.json') continue;
      entries.push(fullPath);
    }
  }
  return entries;
}

function extractMetadata(content, filePath) {
  const relPath = relative(process.cwd(), filePath).split(path.sep).join('/');
  try {
    const data = filePath.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
    if (!data || (!data.title && !data.mission?.title)) return null;
    
    // Preserve category from mission file; fall back to path-based derivation
    const pathParts = relPath.split('/');
    const category = data.category || (pathParts.length > 1 ? pathParts[1] : 'general');

    // Determine missionClass: explicit field > path-based > default
    let missionClass = data.missionClass;
    if (!missionClass) {
      missionClass = category === 'cncf-install' ? 'install' : 'troubleshoot';
    }

    // Author: from mission JSON or default to bot
    const author = data.author || 'KubeStellar Bot';
    const authorGithub = data.authorGithub || 'kubestellar';
    
    const entry = {
      path: relPath,
      title: data.title || data.mission?.title || '',
      description: (data.description || data.mission?.description || '').slice(0, 200),
      category,
      missionClass,
      author,
      authorGithub,
      authorAvatar: `https://github.com/${authorGithub}.png`,
      tags: data.metadata?.tags || data.tags || [],
      cncfProjects: data.metadata?.cncfProjects || (data.metadata?.cncfProject ? [data.metadata.cncfProject] : []),
      targetResourceKinds: data.metadata?.targetResourceKinds || [],
      difficulty: data.metadata?.difficulty || 'intermediate',
      issueTypes: data.metadata?.issueTypes || extractIssueTypes(data),
      type: data.type || data.mission?.type || 'troubleshoot',
      installMethods: data.metadata?.installMethods || [],
    };

    // Include versioning metadata when present in the mission file
    if (data.metadata?.projectVersion) entry.projectVersion = data.metadata.projectVersion;
    if (data.metadata?.maturity) entry.maturity = data.metadata.maturity;
    
    // Evaluate advanced quality score.
    // Behavior: if the mission file explicitly sets metadata.qualityScore (hand-curated),
    // that value is preserved. Computed score is used only when no value is present.
    // This prevents index builds from silently overwriting intentionally curated scores.
    // See: kubestellar/console-kb PR #2019 description for rationale.
    const scoreResult = scoreMissionAdvanced(data, data.metadata?.cncfProjects?.[0] || category, relPath);
    const curatedScore = data.metadata?.qualityScore;
    entry.qualityScore = curatedScore != null ? curatedScore : scoreResult.score;
    entry.qualityPass = entry.qualityScore >= MIN_SCORE;
    entry.qualityBreakdown = scoreResult.breakdown;
    // Cap to 5 entries / 200 chars each — qualityIssues and qualitySuggestions live inside
    // index.json which is fetched by the frontend on every KB page load. Unbounded arrays
    // from low-quality missions can bloat the response significantly.
    const cap = (arr) => (arr || []).slice(0, 5).map(s => String(s).slice(0, 200));
    entry.qualityIssues = cap(scoreResult.issues);
    entry.qualitySuggestions = cap(scoreResult.suggestions);

    return entry;
  } catch (e) {
    console.warn(`Skipping ${relPath}: ${e.message}`);
    return null;
  }
}

function extractIssueTypes(data) {
  const types = [];
  const text = JSON.stringify(data).toLowerCase();
  const patterns = [
    ['CrashLoopBackOff', /crashloopbackoff/],
    ['OOMKilled', /oomkill/],
    ['ImagePullBackOff', /imagepullbackoff/],
    ['PodUnschedulable', /unschedulable/],
    ['NodeNotReady', /nodenotready|node.*not.*ready/],
    ['ServiceUnavailable', /service.*unavailable|503/],
    ['CertificateExpired', /certificate.*expir/],
    ['PersistentVolumeError', /pv.*error|volume.*fail/],
    ['NetworkPolicy', /network.*polic/],
    ['RBACDenied', /rbac.*denied|forbidden/],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) types.push(name);
  }
  return types;
}

export async function buildIndex(targetDir = SOLUTIONS_DIR) {
  // Walk both the fixes/ and runbooks/ directories
  let allFiles = await walkDir(targetDir);
  
  if (targetDir === SOLUTIONS_DIR) {
    const runbookFiles = await walkDir(RUNBOOKS_DIR).catch(() => {
      console.warn('No runbooks/ directory found — skipping.');
      return [];
    });
    allFiles = [...allFiles, ...runbookFiles];
  }
  const missions = [];

  for (const filePath of allFiles) {
    const content = await readFile(filePath, 'utf-8');
    const meta = extractMetadata(content, filePath);
    if (meta) missions.push(meta);
  }

  const index = {
    version: 1,
    count: missions.length,
    missions: missions.sort((a, b) => a.title.localeCompare(b.title)),
  };
  const targetIndexPath = targetDir === SOLUTIONS_DIR ? INDEX_PATH : join(targetDir, 'index.json');
  await writeFile(targetIndexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Generated index with ${missions.length} missions at ${targetIndexPath}`);
  return index;
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('build-index.mjs')) {
  buildIndex().catch(e => { console.error(e); process.exit(1); });
}
