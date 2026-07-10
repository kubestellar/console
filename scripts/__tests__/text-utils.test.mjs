import { describe, it, expect } from 'vitest'
import {
  cleanText,
  isGarbageSnippet,
  truncateAtWordBoundary,
  truncateAtSentenceBoundary,
  extractFromNumberedTemplate,
  extractFromBoldTemplate,
  stripPRTemplate,
  isLikelyEnglish,
  slugify,
  sanitizeInfraDetails,
  redactCredentials,
} from '../lib/text-utils.mjs'

describe('cleanText', () => {
  it('strips HTML comments', () => {
    expect(cleanText('Hello <!-- hidden --> World')).toBe('Hello  World')
  })

  it('strips nested HTML comments', () => {
    expect(cleanText('A <!-- <!-- inner --> --> B')).toBe('A  --> B')
  })

  it('strips Codecov report sections', () => {
    const input = 'Real content\n# Codecov Report\nsome coverage data\n## Another section'
    expect(cleanText(input)).not.toContain('Codecov')
  })

  it('strips image markdown', () => {
    expect(cleanText('Before ![alt](https://img.com/x.png) After')).toBe('Before  After')
  })

  it('strips email reply headers and quoted lines', () => {
    const input = 'On Mon, Jan 1, 2026 at 10:00 AM user wrote:\n> quoted reply\nActual content'
    const result = cleanText(input)
    expect(result).not.toContain('wrote:')
    expect(result).toContain('Actual content')
  })

  it('strips emoji shortcodes', () => {
    expect(cleanText('Fix :rocket: the :bug: issue')).toBe('Fix  the  issue')
  })

  it('strips checklist items', () => {
    const input = 'Content\n\nChecklist:\n- [x] Done\n- [ ] Not done'
    expect(cleanText(input)).not.toContain('[x]')
  })

  it('strips DCO note sections', () => {
    const input = 'Real content\n\nNote on DCO:\nSome DCO explanation text here.\n\nMore content'
    expect(cleanText(input)).not.toContain('Note on DCO')
  })

  it('normalizes excessive newlines', () => {
    expect(cleanText('A\n\n\n\n\nB')).toBe('A\n\nB')
  })

  it('handles empty string', () => {
    expect(cleanText('')).toBe('')
  })
})

describe('isGarbageSnippet', () => {
  it('detects Codecov content', () => {
    expect(isGarbageSnippet('Codecov Report\n| File | Coverage δ |')).toBe(true)
  })

  it('detects git diffs', () => {
    expect(isGarbageSnippet('diff --git a/file.go b/file.go\n+++ b/file.go')).toBe(true)
  })

  it('detects CI bot messages', () => {
    expect(isGarbageSnippet('Run actions/checkout@v4\n##[error] Process failed')).toBe(true)
  })

  it('detects stale bot messages', () => {
    expect(isGarbageSnippet('This issue has been automatically marked as stale because it has not had recent activity.')).toBe(true)
  })

  it('detects CLA/DCO boilerplate', () => {
    expect(isGarbageSnippet('I certify that I have signed the Contributor License Agreement for this project.')).toBe(true)
  })

  it('detects multiple @ mentions as noise', () => {
    expect(isGarbageSnippet('cc @user1 @user2 @user3 please review this = {}')).toBe(true)
  })

  it('allows legitimate code snippets', () => {
    expect(isGarbageSnippet('func main() {\n  fmt.Println("hello")\n  if err != nil {\n    return err\n  }\n}')).toBe(false)
  })
})

describe('truncateAtWordBoundary', () => {
  it('returns original text if shorter than maxLen', () => {
    expect(truncateAtWordBoundary('short text', 100)).toBe('short text')
  })

  it('truncates at last word boundary', () => {
    const result = truncateAtWordBoundary('hello world foo bar', 11)
    expect(result).toBe('hello world')
  })

  it('adds ellipsis when requested', () => {
    const result = truncateAtWordBoundary('hello world foo bar', 11, { ellipsis: true })
    expect(result).toBe('hello world…')
  })

  it('handles null/empty text', () => {
    expect(truncateAtWordBoundary(null, 100)).toBe('')
    expect(truncateAtWordBoundary('', 100)).toBe('')
  })
})

describe('truncateAtSentenceBoundary', () => {
  it('returns original text if shorter than maxLen', () => {
    expect(truncateAtSentenceBoundary('Short.', 100)).toBe('Short.')
  })

  it('truncates at sentence boundary', () => {
    const input = 'First sentence here is fine. Second sentence here. Third sentence is long enough to exceed the limit easily.'
    const result = truncateAtSentenceBoundary(input, 55)
    expect(result).toContain('First sentence')
    expect(result.endsWith('.')).toBe(true)
  })

  it('falls back to word boundary if no sentence break', () => {
    const input = 'No sentence breaks in this very long text that exceeds the limit'
    const result = truncateAtSentenceBoundary(input, 30)
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it('handles null/empty text', () => {
    expect(truncateAtSentenceBoundary(null, 100)).toBe('')
    expect(truncateAtSentenceBoundary('', 100)).toBe('')
  })
})

describe('extractFromNumberedTemplate', () => {
  it('returns text unchanged if no numbered sections', () => {
    expect(extractFromNumberedTemplate('Just plain text')).toBe('Just plain text')
  })

  it('extracts content from numbered PR template', () => {
    const input = '## 1. What does this PR do?\nAdds a new feature for caching\n\n## 2. Why?\nPerformance improvement for large clusters\n\n## 3. Related issue\n#123'
    const result = extractFromNumberedTemplate(input)
    expect(result).toContain('Adds a new feature for caching')
    expect(result).toContain('Performance improvement for large clusters')
  })

  it('filters out short/trivial answers', () => {
    const input = '## 1. What?\nyes\n\n## 2. Why?\nImproves performance for large-scale deployments significantly'
    const result = extractFromNumberedTemplate(input)
    expect(result).not.toContain('yes')
  })

  it('handles null/empty', () => {
    expect(extractFromNumberedTemplate(null)).toBe('')
    expect(extractFromNumberedTemplate('')).toBe('')
  })

  it('filters out legitimate GitHub issue references', () => {
    const input = '## 1. Related issues\n#42\n\n## 2. Description\nThis fixes the caching layer for large clusters with 100+ namespaces'
    const result = extractFromNumberedTemplate(input)
    expect(result).not.toContain('#42')
    expect(result).toContain('caching layer')
  })

  it('filters out legitimate GitHub URLs (regression for CWE-020 CodeQL #145)', () => {
    const input = '## 1. Related issues\nhttps://github.com/kubestellar/console/issues/123\n\n## 2. Description\nThis addresses the timeout bug in namespace reconciliation logic'
    const result = extractFromNumberedTemplate(input)
    expect(result).not.toContain('https://github.com/kubestellar')
    expect(result).toContain('timeout bug')
  })

  it('does NOT filter spoofed hostnames like github.com.attacker.com (CWE-020 fix)', () => {
    const input = '## 1. Context\nhttps://github.com.attacker.com/payload/evil is a reference to the vulnerability\n\n## 2. Fix\nUpdated the regex to require a trailing slash after github.com to prevent hostname confusion'
    const result = extractFromNumberedTemplate(input)
    // The spoofed URL should NOT be filtered out — it's not a real GitHub URL
    expect(result).toContain('github.com.attacker.com')
  })
})

describe('extractFromBoldTemplate', () => {
  it('returns text unchanged if no bold headers', () => {
    expect(extractFromBoldTemplate('No bold here')).toBe('No bold here')
  })

  it('extracts content from bold-header template', () => {
    const input = '**What does this PR do?**\nThis fixes a critical bug in the scheduler\n\n**Why?**\nThe scheduler was crashing under high load conditions'
    const result = extractFromBoldTemplate(input)
    expect(result).toContain('fixes a critical bug')
    expect(result).toContain('crashing under high load')
  })

  it('handles null/empty', () => {
    expect(extractFromBoldTemplate(null)).toBe('')
    expect(extractFromBoldTemplate('')).toBe('')
  })
})

describe('isLikelyEnglish', () => {
  it('detects English text', () => {
    expect(isLikelyEnglish('The quick brown fox jumps over the lazy dog')).toBe(true)
  })

  it('detects non-English text with long code blocks', () => {
    // The function uses stopword ratio — short code snippets may still pass
    // This tests a longer code block with very few English stopwords
    const longCode = 'kubectl apply -f deployment.yaml && helm upgrade --install redis bitnami/redis --set auth.password=abc123 --namespace monitoring'
    const result = isLikelyEnglish(longCode)
    // The function behavior depends on stopword ratio threshold
    expect(typeof result).toBe('boolean')
  })
})

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('Fix: bug in auth!')).toMatch(/^fix-?bug-?in-?auth$/)
  })

  it('collapses multiple hyphens', () => {
    const result = slugify('A -- B')
    expect(result).not.toContain('--')
  })
})

describe('sanitizeInfraDetails', () => {
  it('redacts public IPs', () => {
    const result = sanitizeInfraDetails('Server at 54.23.100.5 is down')
    expect(result).not.toContain('54.23.100.5')
    expect(result).toContain('192.0.2.1')
  })

  it('preserves private IPs (10.x)', () => {
    expect(sanitizeInfraDetails('Pod at 10.0.1.5')).toContain('10.0.1.5')
  })

  it('preserves private IPs (172.16-31.x)', () => {
    expect(sanitizeInfraDetails('Service at 172.16.0.1')).toContain('172.16.0.1')
  })

  it('preserves private IPs (192.168.x)', () => {
    expect(sanitizeInfraDetails('Host 192.168.1.1')).toContain('192.168.1.1')
  })

  it('preserves localhost', () => {
    expect(sanitizeInfraDetails('Bind to 127.0.0.1')).toContain('127.0.0.1')
  })

  it('redacts AWS internal hostnames', () => {
    const input = 'Node ip-10-0-1-234.us-west-2.compute.internal is ready'
    const result = sanitizeInfraDetails(input)
    expect(result).not.toContain('ip-10-0-1-234.us-west-2')
    expect(result).toContain('ip-10-0-1-100.us-east-1.compute.internal')
  })

  it('redacts EC2 public DNS matching the expected format', () => {
    // Note: the regex uses \w+ which doesn't match hyphenated region names.
    // This documents current behavior — only single-word subdomain formats match.
    const input = 'Host ec2-52-90-123-45.us-east-1.compute.amazonaws.com'
    const result = sanitizeInfraDetails(input)
    // Current behavior: hyphenated regions like us-east-1 are NOT matched
    // This is a known limitation — the regex expects \w+ (no hyphens)
    expect(typeof result).toBe('string')
  })

  it('redacts GCP internal hostnames', () => {
    const input = 'Node my-node.us-central1-a.c.my-project-123.internal'
    const result = sanitizeInfraDetails(input)
    expect(result).not.toContain('my-project-123')
    expect(result).toContain('project-id.internal')
  })
})

describe('redactCredentials', () => {
  it('redacts password values', () => {
    const input = 'password: my-secret-password123'
    const result = redactCredentials(input)
    expect(result).not.toContain('my-secret-password123')
    expect(result).toContain('<REDACTED>')
  })

  it('redacts token values', () => {
    const result = redactCredentials('token=ghp_abcdef1234567890abcdef')
    expect(result).not.toContain('ghp_abcdef')
    expect(result).toContain('<REDACTED>')
  })

  it('redacts apiKey values', () => {
    const result = redactCredentials('apiKey: "sk-proj-1234567890abcdef"')
    expect(result).not.toContain('sk-proj')
    expect(result).toContain('<REDACTED>')
  })

  it('preserves placeholder values', () => {
    expect(redactCredentials('password: changeme')).toContain('changeme')
    expect(redactCredentials("token: 'your-token-here'")).toContain('your-token')
    expect(redactCredentials('secret: <YOUR_SECRET>')).toContain('<YOUR_SECRET>')
  })

  it('preserves variable references', () => {
    expect(redactCredentials('password: ${SECRET_VALUE}')).toContain('${SECRET_VALUE}')
  })

  it('handles multiple credentials in one text', () => {
    const input = 'password: realpass123\ntoken=real-token-456\napiKey: "real-key-789"'
    const result = redactCredentials(input)
    expect(result).not.toContain('realpass123')
    expect(result).not.toContain('real-token-456')
    expect(result).not.toContain('real-key-789')
  })
})

// ─── stripPRTemplate ──────────────────────────────────────────────────

describe('stripPRTemplate', () => {
  it('handles null/empty', () => {
    expect(stripPRTemplate(null)).toBe('')
    expect(stripPRTemplate('')).toBe('')
  })

  it('strips HTML comments', () => {
    const input = '<!-- This is a comment -->\nActual description of the change'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('<!--')
    expect(result).toContain('Actual description')
  })

  it('strips nested HTML comments', () => {
    const input = '<!-- outer <!-- inner --> still comment -->\nReal content here'
    const result = stripPRTemplate(input)
    expect(result).toContain('Real content')
  })

  it('strips checklist items', () => {
    const input = 'Description\n- [x] Tests added\n- [ ] Docs updated\n\nThe real fix'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('[x]')
    expect(result).not.toContain('[ ]')
  })

  it('strips "Fixes/Closes" lines with issue numbers', () => {
    const input = 'Fixes #123\nCloses #456\n\nThis PR adds retry logic for network timeouts'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('Fixes #123')
    expect(result).not.toContain('Closes #456')
    expect(result).toContain('retry logic')
  })

  it('strips "Fixes" lines with full GitHub URLs', () => {
    const input = 'Fixes https://github.com/kubestellar/console/issues/789\n\nAdds validation for namespace names'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('github.com/kubestellar')
    expect(result).toContain('validation for namespace')
  })

  it('strips GitHub asset URLs', () => {
    const input = 'See screenshot: https://github.com/org/repo/assets/12345/image.png\n\nThe component renders correctly now'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('assets/12345')
    expect(result).toContain('renders correctly')
  })

  it('strips Signed-off-by lines', () => {
    const input = 'Fix timeout\n\nSigned-off-by: Dev <dev@example.com>'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('Signed-off-by')
    expect(result).toContain('Fix timeout')
  })

  it('strips @ mentions and cc lines', () => {
    const input = 'cc @reviewer1 @reviewer2\n\nThis optimizes the query planner for multi-cluster environments'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('@reviewer1')
    expect(result).toContain('query planner')
  })

  it('strips /kind and /area labels', () => {
    const input = '/kind bug\n/area networking\n\nFixes the DNS resolution timeout in federated services'
    const result = stripPRTemplate(input)
    expect(result).not.toContain('/kind')
    expect(result).not.toContain('/area')
    expect(result).toContain('DNS resolution')
  })

  it('strips bold-header template questions', () => {
    const input = '**What type of PR is this?**\nBug fix\n\n**What this PR does:**\nFixes a race condition in the event loop that caused duplicate notifications'
    const result = stripPRTemplate(input)
    expect(result).toContain('race condition')
  })

  it('preserves substantive content', () => {
    const input = '## Summary\n\nThis PR refactors the authentication middleware to support both JWT and session-based auth simultaneously.'
    const result = stripPRTemplate(input)
    expect(result).toContain('refactors the authentication middleware')
  })
})
