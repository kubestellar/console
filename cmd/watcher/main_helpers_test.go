package main

import (
	"regexp"
	"testing"

	"github.com/kubestellar/console/pkg/watcher"
)

// hexRevisionPattern matches lowercase hex strings, which is the format git
// and Go's VCS build-info stamping both use for commit hashes.
var hexRevisionPattern = regexp.MustCompile(`^[0-9a-f]+$`)

func TestGetBuildRevisionReturnsEmptyOrLowercaseHex(t *testing.T) {
	rev := getBuildRevision()

	if rev == "" {
		// Tarball / non-VCS builds have no embedded revision.
		return
	}
	if !hexRevisionPattern.MatchString(rev) {
		t.Fatalf("getBuildRevision() = %q, want empty or lowercase hex", rev)
	}
	if len(rev) < watcher.GitShortHashLen {
		t.Fatalf("getBuildRevision() = %q, want length >= %d", rev, watcher.GitShortHashLen)
	}
}

func TestResolveGitCommitShortReturnsEmptyOrBoundedLowercaseHex(t *testing.T) {
	assertValidShortCommit := func(t *testing.T, commit string) {
		t.Helper()

		if commit == "" {
			// No git binary, or the working directory isn't a checkout.
			return
		}
		if !hexRevisionPattern.MatchString(commit) {
			t.Fatalf("resolveGitCommitShort() = %q, want empty or lowercase hex", commit)
		}
		if len(commit) > watcher.GitShortHashLen {
			t.Fatalf("resolveGitCommitShort() = %q, want length <= %d", commit, watcher.GitShortHashLen)
		}
	}

	// Call twice in a row to smoke-test the 2s context.WithTimeout usage and
	// confirm no context leak or hang across repeated invocations.
	first := resolveGitCommitShort()
	assertValidShortCommit(t, first)

	second := resolveGitCommitShort()
	assertValidShortCommit(t, second)
}
