package mcp

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseCustomResourceLimit(t *testing.T) {
	tests := []struct {
		name          string
		raw           string
		expectedValue int
		wantError     bool
	}{
		{
			name:          "empty string returns default",
			raw:           "",
			expectedValue: defaultCustomResourceLimit,
			wantError:     false,
		},
		{
			name:          "valid limit within range",
			raw:           "100",
			expectedValue: 100,
			wantError:     false,
		},
		{
			name:          "minimum valid limit",
			raw:           "1",
			expectedValue: 1,
			wantError:     false,
		},
		{
			name:          "maximum valid limit",
			raw:           "2000",
			expectedValue: maxCustomResourceLimit,
			wantError:     false,
		},
		{
			name:          "limit at default value",
			raw:           "500",
			expectedValue: 500,
			wantError:     false,
		},
		{
			name:          "zero is invalid (below min)",
			raw:           "0",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "negative value is invalid",
			raw:           "-1",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "exceeds maximum",
			raw:           "2001",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "non-integer value",
			raw:           "abc",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "decimal value",
			raw:           "100.5",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "very large value",
			raw:           "99999",
			expectedValue: 0,
			wantError:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parseCustomResourceLimit(tt.raw)
			if tt.wantError {
				require.Error(t, err)
				assert.Equal(t, 0, result)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expectedValue, result)
			}
		})
	}
}

func TestParseCustomResourceContinueToken(t *testing.T) {
	tests := []struct {
		name          string
		raw           string
		expectedValue int
		wantError     bool
	}{
		{
			name:          "empty string returns zero",
			raw:           "",
			expectedValue: 0,
			wantError:     false,
		},
		{
			name:          "valid continue token",
			raw:           "100",
			expectedValue: 100,
			wantError:     false,
		},
		{
			name:          "zero is valid",
			raw:           "0",
			expectedValue: 0,
			wantError:     false,
		},
		{
			name:          "maximum valid continue token",
			raw:           "10000",
			expectedValue: 10000,
			wantError:     false,
		},
		{
			name:          "mid-range continue token",
			raw:           "5000",
			expectedValue: 5000,
			wantError:     false,
		},
		{
			name:          "negative value is invalid",
			raw:           "-1",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "exceeds maximum",
			raw:           "10001",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "non-integer value",
			raw:           "invalid",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "decimal value",
			raw:           "50.5",
			expectedValue: 0,
			wantError:     true,
		},
		{
			name:          "very large value",
			raw:           "999999",
			expectedValue: 0,
			wantError:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parseCustomResourceContinueToken(tt.raw)
			if tt.wantError {
				require.Error(t, err)
				assert.Equal(t, 0, result)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expectedValue, result)
			}
		})
	}
}

func TestParsePositiveIntQuery(t *testing.T) {
	tests := []struct {
		name          string
		paramName     string
		raw           string
		minValue      int
		maxValue      int
		expectedValue int
		wantError     bool
		errorContains string
	}{
		{
			name:          "valid value within range",
			paramName:     "limit",
			raw:           "50",
			minValue:      1,
			maxValue:      100,
			expectedValue: 50,
			wantError:     false,
		},
		{
			name:          "value at minimum",
			paramName:     "offset",
			raw:           "0",
			minValue:      0,
			maxValue:      1000,
			expectedValue: 0,
			wantError:     false,
		},
		{
			name:          "value at maximum",
			paramName:     "limit",
			raw:           "2000",
			minValue:      1,
			maxValue:      2000,
			expectedValue: 2000,
			wantError:     false,
		},
		{
			name:          "value one above minimum",
			paramName:     "limit",
			raw:           "2",
			minValue:      1,
			maxValue:      100,
			expectedValue: 2,
			wantError:     false,
		},
		{
			name:          "value one below maximum",
			paramName:     "limit",
			raw:           "99",
			minValue:      1,
			maxValue:      100,
			expectedValue: 99,
			wantError:     false,
		},
		{
			name:          "below minimum",
			paramName:     "limit",
			raw:           "0",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be >= 1",
		},
		{
			name:          "above maximum",
			paramName:     "limit",
			raw:           "101",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be <= 100",
		},
		{
			name:          "non-integer string",
			paramName:     "limit",
			raw:           "abc",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be an integer",
		},
		{
			name:          "decimal value",
			paramName:     "limit",
			raw:           "50.5",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be an integer",
		},
		{
			name:          "negative value",
			paramName:     "offset",
			raw:           "-1",
			minValue:      0,
			maxValue:      1000,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be >= 0",
		},
		{
			name:          "large negative value",
			paramName:     "limit",
			raw:           "-999",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be >= 1",
		},
		{
			name:          "empty string",
			paramName:     "limit",
			raw:           "",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be an integer",
		},
		{
			name:          "whitespace",
			paramName:     "limit",
			raw:           "  ",
			minValue:      1,
			maxValue:      100,
			expectedValue: 0,
			wantError:     true,
			errorContains: "must be an integer",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parsePositiveIntQuery(tt.paramName, tt.raw, tt.minValue, tt.maxValue)
			if tt.wantError {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
				assert.Equal(t, 0, result)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expectedValue, result)
			}
		})
	}
}

func TestPaginateCustomResourceItems(t *testing.T) {
	makeItems := func(count int) []CustomResourceItem {
		items := make([]CustomResourceItem, count)
		for i := 0; i < count; i++ {
			items[i] = CustomResourceItem{
				Name:    fmt.Sprintf("item-%d", i),
				Cluster: "test-cluster",
			}
		}
		return items
	}

	tests := []struct {
		name             string
		items            []CustomResourceItem
		offset           int
		limit            int
		expectedItems    int
		expectedContinue string
	}{
		{
			name:             "empty input",
			items:            []CustomResourceItem{},
			offset:           0,
			limit:            10,
			expectedItems:    0,
			expectedContinue: "",
		},
		{
			name:             "offset past end returns empty",
			items:            makeItems(10),
			offset:           20,
			limit:            10,
			expectedItems:    0,
			expectedContinue: "",
		},
		{
			name:             "offset at end returns empty",
			items:            makeItems(10),
			offset:           10,
			limit:            10,
			expectedItems:    0,
			expectedContinue: "",
		},
		{
			name:             "first page with more items",
			items:            makeItems(100),
			offset:           0,
			limit:            10,
			expectedItems:    10,
			expectedContinue: "10",
		},
		{
			name:             "middle page",
			items:            makeItems(100),
			offset:           50,
			limit:            10,
			expectedItems:    10,
			expectedContinue: "60",
		},
		{
			name:             "last page exactly at boundary",
			items:            makeItems(100),
			offset:           90,
			limit:            10,
			expectedItems:    10,
			expectedContinue: "",
		},
		{
			name:             "last page partial",
			items:            makeItems(95),
			offset:           90,
			limit:            10,
			expectedItems:    5,
			expectedContinue: "",
		},
		{
			name:             "single item",
			items:            makeItems(1),
			offset:           0,
			limit:            10,
			expectedItems:    1,
			expectedContinue: "",
		},
		{
			name:             "limit larger than items",
			items:            makeItems(5),
			offset:           0,
			limit:            10,
			expectedItems:    5,
			expectedContinue: "",
		},
		{
			name:             "offset one before end",
			items:            makeItems(10),
			offset:           9,
			limit:            10,
			expectedItems:    1,
			expectedContinue: "",
		},
		{
			name:             "zero offset with exact page size",
			items:            makeItems(10),
			offset:           0,
			limit:            10,
			expectedItems:    10,
			expectedContinue: "",
		},
		{
			name:             "zero offset with one more item",
			items:            makeItems(11),
			offset:           0,
			limit:            10,
			expectedItems:    10,
			expectedContinue: "10",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resultItems, nextContinue := paginateCustomResourceItems(tt.items, tt.offset, tt.limit)
			assert.Len(t, resultItems, tt.expectedItems)
			assert.Equal(t, tt.expectedContinue, nextContinue)

			// Verify items are in the correct slice range
			if tt.expectedItems > 0 && len(tt.items) > 0 {
				expectedEnd := tt.offset + tt.limit
				if expectedEnd > len(tt.items) {
					expectedEnd = len(tt.items)
				}
				for i := 0; i < tt.expectedItems; i++ {
					assert.Equal(t, tt.items[tt.offset+i].Name, resultItems[i].Name)
				}
			}
		})
	}
}

func TestMinCustomResourceInt(t *testing.T) {
	tests := []struct {
		name     string
		a        int
		b        int
		expected int
	}{
		{
			name:     "a less than b",
			a:        5,
			b:        10,
			expected: 5,
		},
		{
			name:     "b less than a",
			a:        10,
			b:        5,
			expected: 5,
		},
		{
			name:     "equal values",
			a:        7,
			b:        7,
			expected: 7,
		},
		{
			name:     "both zero",
			a:        0,
			b:        0,
			expected: 0,
		},
		{
			name:     "one zero a smaller",
			a:        0,
			b:        10,
			expected: 0,
		},
		{
			name:     "one zero b smaller",
			a:        10,
			b:        0,
			expected: 0,
		},
		{
			name:     "negative a smaller",
			a:        -5,
			b:        10,
			expected: -5,
		},
		{
			name:     "negative b smaller",
			a:        10,
			b:        -5,
			expected: -5,
		},
		{
			name:     "both negative a smaller",
			a:        -10,
			b:        -5,
			expected: -10,
		},
		{
			name:     "both negative b smaller",
			a:        -5,
			b:        -10,
			expected: -10,
		},
		{
			name:     "large values a smaller",
			a:        999999,
			b:        1000000,
			expected: 999999,
		},
		{
			name:     "large values b smaller",
			a:        1000000,
			b:        999999,
			expected: 999999,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := minCustomResourceInt(tt.a, tt.b)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestParseCRItem(t *testing.T) {
	tests := []struct {
		name     string
		obj      map[string]interface{}
		cluster  string
		expected CustomResourceItem
	}{
		{
			name: "complete object with all fields",
			obj: map[string]interface{}{
				"kind": "ScaledObject",
				"metadata": map[string]interface{}{
					"name":      "my-scaledobject",
					"namespace": "default",
					"labels": map[string]interface{}{
						"app":     "myapp",
						"env":     "prod",
						"version": "v1",
					},
				},
				"spec": map[string]interface{}{
					"scaleTargetRef": map[string]interface{}{
						"name": "myapp-deployment",
					},
					"minReplicaCount": 1,
					"maxReplicaCount": 10,
				},
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "True"},
					},
					"currentReplicas": 3,
				},
			},
			cluster: "prod-cluster",
			expected: CustomResourceItem{
				Name:      "my-scaledobject",
				Namespace: "default",
				Kind:      "ScaledObject",
				Cluster:   "prod-cluster",
				Labels: map[string]string{
					"app":     "myapp",
					"env":     "prod",
					"version": "v1",
				},
				Spec: map[string]interface{}{
					"scaleTargetRef": map[string]interface{}{
						"name": "myapp-deployment",
					},
					"minReplicaCount": 1,
					"maxReplicaCount": 10,
				},
				Status: map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "True"},
					},
					"currentReplicas": 3,
				},
			},
		},
		{
			name: "minimal object with only name",
			obj: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name": "minimal-resource",
				},
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Name:    "minimal-resource",
				Cluster: "test-cluster",
			},
		},
		{
			name: "cluster-scoped resource without namespace",
			obj: map[string]interface{}{
				"kind": "ClusterIssuer",
				"metadata": map[string]interface{}{
					"name": "letsencrypt-prod",
				},
				"spec": map[string]interface{}{
					"acme": map[string]interface{}{
						"server": "https://acme-v02.api.letsencrypt.org/directory",
					},
				},
			},
			cluster: "prod-cluster",
			expected: CustomResourceItem{
				Name:    "letsencrypt-prod",
				Kind:    "ClusterIssuer",
				Cluster: "prod-cluster",
				Spec: map[string]interface{}{
					"acme": map[string]interface{}{
						"server": "https://acme-v02.api.letsencrypt.org/directory",
					},
				},
			},
		},
		{
			name: "object with empty labels map",
			obj: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":   "no-labels",
					"labels": map[string]interface{}{},
				},
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Name:    "no-labels",
				Cluster: "test-cluster",
				Labels:  map[string]string{},
			},
		},
		{
			name: "object with non-string label values skipped",
			obj: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name": "mixed-labels",
					"labels": map[string]interface{}{
						"app":     "myapp",
						"version": 123,
						"enabled": true,
					},
				},
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Name:    "mixed-labels",
				Cluster: "test-cluster",
				Labels: map[string]string{
					"app": "myapp",
				},
			},
		},
		{
			name: "object with missing metadata",
			obj: map[string]interface{}{
				"kind": "SomeKind",
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Kind:    "SomeKind",
				Cluster: "test-cluster",
			},
		},
		{
			name: "object with nil metadata fields",
			obj: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name":      "test-resource",
					"namespace": nil,
					"labels":    nil,
				},
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Name:    "test-resource",
				Cluster: "test-cluster",
			},
		},
		{
			name:    "empty object",
			obj:     map[string]interface{}{},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Cluster: "test-cluster",
			},
		},
		{
			name: "object with status but no spec",
			obj: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name": "status-only",
				},
				"status": map[string]interface{}{
					"phase": "Running",
				},
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Name:    "status-only",
				Cluster: "test-cluster",
				Status: map[string]interface{}{
					"phase": "Running",
				},
			},
		},
		{
			name: "object with spec but no status",
			obj: map[string]interface{}{
				"metadata": map[string]interface{}{
					"name": "spec-only",
				},
				"spec": map[string]interface{}{
					"replicas": 3,
				},
			},
			cluster: "test-cluster",
			expected: CustomResourceItem{
				Name:    "spec-only",
				Cluster: "test-cluster",
				Spec: map[string]interface{}{
					"replicas": 3,
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseCRItem(tt.obj, tt.cluster)
			assert.Equal(t, tt.expected.Name, result.Name)
			assert.Equal(t, tt.expected.Namespace, result.Namespace)
			assert.Equal(t, tt.expected.Kind, result.Kind)
			assert.Equal(t, tt.expected.Cluster, result.Cluster)
			assert.Equal(t, tt.expected.Labels, result.Labels)
			assert.Equal(t, tt.expected.Spec, result.Spec)
			assert.Equal(t, tt.expected.Status, result.Status)
		})
	}
}
