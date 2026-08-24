package handlers

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/k8s"
)

// Unit tests for the pure helpers in lima.go that were previously covered
// only indirectly via the ListLima handler tests: isLimaNode,
// mapNodeToLimaInstance, limaNodeStatus, parseCPUCores, parseCapacityGB,
// valueOrUnknown, firstNonEmpty.

// ─── isLimaNode ──────────────────────────────────────────────────────

func TestIsLimaNode(t *testing.T) {
	cases := []struct {
		name string
		node k8s.NodeInfo
		want bool
	}{
		{"name prefix lima-", k8s.NodeInfo{Name: "lima-default"}, true},
		{"name prefix LIMA- (case-insensitive)", k8s.NodeInfo{Name: "LIMA-Default"}, true},
		{"instance label present", k8s.NodeInfo{
			Name:   "node-1",
			Labels: map[string]string{"lima.sh/instance": "default"},
		}, true},
		{"instance label empty value still qualifies", k8s.NodeInfo{
			Name:   "node-1",
			Labels: map[string]string{"lima.sh/instance": ""},
		}, true},
		{"OSImage contains lima", k8s.NodeInfo{
			Name:    "node-1",
			OSImage: "Lima Linux 6.5",
		}, true},
		{"unrelated node", k8s.NodeInfo{
			Name:    "worker-1",
			OSImage: "Ubuntu 22.04",
			Labels:  map[string]string{"role": "worker"},
		}, false},
		{"nil labels + no prefix + empty OSImage", k8s.NodeInfo{Name: "n"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, isLimaNode(tc.node))
		})
	}
}

// ─── limaNodeStatus ──────────────────────────────────────────────────

func TestLimaNodeStatus(t *testing.T) {
	cases := []struct {
		name       string
		conditions []k8s.NodeCondition
		want       string
	}{
		{
			name: "ready + no pressure → running",
			conditions: []k8s.NodeCondition{
				{Type: "Ready", Status: "True"},
			},
			want: "running",
		},
		{
			name: "ready but disk pressure → broken (pressure wins)",
			conditions: []k8s.NodeCondition{
				{Type: "Ready", Status: "True"},
				{Type: "DiskPressure", Status: "True"},
			},
			want: "broken",
		},
		{
			name: "memory pressure alone → broken",
			conditions: []k8s.NodeCondition{
				{Type: "MemoryPressure", Status: "True"},
			},
			want: "broken",
		},
		{
			name: "PID pressure alone → broken",
			conditions: []k8s.NodeCondition{
				{Type: "PIDPressure", Status: "True"},
			},
			want: "broken",
		},
		{
			name: "not ready + no pressure → stopped",
			conditions: []k8s.NodeCondition{
				{Type: "Ready", Status: "False"},
			},
			want: "stopped",
		},
		{
			name:       "empty conditions → stopped",
			conditions: nil,
			want:       "stopped",
		},
		{
			name: "Ready=true case-insensitive",
			conditions: []k8s.NodeCondition{
				{Type: "Ready", Status: "true"},
			},
			want: "running",
		},
		{
			name: "pressure with lowercase status still triggers",
			conditions: []k8s.NodeCondition{
				{Type: "DiskPressure", Status: "true"},
			},
			want: "broken",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, limaNodeStatus(tc.conditions))
		})
	}
}

// ─── parseCPUCores ───────────────────────────────────────────────────

func TestParseCPUCores(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"4", 4},                  // plain integer core count
		{"  8  ", 8},              // whitespace tolerated
		{"1500m", 2},              // milli-cores, ceil
		{"2000m", 2},              // exact multiple
		{"500m", 1},               // sub-core rounds up
		{"0", 0},                  // zero
		{"", 0},                   // empty
		{"garbage", 0},            // unparseable
		{"-1", 0},                 // negative parseable via ParseQuantity → milli <=0
		{"0m", 0},                 // zero milli
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			assert.Equal(t, tc.want, parseCPUCores(tc.in))
		})
	}
}

// ─── parseCapacityGB ─────────────────────────────────────────────────

func TestParseCapacityGB(t *testing.T) {
	// 1 GiB = 1024^3 bytes
	const gib = int64(1024 * 1024 * 1024)
	_ = gib
	cases := []struct {
		in   string
		want int
	}{
		{"1Gi", 1},
		{"2Gi", 2},
		{"1024Mi", 1},              // 1024 MiB = 1 GiB
		{"512Mi", 1},                // rounds to nearest → 0.5 GiB rounds to 0 or 1? math.Round of 0.5 → 0 (banker's? no — Go math.Round rounds half away from zero → 1)
		{"", 0},
		{"garbage", 0},
		{"0", 0},
		{"-5Gi", 0},                 // negative → treated as <= 0
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			assert.Equal(t, tc.want, parseCapacityGB(tc.in))
		})
	}
}

// ─── valueOrUnknown ──────────────────────────────────────────────────

func TestValueOrUnknown(t *testing.T) {
	assert.Equal(t, "unknown", valueOrUnknown(""))
	assert.Equal(t, "unknown", valueOrUnknown("   "))
	assert.Equal(t, "arm64", valueOrUnknown("arm64"))
	assert.Equal(t, "amd64", valueOrUnknown("  amd64  "))
}

// ─── firstNonEmpty ───────────────────────────────────────────────────

func TestFirstNonEmpty(t *testing.T) {
	assert.Equal(t, "", firstNonEmpty())
	assert.Equal(t, "", firstNonEmpty("", "  ", "\t"))
	assert.Equal(t, "a", firstNonEmpty("a", "b"))
	assert.Equal(t, "b", firstNonEmpty("", "b", "c"))
	// firstNonEmpty returns the ORIGINAL string (not trimmed) once a
	// non-blank one is found.
	assert.Equal(t, "  padded  ", firstNonEmpty("", "  padded  "))
}

// ─── mapNodeToLimaInstance ───────────────────────────────────────────

func TestMapNodeToLimaInstance_FullyPopulated(t *testing.T) {
	node := k8s.NodeInfo{
		Name:            "lima-default",
		Architecture:    "arm64",
		OSImage:         "Ubuntu 22.04",
		OS:              "linux",
		CPUCapacity:     "4",
		MemoryCapacity:  "8Gi",
		StorageCapacity: "100Gi",
		Labels:          map[string]string{"lima.sh/version": "1.0.7"},
		Conditions: []k8s.NodeCondition{
			{Type: "Ready", Status: "True"},
		},
	}

	inst := mapNodeToLimaInstance(node)

	assert.Equal(t, "lima-default", inst.Name)
	assert.Equal(t, "running", inst.Status)
	assert.Equal(t, 4, inst.CPUCores)
	assert.Equal(t, 8, inst.MemoryGB)
	assert.Equal(t, 100, inst.DiskGB)
	assert.Equal(t, "arm64", inst.Arch)
	assert.Equal(t, "Ubuntu 22.04", inst.OS)
	assert.Equal(t, "1.0.7", inst.LimaVersion)

	// LastSeen is set to a valid RFC3339 timestamp near now.
	ts, err := time.Parse(time.RFC3339, inst.LastSeen)
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now().UTC(), ts, 5*time.Second)
}

func TestMapNodeToLimaInstance_Defaults(t *testing.T) {
	// No labels, no OSImage, no architecture → defaults kick in:
	//   Arch → "unknown", OS → "Linux" (fallback), LimaVersion → "unknown"
	node := k8s.NodeInfo{
		Name: "lima-mini",
		Conditions: []k8s.NodeCondition{
			{Type: "Ready", Status: "False"},
		},
	}

	inst := mapNodeToLimaInstance(node)

	assert.Equal(t, "lima-mini", inst.Name)
	assert.Equal(t, "stopped", inst.Status)
	assert.Equal(t, 0, inst.CPUCores)
	assert.Equal(t, 0, inst.MemoryGB)
	assert.Equal(t, 0, inst.DiskGB)
	assert.Equal(t, "unknown", inst.Arch)
	assert.Equal(t, "Linux", inst.OS)
	assert.Equal(t, "unknown", inst.LimaVersion)
	// LastSeen is populated even for stopped instances.
	assert.NotEmpty(t, inst.LastSeen)
}

func TestMapNodeToLimaInstance_LimaVersionBlankFallsBackToUnknown(t *testing.T) {
	// A version label present but whitespace-only should NOT be surfaced —
	// the helper trims and falls back to "unknown" (#lima-version-blank).
	node := k8s.NodeInfo{
		Name:   "lima-x",
		Labels: map[string]string{"lima.sh/version": "   "},
	}
	inst := mapNodeToLimaInstance(node)
	assert.Equal(t, "unknown", inst.LimaVersion)
}

func TestMapNodeToLimaInstance_OSPrefersOSImage(t *testing.T) {
	// firstNonEmpty(OSImage, OS, "Linux") → OSImage wins when non-blank.
	node := k8s.NodeInfo{
		Name:    "lima-a",
		OSImage: "Debian 12",
		OS:      "linux",
	}
	inst := mapNodeToLimaInstance(node)
	assert.Equal(t, "Debian 12", inst.OS)

	// When OSImage is blank, fall through to OS.
	node2 := k8s.NodeInfo{Name: "lima-b", OS: "linux"}
	inst2 := mapNodeToLimaInstance(node2)
	assert.Equal(t, "linux", inst2.OS)
}

// A quick sanity check that lima- prefix detection is bounded to a real
// prefix (not a substring match anywhere in the name), to guard against
// a future refactor changing HasPrefix to Contains.
func TestIsLimaNode_PrefixIsNotSubstring(t *testing.T) {
	assert.False(t, isLimaNode(k8s.NodeInfo{Name: "worker-lima-1"}))
	assert.True(t, isLimaNode(k8s.NodeInfo{Name: "lima-worker-1"}))
	// And OSImage substring match IS by design case-insensitive:
	assert.True(t, isLimaNode(k8s.NodeInfo{
		Name:    "unrelated",
		OSImage: strings.ToUpper("running LIMA image"),
	}))
}
