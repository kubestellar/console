import { describe, it, expect } from 'vitest'
import { generateWidgetCommand } from '../codeGenerator.utils'

describe('generateWidgetCommand shell injection safety', () => {
  it('escapes single quotes in curlUrl to prevent command injection', () => {
    const malicious = "http://example.com/'; rm -rf / #"
    const cmd = generateWidgetCommand('http://base.com', malicious)
    // The malicious quote should be escaped, not breaking out of the shell string
    expect(cmd).not.toContain("'; rm -rf /")
    expect(cmd).toContain("'\\''")
  })

  it('escapes single quotes in baseUrl', () => {
    const malicious = "http://evil'; cat /etc/passwd #"
    const cmd = generateWidgetCommand(malicious, 'http://safe.com/api')
    expect(cmd).not.toContain("'; cat /etc/passwd")
  })

  it('generates valid command for safe URLs', () => {
    const cmd = generateWidgetCommand('http://localhost:8080', 'http://localhost:8080/api/data')
    expect(cmd).toContain('/usr/bin/curl')
    expect(cmd).toContain('http://localhost:8080/api/data')
  })
})
