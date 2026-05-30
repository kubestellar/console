package prompts_test

import (
"strings"
"testing"

"github.com/kubestellar/console/pkg/stellar/prompts"
)

// The observer check prompt defines structural tokens that the observer loop
// parses to decide whether to surface a finding.  Changes to these tokens are
// breaking changes — these tests guard against accidental edits.

func TestObserverCheckContainsNothingToken(t *testing.T) {
if !strings.Contains(prompts.ObserverCheck, "NOTHING") {
t.Error("ObserverCheck prompt must contain the literal 'NOTHING' token")
}
}

func TestObserverCheckContainsSurfaceToken(t *testing.T) {
if !strings.Contains(prompts.ObserverCheck, "SURFACE:") {
t.Error("ObserverCheck prompt must contain the 'SURFACE:' token")
}
}

func TestWatchFollowThroughContainsFormatVerbs(t *testing.T) {
// WatchFollowThrough uses fmt.Sprintf — it must have enough %s verbs
verbs := strings.Count(prompts.WatchFollowThrough, "%s")
if verbs < 6 {
t.Errorf("WatchFollowThrough should have at least 6 %%s verbs (cluster/ns/kind/name/reason/state), got %d", verbs)
}
}

func TestWatchFollowThroughContainsResolutionTokens(t *testing.T) {
for _, token := range []string{"RESOLVED:", "UPDATE:", "UNCHANGED:"} {
if !strings.Contains(prompts.WatchFollowThrough, token) {
t.Errorf("WatchFollowThrough must contain the %q token", token)
}
}
}

func TestDigestIsNonEmpty(t *testing.T) {
if strings.TrimSpace(prompts.Digest) == "" {
t.Error("Digest prompt must not be empty")
}
}

func TestQuickAskMentionsWatchDirective(t *testing.T) {
if !strings.Contains(prompts.QuickAsk, "WATCH:") {
t.Error("QuickAsk prompt must describe the WATCH: directive so the caller can parse it")
}
}

func TestEventNarrationIsPersonFirstPerson(t *testing.T) {
// The EventNarration spec requires first-person voice cues
firstPerson := strings.Contains(prompts.EventNarration, "I noticed") ||
strings.Contains(prompts.EventNarration, "I'm seeing") ||
strings.Contains(prompts.EventNarration, "I am seeing") ||
strings.Contains(prompts.EventNarration, "I ")
if !firstPerson {
t.Error("EventNarration prompt must include first-person voice examples as per spec")
}
}

func TestMissionExecutionIsNonEmpty(t *testing.T) {
if strings.TrimSpace(prompts.MissionExecution) == "" {
t.Error("MissionExecution prompt must not be empty")
}
}

func TestProactiveNudgeContainsNothingToken(t *testing.T) {
if !strings.Contains(prompts.ProactiveNudge, "NOTHING") {
t.Error("ProactiveNudge prompt must contain 'NOTHING' as the no-op response")
}
}

func TestCatchUpIsNonEmpty(t *testing.T) {
if strings.TrimSpace(prompts.CatchUp) == "" {
t.Error("CatchUp prompt must not be empty")
}
}

func TestAllPromptsAreUnder2000Chars(t *testing.T) {
cases := map[string]string{
"QuickAsk":          prompts.QuickAsk,
"EventNarration":    prompts.EventNarration,
"Digest":            prompts.Digest,
"MissionExecution":  prompts.MissionExecution,
"ObserverCheck":     prompts.ObserverCheck,
"WatchFollowThrough": prompts.WatchFollowThrough,
"ProactiveNudge":    prompts.ProactiveNudge,
"CatchUp":           prompts.CatchUp,
}
for name, p := range cases {
if len(p) == 0 {
t.Errorf("%s: prompt is empty", name)
}
// Sanity upper bound — prompts should not accidentally include large blobs
if len(p) > 2000 {
t.Errorf("%s: prompt is unusually long (%d chars); check for accidental duplication", name, len(p))
}
}
}
