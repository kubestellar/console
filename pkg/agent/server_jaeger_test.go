package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
)

func TestAggregateJaegerResults(t *testing.T) {
	s := &Server{}

	tests := []struct {
		name     string
		results  []jaegerClusterResult
		expected string
	}{
		{
			name: "all healthy",
			results: []jaegerClusterResult{
				{hasJaeger: true, version: "1.57.0", isHealthy: true, clusterName: "cl1", collectors: []jaegerCollector{{Name: "c1", Status: "Healthy"}}},
			},
			expected: "Healthy",
		},
		{
			name: "some unhealthy collectors make it degraded",
			results: []jaegerClusterResult{
				{hasJaeger: true, version: "1.57.0", isHealthy: true, clusterName: "cl1", collectors: []jaegerCollector{
					{Name: "c1", Status: "Healthy"},
					{Name: "c2", Status: "Unhealthy"},
				}},
			},
			expected: "Degraded",
		},
		{
			name: "no jaeger found",
			results: []jaegerClusterResult{
				{hasJaeger: false, clusterName: "cl1"},
			},
			expected: "Unhealthy",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := s.aggregateJaegerResults(tt.results)
			assert.Equal(t, tt.expected, resp.Status)
		})
	}
}

func TestExtractTag(t *testing.T) {
	tests := []struct {
		image    string
		expected string
	}{
		{"jaegertracing/jaeger-collector:1.57.0", "1.57.0"},
		{"jaegertracing/jaeger-collector:v1.57.0", "1.57.0"},
		{"my-registry:5000/jaeger:latest", "latest"},
		{"no-tag", "unknown"},
	}

	for _, tt := range tests {
		assert.Equal(t, tt.expected, extractTag(tt.image))
	}
}

func TestIsPodReady(t *testing.T) {
	pod := &corev1.Pod{
		Status: corev1.PodStatus{
			Conditions: []corev1.PodCondition{
				{Type: corev1.PodReady, Status: corev1.ConditionTrue},
			},
		},
	}
	assert.True(t, isPodReady(pod))

	pod.Status.Conditions[0].Status = corev1.ConditionFalse
	assert.False(t, isPodReady(pod))
}
