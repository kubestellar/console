package providers

import (
	"context"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// ────────────────────────────────────────────────────────────────────────────
// unstructuredNestedBool — was 0%
// ────────────────────────────────────────────────────────────────────────────

func TestUnstructuredNestedBool_SimpleTrue(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"approved": true,
		},
	}
	val, found, err := unstructuredNestedBool(obj, "spec", "approved")
	require.NoError(t, err)
	assert.True(t, found)
	assert.True(t, val)
}

func TestUnstructuredNestedBool_SimpleFalse(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"approved": false,
		},
	}
	val, found, err := unstructuredNestedBool(obj, "spec", "approved")
	require.NoError(t, err)
	assert.True(t, found)
	assert.False(t, val)
}

func TestUnstructuredNestedBool_MissingField(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{},
	}
	val, found, err := unstructuredNestedBool(obj, "spec", "approved")
	require.NoError(t, err)
	assert.False(t, found)
	assert.False(t, val)
}

func TestUnstructuredNestedBool_MissingParent(t *testing.T) {
	obj := map[string]interface{}{}
	val, found, err := unstructuredNestedBool(obj, "spec", "approved")
	require.NoError(t, err)
	assert.False(t, found)
	assert.False(t, val)
}

func TestUnstructuredNestedBool_DeepNesting(t *testing.T) {
	obj := map[string]interface{}{
		"a": map[string]interface{}{
			"b": map[string]interface{}{
				"c": map[string]interface{}{
					"ready": true,
				},
			},
		},
	}
	val, found, err := unstructuredNestedBool(obj, "a", "b", "c", "ready")
	require.NoError(t, err)
	assert.True(t, found)
	assert.True(t, val)
}

func TestUnstructuredNestedBool_NotBoolType(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"approved": "yes", // string, not bool
		},
	}
	val, found, err := unstructuredNestedBool(obj, "spec", "approved")
	require.NoError(t, err)
	assert.False(t, found, "non-bool value should not be found as bool")
	assert.False(t, val)
}

func TestUnstructuredNestedBool_ParentNotMap(t *testing.T) {
	obj := map[string]interface{}{
		"spec": "not-a-map",
	}
	val, found, err := unstructuredNestedBool(obj, "spec", "approved")
	require.NoError(t, err)
	assert.False(t, found)
	assert.False(t, val)
}

func TestUnstructuredNestedBool_SingleField(t *testing.T) {
	obj := map[string]interface{}{
		"ready": true,
	}
	val, found, err := unstructuredNestedBool(obj, "ready")
	require.NoError(t, err)
	assert.True(t, found)
	assert.True(t, val)
}

// ────────────────────────────────────────────────────────────────────────────
// Execute dispatch — unknown action IDs (covers default branches)
// ────────────────────────────────────────────────────────────────────────────

func TestClusternetExecute_UnknownAction(t *testing.T) {
	p := &clusternetProvider{}
	cfg := &rest.Config{Host: "https://fake:6443"}
	req := federation.ActionRequest{ActionID: "clusternet.bogus"}

	_, err := p.Execute(context.Background(), cfg, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown Clusternet action")
}

func TestCAPIExecute_UnknownAction(t *testing.T) {
	p := &capiProvider{}
	cfg := &rest.Config{Host: "https://fake:6443"}
	req := federation.ActionRequest{ActionID: "capi.bogus"}

	_, err := p.Execute(context.Background(), cfg, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown CAPI action")
}

func TestKarmadaExecute_UnknownAction(t *testing.T) {
	p := &karmadaProvider{}
	cfg := &rest.Config{Host: "https://fake:6443"}
	req := federation.ActionRequest{ActionID: "karmada.bogus"}

	_, err := p.Execute(context.Background(), cfg, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown Karmada action")
}

func TestKubeAdmiralExecute_UnknownAction(t *testing.T) {
	p := &kubeAdmiralProvider{}
	cfg := &rest.Config{Host: "https://fake:6443"}
	req := federation.ActionRequest{ActionID: "kubeadmiral.bogus"}

	_, err := p.Execute(context.Background(), cfg, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown KubeAdmiral action")
}

func TestLiqoExecute_UnknownAction(t *testing.T) {
	p := &liqoProvider{}
	cfg := &rest.Config{Host: "https://fake:6443"}
	req := federation.ActionRequest{ActionID: "liqo.bogus"}

	_, err := p.Execute(context.Background(), cfg, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown Liqo action")
}

func TestOCMExecute_UnknownAction(t *testing.T) {
	p := &ocmProvider{}
	cfg := &rest.Config{Host: "https://fake:6443"}
	req := federation.ActionRequest{ActionID: "ocm.bogus"}

	_, err := p.Execute(context.Background(), cfg, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown OCM action")
}

// ────────────────────────────────────────────────────────────────────────────
// Actions() descriptors — verify each provider returns non-empty
// ────────────────────────────────────────────────────────────────────────────

func TestClusternetActions_ReturnsDescriptors(t *testing.T) {
	p := &clusternetProvider{}
	actions := p.Actions()
	require.NotEmpty(t, actions)
	for _, a := range actions {
		assert.Equal(t, federation.ProviderClusternet, a.Provider)
		assert.NotEmpty(t, a.ID)
		assert.NotEmpty(t, a.Label)
		assert.NotEmpty(t, a.Verb)
	}
}

func TestCAPIActions_ReturnsDescriptors(t *testing.T) {
	p := &capiProvider{}
	actions := p.Actions()
	require.NotEmpty(t, actions)
	for _, a := range actions {
		assert.Equal(t, federation.ProviderCAPI, a.Provider)
		assert.NotEmpty(t, a.ID)
	}
}

func TestKarmadaActions_ReturnsDescriptors(t *testing.T) {
	p := &karmadaProvider{}
	actions := p.Actions()
	require.NotEmpty(t, actions)
	for _, a := range actions {
		assert.Equal(t, federation.ProviderKarmada, a.Provider)
		assert.NotEmpty(t, a.ID)
	}
}

func TestKubeAdmiralActions_ReturnsDescriptors(t *testing.T) {
	p := &kubeAdmiralProvider{}
	actions := p.Actions()
	require.NotEmpty(t, actions)
	for _, a := range actions {
		assert.Equal(t, federation.ProviderKubeAdmiral, a.Provider)
		assert.NotEmpty(t, a.ID)
	}
}

// ────────────────────────────────────────────────────────────────────────────
// safeInt64ToInt32 — additional overflow boundary tests
// ────────────────────────────────────────────────────────────────────────────

func TestSafeInt64ToInt32_MaxInt32(t *testing.T) {
	assert.Equal(t, int32(math.MaxInt32), safeInt64ToInt32(math.MaxInt32))
}

func TestSafeInt64ToInt32_OverflowAbove(t *testing.T) {
	assert.Equal(t, int32(math.MaxInt32), safeInt64ToInt32(math.MaxInt32+1))
}

func TestSafeInt64ToInt32_MinInt32(t *testing.T) {
	assert.Equal(t, int32(math.MinInt32), safeInt64ToInt32(math.MinInt32))
}

func TestSafeInt64ToInt32_OverflowBelow(t *testing.T) {
	assert.Equal(t, int32(math.MinInt32), safeInt64ToInt32(math.MinInt32-1))
}

func TestSafeInt64ToInt32_Zero(t *testing.T) {
	assert.Equal(t, int32(0), safeInt64ToInt32(0))
}

func TestSafeInt64ToInt32_Normal(t *testing.T) {
	assert.Equal(t, int32(42), safeInt64ToInt32(42))
	assert.Equal(t, int32(-100), safeInt64ToInt32(-100))
}
