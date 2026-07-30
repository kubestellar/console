/**
 * KubeStellar Console: AI-Driven Bug Sweep
 * 
 * This script scans the codebase for common anti-patterns that lead to 
 * production crashes, such as missing array guards on cached data.
 * 
 * Part of the "AI-Driven Bug Discovery & Remediation Architect" Mentorship.
 */

const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '../web/src/components/cards');
const REPO_RULES_FILE = path.join(__dirname, '../CLAUDE.md');

// Anti-patterns to look for
const PATTERNS = [
  {
    name: 'Unsafe Array Map',
    regex: /[a-zA-Z0-9_]+\.map\(/,
    guardRegex: /\([a-zA-Z0-9_]+\s*\|\|\s*\[\]\)\.map\(/,
    message: 'Array .map() call missing (data || []) guard.'
  },
  {
    name: 'Unsafe Array Filter',
    regex: /[a-zA-Z0-9_]+\.filter\(/,
    guardRegex: /\([a-zA-Z0-9_]+\s*\|\|\s*\[\]\)\.filter\(/,
    message: 'Array .filter() call missing (data || []) guard.'
  }
];

function runSweep() {
  console.log('🚀 Starting KubeStellar AI Bug Sweep...');
  console.log('Rules source:', REPO_RULES_FILE);
  console.log('Target directory:', TARGET_DIR);
  console.log('-------------------------------------------');

  const files = getFiles(TARGET_DIR, '.tsx');
  let issuesFound = 0;

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      PATTERNS.forEach(pattern => {
        if (pattern.regex.test(line) && !pattern.guardRegex.test(line)) {
          // Additional check: is it a constant array or a variable?
          // For simplicity in this POC, we flag all .map() calls not using the guard pattern.
          
          // Skip common false positives like [...].map or Object.keys().map
          if (line.includes('Object.keys') || line.includes('Object.values') || line.includes('].map')) {
            return;
          }

          console.log(`[ISSUE] ${pattern.name} in ${path.relative(process.cwd(), file)}:${index + 1}`);
          console.log(`   Line: ${line.trim()}`);
          console.log(`   Rule: ${pattern.message}`);
          console.log('');
          issuesFound++;
        }
      });
    });
  });

  console.log('-------------------------------------------');
  console.log(`✅ Sweep complete. Found ${issuesFound} potential issues.`);
  
  if (issuesFound > 0) {
    console.log('Suggestion: Run an AI agent to validate these and propose fix PRs.');
  }
}

function getFiles(dir, ext) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.lstatSync(file);
    if (stat && stat.isSymbolicLink()) {
      return; // Skip symlinks to avoid infinite loops
    }
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file, ext));
    } else if (file.endsWith(ext)) {
      results.push(file);
    }
  });
  return results;
}

runSweep();
