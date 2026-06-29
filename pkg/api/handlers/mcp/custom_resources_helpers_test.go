package mcp

import (
	"fmt"
	"testing"
)

// --- Tests for parseCustomResourceLimit ---

func TestParseCustomResourceLimit_Default(t *testing.T) {
	got, err := parseCustomResourceLimit("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != defaultCustomResourceLimit {
		t.Errorf("got %d, want %d", got, defaultCustomResourceLimit)
	}
}

func TestParseCustomResourceLimit_Valid(t *testing.T) {
	cases := []struct {
		input string
		want  int
	}{
		{"1", 1},
		{"100", 100},
		{"500", 500},
		{"2000", 2000},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got, err := parseCustomResourceLimit(tc.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestParseCustomResourceLimit_Invalid(t *testing.T) {
	cases := []string{"0", "-1", "2001", "abc", "3.14"}
	for _, tc := range cases {
		t.Run(tc, func(t *testing.T) {
			_, err := parseCustomResourceLimit(tc)
			if err == nil {
				t.Error("expected error for invalid limit")
			}
		})
	}
}

// --- Tests for parseCustomResourceContinueToken ---

func TestParseCustomResourceContinueToken_Empty(t *testing.T) {
	got, err := parseCustomResourceContinueToken("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 0 {
		t.Errorf("got %d, want 0", got)
	}
}

func TestParseCustomResourceContinueToken_Valid(t *testing.T) {
	cases := []struct {
		input string
		want  int
	}{
		{"0", 0},
		{"500", 500},
		{"10000", 10000},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got, err := parseCustomResourceContinueToken(tc.input)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestParseCustomResourceContinueToken_Invalid(t *testing.T) {
	cases := []string{"-1", "10001", "abc", "3.14"}
	for _, tc := range cases {
		t.Run(tc, func(t *testing.T) {
			_, err := parseCustomResourceContinueToken(tc)
			if err == nil {
				t.Error("expected error for invalid token")
			}
		})
	}
}

// --- Tests for parsePositiveIntQuery ---

func TestParsePositiveIntQuery_ValidRange(t *testing.T) {
	cases := []struct {
		raw      string
		min, max int
		want     int
	}{
		{"5", 1, 100, 5},
		{"1", 1, 100, 1},   // at min
		{"100", 1, 100, 100}, // at max
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%s_in_%d_%d", tc.raw, tc.min, tc.max), func(t *testing.T) {
			got, err := parsePositiveIntQuery("test", tc.raw, tc.min, tc.max)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestParsePositiveIntQuery_BelowMin(t *testing.T) {
	_, err := parsePositiveIntQuery("test", "0", 1, 100)
	if err == nil {
		t.Error("expected error for value below min")
	}
}

func TestParsePositiveIntQuery_AboveMax(t *testing.T) {
	_, err := parsePositiveIntQuery("test", "101", 1, 100)
	if err == nil {
		t.Error("expected error for value above max")
	}
}

func TestParsePositiveIntQuery_NonInteger(t *testing.T) {
	_, err := parsePositiveIntQuery("test", "abc", 1, 100)
	if err == nil {
		t.Error("expected error for non-integer")
	}
}

// --- Tests for paginateCustomResourceItems ---

func TestPaginateCustomResourceItems_BasicPage(t *testing.T) {
	items := makeItems(10)
	page, next := paginateCustomResourceItems(items, 0, 5)
	if len(page) != 5 {
		t.Errorf("got %d items, want 5", len(page))
	}
	if next != "5" {
		t.Errorf("got next=%q, want \"5\"", next)
	}
}

func TestPaginateCustomResourceItems_SecondPage(t *testing.T) {
	items := makeItems(10)
	page, next := paginateCustomResourceItems(items, 5, 5)
	if len(page) != 5 {
		t.Errorf("got %d items, want 5", len(page))
	}
	if next != "" {
		t.Errorf("got next=%q, want empty (last page)", next)
	}
}

func TestPaginateCustomResourceItems_OffsetPastEnd(t *testing.T) {
	items := makeItems(5)
	page, next := paginateCustomResourceItems(items, 10, 5)
	if len(page) != 0 {
		t.Errorf("got %d items, want 0", len(page))
	}
	if next != "" {
		t.Errorf("got next=%q, want empty", next)
	}
}

func TestPaginateCustomResourceItems_EmptyInput(t *testing.T) {
	page, next := paginateCustomResourceItems(nil, 0, 10)
	if len(page) != 0 {
		t.Errorf("got %d items, want 0", len(page))
	}
	if next != "" {
		t.Errorf("got next=%q, want empty", next)
	}
}

func TestPaginateCustomResourceItems_ExactBoundary(t *testing.T) {
	items := makeItems(10)
	page, next := paginateCustomResourceItems(items, 0, 10)
	if len(page) != 10 {
		t.Errorf("got %d items, want 10", len(page))
	}
	if next != "" {
		t.Errorf("got next=%q, want empty (no more items)", next)
	}
}

func TestPaginateCustomResourceItems_PartialLastPage(t *testing.T) {
	items := makeItems(7)
	page, next := paginateCustomResourceItems(items, 5, 5)
	if len(page) != 2 {
		t.Errorf("got %d items, want 2", len(page))
	}
	if next != "" {
		t.Errorf("got next=%q, want empty", next)
	}
}

// --- Tests for parseCRItem ---

func TestParseCRItem_CompleteObject(t *testing.T) {
	obj := map[string]interface{}{
		"kind": "ScaledObject",
		"metadata": map[string]interface{}{
			"name":      "my-scaler",
			"namespace": "default",
			"labels": map[string]interface{}{
				"app": "web",
				"env": "prod",
			},
		},
		"spec": map[string]interface{}{
			"minReplicaCount": 1,
		},
		"status": map[string]interface{}{
			"phase": "Active",
		},
	}
	item := parseCRItem(obj, "cluster-1")
	if item.Name != "my-scaler" {
		t.Errorf("Name=%q, want \"my-scaler\"", item.Name)
	}
	if item.Namespace != "default" {
		t.Errorf("Namespace=%q, want \"default\"", item.Namespace)
	}
	if item.Kind != "ScaledObject" {
		t.Errorf("Kind=%q, want \"ScaledObject\"", item.Kind)
	}
	if item.Cluster != "cluster-1" {
		t.Errorf("Cluster=%q, want \"cluster-1\"", item.Cluster)
	}
	if item.Labels["app"] != "web" {
		t.Errorf("Labels[app]=%q, want \"web\"", item.Labels["app"])
	}
	if item.Spec == nil {
		t.Error("Spec should not be nil")
	}
	if item.Status == nil {
		t.Error("Status should not be nil")
	}
}

func TestParseCRItem_MinimalObject(t *testing.T) {
	obj := map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "bare-resource",
		},
	}
	item := parseCRItem(obj, "cluster-2")
	if item.Name != "bare-resource" {
		t.Errorf("Name=%q, want \"bare-resource\"", item.Name)
	}
	if item.Namespace != "" {
		t.Errorf("Namespace=%q, want empty", item.Namespace)
	}
	if item.Kind != "" {
		t.Errorf("Kind=%q, want empty", item.Kind)
	}
	if item.Cluster != "cluster-2" {
		t.Errorf("Cluster=%q, want \"cluster-2\"", item.Cluster)
	}
}

func TestParseCRItem_EmptyObject(t *testing.T) {
	obj := map[string]interface{}{}
	item := parseCRItem(obj, "cluster-3")
	if item.Name != "" {
		t.Errorf("Name=%q, want empty", item.Name)
	}
	if item.Cluster != "cluster-3" {
		t.Errorf("Cluster=%q, want \"cluster-3\"", item.Cluster)
	}
}

func TestParseCRItem_NonStringLabels(t *testing.T) {
	obj := map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "labeled",
			"labels": map[string]interface{}{
				"valid":   "yes",
				"numeric": 42, // non-string label value should be skipped
			},
		},
	}
	item := parseCRItem(obj, "c1")
	if item.Labels["valid"] != "yes" {
		t.Errorf("Labels[valid]=%q, want \"yes\"", item.Labels["valid"])
	}
	if _, ok := item.Labels["numeric"]; ok {
		t.Error("non-string label should not appear in labels map")
	}
}

// --- Tests for minCustomResourceInt ---

func TestMinCustomResourceInt(t *testing.T) {
	cases := []struct {
		a, b, want int
	}{
		{1, 2, 1},
		{5, 3, 3},
		{7, 7, 7},
		{0, 1, 0},
		{-1, 0, -1},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%d_%d", tc.a, tc.b), func(t *testing.T) {
			if got := minCustomResourceInt(tc.a, tc.b); got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

// Helper to create N test items
func makeItems(n int) []CustomResourceItem {
	items := make([]CustomResourceItem, n)
	for i := 0; i < n; i++ {
		items[i] = CustomResourceItem{
			Name:    fmt.Sprintf("item-%d", i),
			Cluster: "test-cluster",
		}
	}
	return items
}
