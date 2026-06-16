package stellar

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/kubestellar/console/pkg/store"
)

func Test_estimateTokens(t *testing.T) {
	tests := []struct {
		name      string
		text      string
		wantMin   int
		wantMax   int
		wantExact int
	}{
		{
			name:      "empty string",
			text:      "",
			wantExact: 0,
		},
		{
			name:      "whitespace only",
			text:      "   ",
			wantExact: 0,
		},
		{
			name:    "short text",
			text:    "hello",
			wantMin: 1,
			wantMax: 3,
		},
		{
			name:    "typical prompt",
			text:    "What's happening in the cluster?",
			wantMin: 7,
			wantMax: 10,
		},
		{
			name:    "long text",
			text:    strings.Repeat("word ", 100),
			wantMin: 120,
			wantMax: 130,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := estimateTokens(tt.text)
			if tt.wantExact > 0 {
				assert.Equal(t, tt.wantExact, result)
			} else {
				assert.GreaterOrEqual(t, result, tt.wantMin)
				assert.LessOrEqual(t, result, tt.wantMax)
			}
		})
	}
}

func Test_firstOrUnknown(t *testing.T) {
	tests := []struct {
		name  string
		items []string
		want  string
	}{
		{
			name:  "empty slice",
			items: []string{},
			want:  "unknown",
		},
		{
			name:  "nil slice",
			items: nil,
			want:  "unknown",
		},
		{
			name:  "single item",
			items: []string{"first"},
			want:  "first",
		},
		{
			name:  "multiple items",
			items: []string{"first", "second", "third"},
			want:  "first",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := firstOrUnknown(tt.items)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_extractObservationSuggest(t *testing.T) {
	tests := []struct {
		name   string
		detail string
		want   string
	}{
		{
			name:   "valid suggest prefix",
			detail: "SUGGEST: check pod logs",
			want:   "check pod logs",
		},
		{
			name:   "lowercase suggest prefix",
			detail: "suggest: restart deployment",
			want:   "restart deployment",
		},
		{
			name:   "mixed case suggest prefix",
			detail: "SuGgEsT: scale up replicas",
			want:   "scale up replicas",
		},
		{
			name:   "suggest with leading whitespace",
			detail: "  SUGGEST: investigate further",
			want:   "",
		},
		{
			name:   "suggest in middle of string",
			detail: "Note: SUGGEST: do something",
			want:   "",
		},
		{
			name:   "no suggest prefix",
			detail: "just a regular detail",
			want:   "",
		},
		{
			name:   "empty string",
			detail: "",
			want:   "",
		},
		{
			name:   "whitespace only",
			detail: "   ",
			want:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractObservationSuggest(tt.detail)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_summarizeQuickAsk(t *testing.T) {
	tests := []struct {
		name    string
		prompt  string
		answer  string
		wantLen int
		checks  func(t *testing.T, result string)
	}{
		{
			name:   "short prompt and answer",
			prompt: "What's the status?",
			answer: "All systems operational",
			checks: func(t *testing.T, result string) {
				assert.Contains(t, result, "Q: What's the status?")
				assert.Contains(t, result, "A: All systems operational")
			},
		},
		{
			name:   "long prompt truncated",
			prompt: strings.Repeat("a", 150),
			answer: "short answer",
			checks: func(t *testing.T, result string) {
				assert.Contains(t, result, "...")
				assert.Contains(t, result, "Q:")
				assert.Less(t, len(result), 500)
			},
		},
		{
			name:   "long answer truncated",
			prompt: "short prompt",
			answer: strings.Repeat("b", 250),
			checks: func(t *testing.T, result string) {
				assert.Contains(t, result, "...")
				assert.Contains(t, result, "A:")
			},
		},
		{
			name:   "whitespace trimmed",
			prompt: "  what's up  ",
			answer: "  all good  ",
			checks: func(t *testing.T, result string) {
				assert.Contains(t, result, "Q: what's up")
				assert.Contains(t, result, "A: all good")
				assert.NotContains(t, result, "  what's up  ")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := summarizeQuickAsk(tt.prompt, tt.answer)
			assert.Contains(t, result, "Q:")
			assert.Contains(t, result, "A:")
			if tt.checks != nil {
				tt.checks(t, result)
			}
		})
	}
}

func Test_minInt(t *testing.T) {
	tests := []struct {
		name string
		a    int
		b    int
		want int
	}{
		{"a smaller", 1, 2, 1},
		{"b smaller", 5, 3, 3},
		{"equal", 10, 10, 10},
		{"negative", -5, 2, -5},
		{"both negative", -10, -3, -10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := minInt(tt.a, tt.b)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_splitEventObjectKind(t *testing.T) {
	tests := []struct {
		name   string
		object string
		want   string
	}{
		{
			name:   "standard kind/name",
			object: "Pod/nginx-abc123",
			want:   "Pod",
		},
		{
			name:   "deployment",
			object: "Deployment/frontend",
			want:   "Deployment",
		},
		{
			name:   "service",
			object: "Service/backend-svc",
			want:   "Service",
		},
		{
			name:   "no slash defaults to Object",
			object: "standalone-name",
			want:   "Object",
		},
		{
			name:   "empty string defaults to Object",
			object: "",
			want:   "Object",
		},
		{
			name:   "whitespace trimmed",
			object: "  Pod/nginx  ",
			want:   "Pod",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitEventObjectKind(tt.object)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_splitEventObjectName(t *testing.T) {
	tests := []struct {
		name   string
		object string
		want   string
	}{
		{
			name:   "standard kind/name",
			object: "Pod/nginx-abc123",
			want:   "nginx-abc123",
		},
		{
			name:   "deployment",
			object: "Deployment/frontend",
			want:   "frontend",
		},
		{
			name:   "no slash returns whole string",
			object: "standalone-name",
			want:   "standalone-name",
		},
		{
			name:   "empty string",
			object: "",
			want:   "unknown",
		},
		{
			name:   "whitespace trimmed",
			object: "  Pod/nginx  ",
			want:   "nginx",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := splitEventObjectName(tt.object)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_inferSeverity(t *testing.T) {
	tests := []struct {
		name      string
		eventType string
		reason    string
		want      string
	}{
		{
			name:      "warning with critical reason OOM",
			eventType: "Warning",
			reason:    "OOMKilled",
			want:      "critical",
		},
		{
			name:      "warning with critical reason BackOff",
			eventType: "Warning",
			reason:    "BackOff",
			want:      "critical",
		},
		{
			name:      "warning with critical reason Failed",
			eventType: "Warning",
			reason:    "FailedScheduling",
			want:      "critical",
		},
		{
			name:      "warning with critical reason CrashLoopBackOff",
			eventType: "Warning",
			reason:    "CrashLoopBackOff",
			want:      "critical",
		},
		{
			name:      "warning with non-critical reason",
			eventType: "Warning",
			reason:    "ImagePullBackOff",
			want:      "warning",
		},
		{
			name:      "normal event",
			eventType: "Normal",
			reason:    "Created",
			want:      "info",
		},
		{
			name:      "case insensitive event type",
			eventType: "warning",
			reason:    "OOMKilled",
			want:      "critical",
		},
		{
			name:      "empty event type",
			eventType: "",
			reason:    "Something",
			want:      "info",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := inferSeverity(tt.eventType, tt.reason)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_isCriticalReason(t *testing.T) {
	tests := []struct {
		name   string
		reason string
		want   bool
	}{
		{"OOMKilled", "OOMKilled", true},
		{"BackOff", "BackOff", true},
		{"ImagePullBackOff", "ImagePullBackOff", true},
		{"FailedScheduling", "FailedScheduling", true},
		{"FailedMount", "FailedMount", true},
		{"Evicted", "Evicted", true},
		{"NodeNotReady", "NodeNotReady", true},
		{"CrashLoopBackOff", "CrashLoopBackOff", true},
		{"Normal reason", "Created", false},
		{"Pulled", "Pulled", false},
		{"Started", "Started", false},
		{"Empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isCriticalReason(tt.reason)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_isDestructiveAction(t *testing.T) {
	tests := []struct {
		name string
		t    string
		want bool
	}{
		{"DeleteCluster", "DeleteCluster", true},
		{"DeletePod", "DeletePod", true},
		{"CordonNode", "CordonNode", true},
		{"ScaleDeployment", "ScaleDeployment", false},
		{"RestartPod", "RestartPod", false},
		{"Empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isDestructiveAction(tt.t)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_truncateString(t *testing.T) {
	tests := []struct {
		name string
		s    string
		n    int
		want string
	}{
		{
			name: "string shorter than limit",
			s:    "hello",
			n:    10,
			want: "hello",
		},
		{
			name: "string equal to limit",
			s:    "hello",
			n:    5,
			want: "hello",
		},
		{
			name: "string longer than limit",
			s:    "hello world",
			n:    5,
			want: "hello...",
		},
		{
			name: "empty string",
			s:    "",
			n:    5,
			want: "",
		},
		{
			name: "zero limit",
			s:    "hello",
			n:    0,
			want: "...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := truncateString(tt.s, tt.n)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_priorityLabel(t *testing.T) {
	tests := []struct {
		name     string
		priority int
		want     string
	}{
		{"priority 1 is high", 1, "HIGH"},
		{"priority 2 is high", 2, "HIGH"},
		{"priority 3 is high", 3, "HIGH"},
		{"priority 4 is med", 4, "MED"},
		{"priority 5 is med", 5, "MED"},
		{"priority 6 is med", 6, "MED"},
		{"priority 7 is low", 7, "LOW"},
		{"priority 10 is low", 10, "LOW"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := priorityLabel(tt.priority)
			assert.Equal(t, tt.want, result)
		})
	}
}

func Test_memoryScore(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name       string
		memory     store.StellarMemoryEntry
		wantHigher bool
		wantLower  bool
	}{
		{
			name: "high importance recent",
			memory: store.StellarMemoryEntry{
				Importance: 9,
				CreatedAt:  now.Add(-1 * time.Hour),
			},
			wantHigher: true,
		},
		{
			name: "low importance recent",
			memory: store.StellarMemoryEntry{
				Importance: 1,
				CreatedAt:  now.Add(-1 * time.Hour),
			},
			wantLower: true,
		},
		{
			name: "high importance old",
			memory: store.StellarMemoryEntry{
				Importance: 9,
				CreatedAt:  now.Add(-100 * time.Hour),
			},
			wantLower: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := memoryScore(tt.memory)
			if tt.wantHigher {
				assert.Greater(t, result, 50.0)
			}
			if tt.wantLower {
				assert.Less(t, result, 50.0)
			}
		})
	}
}

func Test_buildQuickAskResponse(t *testing.T) {
	state := &OperationalState{
		EventCounts: map[string]int{
			"critical": 3,
			"warning":  5,
			"info":     10,
		},
		PendingActionIDs:  []string{"a1", "a2"},
		ActiveMissionIDs:  []string{"m1"},
		UnreadAlerts:      7,
		ClustersWatching:  []string{"prod", "staging"},
	}

	tests := []struct {
		name    string
		prompt  string
		cluster string
		checks  func(t *testing.T, response string)
	}{
		{
			name:   "pending actions query",
			prompt: "show me pending actions",
			checks: func(t *testing.T, response string) {
				assert.Contains(t, response, "2 action(s) pending approval")
			},
		},
		{
			name:   "missions query",
			prompt: "what missions are running",
			checks: func(t *testing.T, response string) {
				assert.Contains(t, response, "1 active mission(s)")
				assert.Contains(t, response, "7 alert(s)")
			},
		},
		{
			name:    "general query with cluster",
			prompt:  "what's happening",
			cluster: "prod",
			checks: func(t *testing.T, response string) {
				assert.Contains(t, response, "prod")
				assert.Contains(t, response, "3 critical")
				assert.Contains(t, response, "5 warning")
				assert.Contains(t, response, "10 info")
			},
		},
		{
			name:   "general query without cluster",
			prompt: "overview please",
			checks: func(t *testing.T, response string) {
				assert.Contains(t, response, "all watched clusters")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildQuickAskResponse(tt.prompt, tt.cluster, state)
			assert.NotEmpty(t, result)
			if tt.checks != nil {
				tt.checks(t, result)
			}
		})
	}
}
