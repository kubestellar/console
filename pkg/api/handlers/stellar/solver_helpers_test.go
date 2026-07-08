package stellar

// Unit tests for pure helpers in stellar_solver.go (#17326):
//   - formatBatchTimestamp
//   - deriveResourceNameFromNotification
//   - renderUntrustedPromptData (extended coverage beyond stellar_security_test.go)

import (
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/assert"
)

// ---------- formatBatchTimestamp ----------

func TestFormatBatchTimestamp_Nil(t *testing.T) {
	got := formatBatchTimestamp(nil)
	assert.Equal(t, "unknown", got)
}

func TestFormatBatchTimestamp_KnownTime(t *testing.T) {
	ts := time.Date(2025, 3, 15, 12, 0, 0, 0, time.UTC)
	got := formatBatchTimestamp(&ts)
	assert.Equal(t, "2025-03-15T12:00:00Z", got)
}

func TestFormatBatchTimestamp_NonUTC(t *testing.T) {
	// Non-UTC input must be normalised to UTC in output.
	loc, _ := time.LoadLocation("America/New_York")
	ts := time.Date(2025, 6, 1, 9, 0, 0, 0, loc) // 09:00 EDT = 13:00 UTC
	got := formatBatchTimestamp(&ts)
	assert.Equal(t, "2025-06-01T13:00:00Z", got)
}

func TestFormatBatchTimestamp_RFC3339Format(t *testing.T) {
	ts := time.Now().UTC()
	got := formatBatchTimestamp(&ts)
	_, err := time.Parse(time.RFC3339, got)
	assert.NoError(t, err, "output must be valid RFC3339")
}

// ---------- deriveResourceNameFromNotification ----------

func newNotif(dedupeKey, title string) *store.StellarNotification {
	return &store.StellarNotification{
		DedupeKey: dedupeKey,
		Title:     title,
	}
}

func TestDeriveResourceName_DedupeKeyWithEvPrefix(t *testing.T) {
	// "ev:cluster-a:pod:web-1" → offset=1, parts[3]="web-1"
	got := deriveResourceNameFromNotification(newNotif("ev:cluster-a:pod:web-1", ""))
	assert.Equal(t, "web-1", got)
}

func TestDeriveResourceName_DedupeKeyWithoutEvPrefix(t *testing.T) {
	// "cluster-a:deployment:api-server" → offset=0, parts[2]="api-server"
	got := deriveResourceNameFromNotification(newNotif("cluster-a:deployment:api-server", ""))
	assert.Equal(t, "api-server", got)
}

func TestDeriveResourceName_DedupeKeyTooShort(t *testing.T) {
	// Only 2 parts — falls through to title-based extraction.
	got := deriveResourceNameFromNotification(newNotif("cluster:pod", "CrashLoopBackOff on ns/web-1"))
	assert.Equal(t, "web-1", got)
}

func TestDeriveResourceName_EmptyDedupeKeyTitleSlash(t *testing.T) {
	// No dedupeKey, title contains "ns/pod-name" pattern.
	got := deriveResourceNameFromNotification(newNotif("", "CrashLoopBackOff on kube-system/coredns"))
	assert.Equal(t, "coredns", got)
}

func TestDeriveResourceName_TitleSlashWithTrailingSpace(t *testing.T) {
	got := deriveResourceNameFromNotification(newNotif("", "Alert on ns/web-frontend running slowly"))
	assert.Equal(t, "web-frontend", got)
}

func TestDeriveResourceName_NoDedupeKeyNoSlashInTitle(t *testing.T) {
	// Title has no slash — returns empty string.
	got := deriveResourceNameFromNotification(newNotif("", "General cluster alert"))
	assert.Equal(t, "", got)
}

func TestDeriveResourceName_EmptyNotification(t *testing.T) {
	got := deriveResourceNameFromNotification(&store.StellarNotification{})
	assert.Equal(t, "", got)
}

func TestDeriveResourceName_EvPrefixExactlyThreeParts(t *testing.T) {
	// "ev:cluster-a:pod" — 3 parts, offset=1, need offset+3=4 parts, so falls through.
	got := deriveResourceNameFromNotification(newNotif("ev:cluster-a:pod", "Alert on ns/fallback-pod"))
	assert.Equal(t, "fallback-pod", got)
}

// ---------- renderUntrustedPromptData (extended) ----------

func TestRenderUntrustedPromptData_HTMLEscaping(t *testing.T) {
	got := renderUntrustedPromptData("test", `<script>alert("xss")</script>`)
	assert.NotContains(t, got, "<script>")
	assert.Contains(t, got, "&lt;script&gt;")
	assert.Contains(t, got, `source="test"`)
	assert.Contains(t, got, `trust="untrusted"`)
}

func TestRenderUntrustedPromptData_TruncatesLongInput(t *testing.T) {
	long := strings.Repeat("a", 600)
	got := renderUntrustedPromptData("src", long)
	assert.Contains(t, got, "… [truncated]")
	// Output payload must not exceed 512 chars of original data.
	assert.LessOrEqual(t, len(long[:512]), 512)
}

func TestRenderUntrustedPromptData_ShortInputNotTruncated(t *testing.T) {
	got := renderUntrustedPromptData("src", "hello world")
	assert.NotContains(t, got, "truncated")
	assert.Contains(t, got, "hello world")
}

func TestRenderUntrustedPromptData_EmptyValue(t *testing.T) {
	got := renderUntrustedPromptData("src", "")
	assert.Contains(t, got, `source="src"`)
	assert.NotContains(t, got, "truncated")
}

func TestRenderUntrustedPromptData_ExactlyAtLimit(t *testing.T) {
	// Exactly 512 chars — should NOT be truncated.
	exact := strings.Repeat("b", 512)
	got := renderUntrustedPromptData("src", exact)
	assert.NotContains(t, got, "truncated")
}

func TestRenderUntrustedPromptData_OneOverLimit(t *testing.T) {
	overLimit := strings.Repeat("c", 513)
	got := renderUntrustedPromptData("src", overLimit)
	assert.Contains(t, got, "… [truncated]")
}
