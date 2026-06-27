/**
 * Mission scanner — self-contained security and schema validation module
 * for KubeStellar Console KB contributed missions.
 */

// ─── Schema validation ──────────────────────────────────────────────

const REQUIRED_FIELDS = ['version', 'name', 'mission'];
const VALID_VERSIONS = ['kc-mission-v1'];

/**
 * Validates that `data` conforms to the kc-mission-v1 export schema.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateMissionExport(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Input is not an object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (data.version && !VALID_VERSIONS.includes(data.version)) {
    errors.push(`Invalid version "${data.version}". Expected one of: ${VALID_VERSIONS.join(', ')}`);
  }

  if (data.name && typeof data.name !== 'string') {
    errors.push('"name" must be a string');
  }

  if (data.mission) {
    if (typeof data.mission !== 'object') {
      errors.push('"mission" must be an object');
    } else {
      if (!data.mission.title || typeof data.mission.title !== 'string') {
        errors.push('"mission.title" is required and must be a string');
      }
      if (!data.mission.steps || !Array.isArray(data.mission.steps)) {
        errors.push('"mission.steps" is required and must be an array');
      }
    }
  }

  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('"tags" must be an array');
  }

  if (data.compatibility) {
    if (typeof data.compatibility !== 'object') {
      errors.push('"compatibility" must be an object');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Sensitive data detection ────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  { name: 'IPv4 address', pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
  { name: 'IPv6 address', pattern: /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}/g },
  { name: 'JWT / Bearer token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'Bearer token header', pattern: /[Bb]earer\s+[A-Za-z0-9_\-.~+/]+=*/g },
  { name: 'GitHub PAT (classic)', pattern: /\bghp_[A-Za-z0-9]{36}\b/g },
  { name: 'GitHub PAT (fine-grained)', pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { name: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*\S+/gi },
  { name: 'PEM certificate / key', pattern: /-----BEGIN\s(?:RSA\s)?(?:PRIVATE\sKEY|CERTIFICATE|PUBLIC\sKEY)-----/g },
  { name: 'Generic secret assignment', pattern: /(?:password|secret|token|api_key|apikey)\s*[=:]\s*["'][^"']{8,}["']/gi },
  { name: 'Base64-encoded long blob', pattern: /\b[A-Za-z0-9+/]{64,}={0,2}\b/g },
];

// IPs to ignore (common examples / documentation ranges)
const SAFE_IPS = new Set([
  '0.0.0.0', '127.0.0.1', '255.255.255.255',
  '10.0.0.1', '192.168.1.1', '172.16.0.1',
]);

function deepStringValues(obj) {
  const values = [];
  const stack = [obj];
  while (stack.length) {
    const item = stack.pop();
    if (typeof item === 'string') {
      values.push(item);
    } else if (Array.isArray(item)) {
      stack.push(...item);
    } else if (item && typeof item === 'object') {
      stack.push(...Object.values(item));
    }
  }
  return values;
}

/**
 * Scans a parsed mission object for sensitive data (IPs, secrets, tokens, certs).
 * Returns { findings: Array<{ type, value, context }> }
 */
export function scanForSensitiveData(mission) {
  const findings = [];
  const text = deepStringValues(mission).join('\n');

  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      // Skip safe/example IPs
      if (name === 'IPv4 address' && SAFE_IPS.has(value)) continue;
      findings.push({
        type: name,
        value: value.length > 80 ? value.slice(0, 77) + '...' : value,
        context: text.substring(Math.max(0, match.index - 30), match.index + value.length + 30).trim(),
      });
    }
  }

  return { findings };
}

// ─── Malicious content detection ─────────────────────────────────────

const MALICIOUS_PATTERNS = [
  // XSS
  { name: 'XSS: script tag', pattern: /<script[\s>]/gi },
  { name: 'XSS: event handler', pattern: /\bon\w+\s*=\s*["']/gi },
  { name: 'XSS: javascript: URI', pattern: /javascript\s*:/gi },
  { name: 'XSS: data: URI', pattern: /data\s*:\s*text\/html/gi },
  { name: 'XSS: eval()', pattern: /\beval\s*\(/gi },
  { name: 'XSS: document.cookie', pattern: /document\.cookie/gi },
  { name: 'XSS: innerHTML', pattern: /\.innerHTML\s*=/gi },

  // Privileged Kubernetes YAML
  { name: 'Privileged container', pattern: /privileged\s*:\s*true/gi },
  { name: 'hostNetwork enabled', pattern: /hostNetwork\s*:\s*true/gi },
  { name: 'hostPID enabled', pattern: /hostPID\s*:\s*true/gi },
  { name: 'hostPath mount', pattern: /hostPath\s*:\s*\n?\s*path\s*:/gi },
  { name: 'hostPath reference', pattern: /hostPath\s*:/gi },

  // RBAC wildcards
  { name: 'RBAC wildcard resources', pattern: /resources\s*:\s*\[?\s*["']?\*["']?\s*\]?/gi },
  { name: 'RBAC wildcard verbs', pattern: /verbs\s*:\s*\[?\s*["']?\*["']?\s*\]?/gi },

  // Command injection (safe CLI tools like kubectl/helm/jq are allowlisted)
  // Use [^`\n] to avoid matching across line boundaries, which causes false positives
  // when markdown inline-code spans in natural-language descriptions happen to contain
  // ; or || somewhere between two backticks in the joined text.
  { name: 'Command injection: backtick', pattern: /`[^`\n]*(?:\$\(|;|&&|\|\|)[^`\n]*`/g, allowSafeCLI: true },
  { name: 'Command injection: $() in string', pattern: /\$\([^)]{4,}\)/g, allowSafeCLI: true },
  { name: 'Suspicious curl pipe', pattern: /curl\s[^|]*\|\s*(?:ba)?sh/gi },
  { name: 'Suspicious wget pipe', pattern: /wget\s[^|]*\|\s*(?:ba)?sh/gi },
  // env / xargs / find shell-interpreter escapes
  // `env bash -c '...'` bypasses binary allowlists even when shell:false is set.
  { name: 'Allowlist escape via env', pattern: /\benv\s+(?:-\S+\s+)*(?:bash|sh|zsh|ksh|dash|python\d*|ruby|perl|node)\b/gi },
  { name: 'Allowlist escape via xargs', pattern: /\bxargs\s+(?:-\S+\s+)*(?:bash|sh|zsh|ksh|dash)\b/gi },
  { name: 'Allowlist escape via find -exec', pattern: /\bfind\s[^;]*-exec\s+(?:bash|sh|zsh|ksh|dash)\b/gi },

  // Obfuscation bypass techniques (issue #2693)
  // Base64 decode piped to shell execution
  { name: 'Obfuscation: base64 decode pipe to shell', pattern: /\b(?:base64|openssl\s+(?:enc|base64))\s+(?:-d|-D|--decode)[^|]*\|\s*(?:ba)?sh\b/gi },
  { name: 'Obfuscation: echo base64 pipe', pattern: /\becho\s+[^|]*\|\s*base64\s+(?:-d|-D|--decode)[^|]*\|\s*(?:ba)?sh\b/gi },
  // Printf with escape sequences piped to shell
  { name: 'Obfuscation: printf escape sequences', pattern: /\bprintf\s+["'][^"']*\\x[0-9a-fA-F]{2}[^"']*["'][^|]*\|\s*(?:ba)?sh\b/gi },
  // Shell variable construction of interpreter names (e.g., VAR=ba; ${VAR}sh or $VARsh)
  { name: 'Obfuscation: variable shell interpreter', pattern: /(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)(?:bash|sh|zsh|ksh|dash)\b/g },
  { name: 'Obfuscation: concatenated interpreter name', pattern: /["'](?:ba|z|k|da)?["']\s*\+\s*["']sh["']/gi },

  // Crypto mining indicators
  { name: 'Crypto miner reference', pattern: /\b(?:xmrig|cryptonight|stratum\+tcp|minerd|coinhive)\b/gi },
];

// Safe CLI commands that are expected inside $() in mission code snippets.
// Shell interpreters (bash, sh, zsh, ksh) are intentionally excluded: they accept
// a -c flag and can execute arbitrary strings, which would defeat injection detection.
// Fenced code blocks (```bash, ```sh, etc.) are already handled by CODE_FENCE_LANGS.
const SAFE_CLI_COMMANDS = new Set([
  'kubectl', 'helm', 'jq', 'awk', 'grep', 'sed', 'cut', 'tr', 'sort',
  'uniq', 'wc', 'head', 'tail', 'cat', 'echo', 'date', 'basename',
  'dirname', 'xargs', 'find', 'ls', 'yq', 'kustomize', 'istioctl',
  'age', 'sops', 'systemd-run',  // encryption/secret management tools in CNCF docs
]);

// Markdown code fence language identifiers — these appear after backticks
// in fenced code blocks and are not commands.
const CODE_FENCE_LANGS = new Set([
  'yaml', 'yml', 'json', 'console', 'bash', 'sh', 'shell', 'zsh',
  'powershell', 'ps1', 'python', 'py', 'go', 'javascript', 'js',
  'typescript', 'ts', 'ruby', 'java', 'c', 'cpp', 'rust', 'toml',
  'ini', 'xml', 'html', 'css', 'sql', 'dockerfile', 'makefile',
  'text', 'plain', 'diff', 'log', 'output',
]);

/**
 * Checks if a matched string only contains safe CLI tool invocations.
 * Returns true if the match should be skipped (is safe).
 */
function isSafeCLIMatch(value) {
  // Extract content inside $(...) blocks
  const subshells = [...value.matchAll(/\$\(([^)]+)\)/g)].map(m => m[1].trim());
  if (subshells.length === 0) {
    // For backtick pattern: check all command invocations
    // Remove backticks and normalize whitespace (handles multi-line code blocks)
    const content = value.replace(/^`|`$/g, '').trim();

    // If the content starts with a markdown code fence language identifier
    // followed by a newline, it's a fenced code block — not injection.
    const firstLine = content.split(/\n/)[0].trim().toLowerCase();
    if (CODE_FENCE_LANGS.has(firstLine)) return true;
    
    // Split by command separators (; && ||) to get individual commands
    const segments = content.split(/[\s]*(?:;|&&|\|\|)[\s]*/).map(s => s.trim()).filter(Boolean);
    
    return segments.every(seg => {
      // Extract the first word/command from each segment
      // Handle potential bash redirects and arguments
      const firstWord = seg.split(/[\s\|>]+/)[0].trim();
      // Empty segments are safe (can happen with extra separators)
      return !firstWord || SAFE_CLI_COMMANDS.has(firstWord);
    });
  }
  
  // For $() subshells — skip PowerShell variable access patterns like $variable.Property
  return subshells.every(inner => {
    // PowerShell $variable or $variable.Property is not command injection
    if (/^\$\w+/.test(inner)) return true;

    // Split by command separators to get all commands in the pipeline
    const segments = inner.split(/[\s]*(?:;|&&|\|\|)[\s]*/).map(s => s.trim()).filter(Boolean);
    return segments.every(seg => {
      // Extract the first word from each segment
      const firstWord = seg.split(/[\s\|>]+/)[0].trim();
      return !firstWord || SAFE_CLI_COMMANDS.has(firstWord);
    });
  });
}

/**
 * Decodes base64 content and scans for malicious patterns.
 * Returns findings from decoded content.
 */
function scanBase64DecodedContent(text) {
  const findings = [];
  // Find base64-like strings that might contain encoded commands
  const base64Pattern = /\b[A-Za-z0-9+/]{20,}={0,2}\b/g;
  let match;
  
  while ((match = base64Pattern.exec(text)) !== null) {
    try {
      const decoded = Buffer.from(match[0], 'base64').toString('utf-8');
      // Check if decoded content contains shell commands or suspicious patterns
      const suspiciousPatterns = [
        /\b(?:curl|wget|bash|sh|eval|exec|nc|netcat|chmod|chown)\b/gi,
        /\$\([^)]+\)/g,
        /`[^`]+`/g,
      ];
      
      for (const pattern of suspiciousPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(decoded)) {
          findings.push({
            type: 'Obfuscation: base64-encoded command',
            value: `${match[0].slice(0, 40)}... → ${decoded.slice(0, 60)}...`,
            context: text.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30).trim(),
          });
          break;
        }
      }
    } catch {
      // Not valid base64 or not UTF-8 — ignore
    }
  }
  
  return findings;
}

/**
 * Scans a parsed mission object for malicious content (XSS, privileged YAML, injection).
 * Returns { findings: Array<{ type, value, context }> }
 */
export function scanForMaliciousContent(mission) {
  const findings = [];
  const text = deepStringValues(mission).join('\n');

  for (const { name, pattern, allowSafeCLI } of MALICIOUS_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Skip safe CLI tool invocations in mission code snippets
      if (allowSafeCLI && isSafeCLIMatch(match[0])) continue;
      findings.push({
        type: name,
        value: match[0],
        context: text.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30).trim(),
      });
    }
  }

  // Add base64 decode + re-scan for mission fields that execute commands
  const base64Findings = scanBase64DecodedContent(text);
  findings.push(...base64Findings);

  return { findings };
}

/**
 * Runs both sensitive-data and malicious-content scans.
 * Returns { sensitive: {...}, malicious: {...} }
 */
export function fullScan(mission) {
  return {
    sensitive: scanForSensitiveData(mission),
    malicious: scanForMaliciousContent(mission),
  };
}

// ─── File-level scanning ─────────────────────────────────────────────

/**
 * Parses a JSON or YAML string, validates schema, and runs full scan.
 * Returns { parsed, schema, scan, error? }
 */
export function scanMissionFile(content) {
  let parsed;

  // Try JSON first, then YAML
  try {
    parsed = JSON.parse(content);
  } catch {
    try {
      // Dynamic import is messy in sync context; try simple YAML parse
      // For YAML support the caller should pre-parse or this falls back
      const yamlLike = tryParseYamlSimple(content);
      if (yamlLike) {
        parsed = yamlLike;
      } else {
        return { parsed: null, schema: null, scan: null, error: 'Failed to parse as JSON or YAML' };
      }
    } catch {
      return { parsed: null, schema: null, scan: null, error: 'Failed to parse as JSON or YAML' };
    }
  }

  const schema = validateMissionExport(parsed);
  const scan = fullScan(parsed);

  return { parsed, schema, scan, error: null };
}

/**
 * Minimal YAML-like parser for simple key-value documents.
 * For full YAML support, use the js-yaml package in the entry-point scripts.
 */
function tryParseYamlSimple(content) {
  // Only handle if it looks like YAML (has colons, no opening brace)
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) return null;
  if (!content.includes(':')) return null;

  try {
    // Try to import and use js-yaml if available
    // Dynamic import is async, so this is a best-effort sync approach
    // For production use, the caller should handle YAML parsing
    const lines = content.split('\n');
    const result = {};
    let currentKey = null;
    let currentValue = '';
    let indent = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        // Save previous key-value if exists
        if (currentKey !== null) {
          result[currentKey] = currentValue.trim() || null;
        }
        
        currentKey = trimmed.substring(0, colonIndex).trim();
        const afterColon = trimmed.substring(colonIndex + 1).trim();
        
        if (afterColon) {
          // Inline value
          currentValue = afterColon;
        } else {
          // Multi-line value
          currentValue = '';
        }
      } else if (currentKey !== null && line.startsWith('  ')) {
        // Continuation of multi-line value
        currentValue += (currentValue ? '\n' : '') + trimmed;
      }
    }
    
    // Save last key-value
    if (currentKey !== null) {
      result[currentKey] = currentValue.trim() || null;
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ─── Markdown formatting ─────────────────────────────────────────────

/**
 * Formats a scan result as a markdown section for PR comments.
 */
export function formatScanResultAsMarkdown(filename, result) {
  const lines = [];
  lines.push(`### 📄 \`${filename}\``);
  lines.push('');

  if (result.error) {
    lines.push(`❌ **Parse error:** ${result.error}`);
    return lines.join('\n');
  }

  // Schema validation
  if (result.schema.valid) {
    lines.push('✅ **Schema:** Valid kc-mission-v1');
  } else {
    lines.push('❌ **Schema errors:**');
    for (const err of result.schema.errors) {
      lines.push(`  - ${err}`);
    }
  }
  lines.push('');

  // Sensitive data
  const sensitiveCount = result.scan.sensitive.findings.length;
  if (sensitiveCount === 0) {
    lines.push('✅ **Sensitive data:** None detected');
  } else {
    lines.push(`⚠️ **Sensitive data:** ${sensitiveCount} finding(s)`);
    lines.push('');
    lines.push('| Type | Value |');
    lines.push('|------|-------|');
    for (const f of result.scan.sensitive.findings) {
      const escapedValue = f.value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, '\\`');
      lines.push(`| ${f.type} | \`${escapedValue}\` |`);
    }
  }
  lines.push('');

  // Malicious content
  const maliciousCount = result.scan.malicious.findings.length;
  if (maliciousCount === 0) {
    lines.push('✅ **Security:** No malicious content detected');
  } else {
    lines.push(`🚨 **Security:** ${maliciousCount} finding(s)`);
    lines.push('');
    lines.push('| Type | Match |');
    lines.push('|------|-------|');
    for (const f of result.scan.malicious.findings) {
      const escapedValue = f.value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, '\\`');
      lines.push(`| ${f.type} | \`${escapedValue}\` |`);
    }
  }

  return lines.join('\n');
}
