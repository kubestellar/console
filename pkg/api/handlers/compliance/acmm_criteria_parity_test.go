package compliance

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// netlifyCriteriaPath is the Netlify scan catalog that acmmCriteria mirrors,
// relative to this package directory.
var netlifyCriteriaPath = filepath.Join("..", "..", "..", "..", "web", "netlify", "functions", "acmm-scan", "criteria.ts")

var (
	// Each catalog entry sits on one line: `{ id: "...", ..., detection: { type: "...", pattern: <string | string[]> } },`.
	netlifyCriterionRe = regexp.MustCompile(`\{\s*id:\s*"([^"]+)".*\bpattern:\s*(\[[^\]]*\]|"[^"]*")`)
	quotedStringRe     = regexp.MustCompile(`"([^"]*)"`)
)

// parseNetlifyCriteria extracts criterion ID → detection patterns from criteria.ts.
func parseNetlifyCriteria(t *testing.T) map[string][]string {
	t.Helper()
	src, err := os.ReadFile(netlifyCriteriaPath)
	require.NoError(t, err)

	out := make(map[string][]string)
	for _, line := range strings.Split(string(src), "\n") {
		m := netlifyCriterionRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		var patterns []string
		for _, q := range quotedStringRe.FindAllStringSubmatch(m[2], -1) {
			patterns = append(patterns, q[1])
		}
		out[m[1]] = patterns
	}
	require.NotEmpty(t, out, "no criteria parsed from %s; did its entry format change?", netlifyCriteriaPath)
	return out
}

// goNetlifyKnownDrift lists criteria whose Go and Netlify definitions already
// disagreed when this parity test was added. Remove an ID once its two lists
// agree; the test fails if a listed ID no longer drifts, so this only shrinks.
var goNetlifyKnownDrift = map[string]bool{
	"acmm:quality-dashboard":         true,
	"acmm:nightly-compliance":        true,
	"acmm:multi-agent-orchestration": true,
	"acmm:risk-assessment-config":    true,
	"aef:task-traceability":          true,
	"aef:structural-gates":           true,
	"aef:session-continuity":         true,
	"aef:audit-trail":                true,
	"aef:change-classification":      true,
	"aef:component-fabric":           true, // present in Netlify only
}

// TestACMMCriteria_MatchNetlifyCatalog guards against the Go handler and the
// Netlify scan function detecting different things for the same criterion.
// Go cannot import the TypeScript catalog, so this compares the two lists.
func TestACMMCriteria_MatchNetlifyCatalog(t *testing.T) {
	netlify := parseNetlifyCriteria(t)

	goPatterns := make(map[string][]string, len(acmmCriteria))
	for _, c := range acmmCriteria {
		goPatterns[c.ID] = c.Patterns
	}
	ids := make(map[string]bool, len(netlify)+len(goPatterns))
	for id := range netlify {
		ids[id] = true
	}
	for id := range goPatterns {
		ids[id] = true
	}

	for id := range ids {
		want, inNetlify := netlify[id]
		got, inGo := goPatterns[id]
		inSync := inNetlify && inGo && assert.ObjectsAreEqual(want, got)
		if goNetlifyKnownDrift[id] {
			assert.Falsef(t, inSync, "%s now matches %s; remove it from goNetlifyKnownDrift", id, netlifyCriteriaPath)
			continue
		}
		assert.Truef(t, inNetlify, "Go criterion %s is missing from %s", id, netlifyCriteriaPath)
		assert.Truef(t, inGo, "Netlify criterion %s is missing from acmmCriteria in acmm_scan.go", id)
		if inNetlify && inGo {
			assert.Equalf(t, want, got, "patterns for %s differ between acmm_scan.go and %s", id, netlifyCriteriaPath)
		}
	}
}
