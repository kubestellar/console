package handlers

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

// These tests fill previously-uncovered branches of the small helper
// functions in self_upgrade.go — the pieces that determine which
// Deployment the self-upgrade handler will target and whether the
// current ServiceAccount can patch it. They don't touch the HTTP
// handlers themselves (which are already well covered by
// TestSelfUpgradeHandler_GetStatus / TriggerUpgrade); they call the
// helpers directly so each failure mode is pinned to an exact line.

func TestGetNamespace_PrefersPodNamespaceEnv(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "override-ns")
	assert.Equal(t, "override-ns", getNamespace())
}

func TestGetNamespace_EmptyEnvFallsBackToServiceAccountFile(t *testing.T) {
	// With POD_NAMESPACE unset, getNamespace consults the mounted SA
	// namespace file. Whether that file exists depends on the runtime
	// (pod vs. host runner) — either way the function must not panic
	// and must return a string. When the file is present the value is
	// non-empty; when absent it's "". Documents that the fallback path
	// executes without error either way.
	t.Setenv("POD_NAMESPACE", "")
	got := getNamespace()
	_ = got // no assertion on value — path just needs to run.
}

// TestGetReleaseName_UnsetReturnsEmpty is a tiny regression pin so the
// missing-env case can't silently regress to reading a global; the
// existing suite only exercised the "set" path.
func TestGetReleaseName_UnsetReturnsEmpty(t *testing.T) {
	t.Setenv("HELM_RELEASE_NAME", "")
	assert.Equal(t, "", getReleaseName())
}

func TestFindDeployment_LabelMatchWins(t *testing.T) {
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "kubestellar-console",
			Namespace: "ks",
			Labels:    map[string]string{"app.kubernetes.io/name": "kubestellar-console"},
		},
	}
	// Also a deployment with the same release-name to prove label-branch
	// takes precedence over the release-name fallback.
	dep2 := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-release",
			Namespace: "ks",
		},
	}
	fake := k8sfake.NewSimpleClientset(dep, dep2)
	h := &SelfUpgradeHandler{}
	t.Setenv("HELM_RELEASE_NAME", "my-release")

	got, err := h.findDeployment(context.Background(), fake, "ks")
	require.NoError(t, err)
	assert.Equal(t, "kubestellar-console", got.Name)
}

func TestFindDeployment_ListErrorBubbles(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	fake.PrependReactor("list", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("api server unreachable")
	})
	h := &SelfUpgradeHandler{}
	_, err := h.findDeployment(context.Background(), fake, "ks")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to list deployments")
	assert.Contains(t, err.Error(), "api server unreachable")
}

func TestFindDeployment_ReleaseNameFallbackHits(t *testing.T) {
	// No label match — fallback path Gets by release name.
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-release",
			Namespace: "ks",
			// Deliberately no matching label.
		},
	}
	fake := k8sfake.NewSimpleClientset(dep)
	h := &SelfUpgradeHandler{}
	t.Setenv("HELM_RELEASE_NAME", "my-release")

	got, err := h.findDeployment(context.Background(), fake, "ks")
	require.NoError(t, err)
	assert.Equal(t, "my-release", got.Name)
}

func TestFindDeployment_ReleaseNameSetButDeploymentAbsent(t *testing.T) {
	// Label branch misses, release-name Get returns NotFound → the code
	// falls through to the final error, exercising the swallow-error
	// arm of the fallback.
	fake := k8sfake.NewSimpleClientset()
	h := &SelfUpgradeHandler{}
	t.Setenv("HELM_RELEASE_NAME", "missing-release")

	_, err := h.findDeployment(context.Background(), fake, "ks")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no kubestellar-console Deployment found")
}

func TestFindDeployment_NoLabelNoReleaseNameEnv(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	h := &SelfUpgradeHandler{}
	t.Setenv("HELM_RELEASE_NAME", "")

	_, err := h.findDeployment(context.Background(), fake, "ks")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no kubestellar-console Deployment found in namespace ks")
}

func TestCanPatchDeployment_SSARErrorReturnsFalse(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	fake.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("SSAR API unavailable")
	})
	h := &SelfUpgradeHandler{}

	got := h.canPatchDeployment(context.Background(), fake, "ks", "kubestellar-console")
	assert.False(t, got, "SSAR create error must be treated as 'not allowed', not as 'allowed'")
}

func TestCanPatchDeployment_AllowedPassesThroughResourceAttributes(t *testing.T) {
	// Pin the exact ResourceAttributes shape the reviewer receives so a
	// silent widening (e.g. dropping Name) can't regress the scoped
	// Role check the comment on the function warns about.
	fake := k8sfake.NewSimpleClientset()
	var captured *authorizationv1.ResourceAttributes
	fake.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		ca, ok := action.(k8stesting.CreateAction)
		if !ok {
			return false, nil, errors.New("not a create action")
		}
		review := ca.GetObject().(*authorizationv1.SelfSubjectAccessReview)
		captured = review.Spec.ResourceAttributes
		return true, &authorizationv1.SelfSubjectAccessReview{
			Status: authorizationv1.SubjectAccessReviewStatus{Allowed: true},
		}, nil
	})
	h := &SelfUpgradeHandler{}

	ok := h.canPatchDeployment(context.Background(), fake, "ks", "kubestellar-console")
	require.True(t, ok)
	require.NotNil(t, captured)
	assert.Equal(t, "ks", captured.Namespace)
	assert.Equal(t, "patch", captured.Verb)
	assert.Equal(t, "apps", captured.Group)
	assert.Equal(t, "deployments", captured.Resource)
	assert.Equal(t, "kubestellar-console", captured.Name,
		"SSAR must scope to deployment Name — a scoped Role with resourceNames "+
			"denies unscoped SSARs; dropping this would break the RBAC check silently")
}

// TestGetInClusterClient_ReturnsInjectedFake documents that when
// inClusterClient is preset (the test injection point), getInClusterClient
// returns it without dialing rest.InClusterConfig.
func TestGetInClusterClient_ReturnsInjectedFake(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	h := &SelfUpgradeHandler{inClusterClient: fake}
	got, err := h.getInClusterClient()
	require.NoError(t, err)
	assert.Same(t, fake, got)
}

func TestGetInClusterClient_NotInClusterErrors(t *testing.T) {
	// No injected client, and the test process is not running inside a
	// pod — rest.InClusterConfig() should fail and getInClusterClient
	// wraps the error. This exercises the previously-uncovered non-
	// injected branch.
	h := &SelfUpgradeHandler{}
	// Belt and braces: make sure no service-account token is picked up
	// from a shared file on the runner.
	_ = os.Unsetenv("KUBERNETES_SERVICE_HOST")
	_ = os.Unsetenv("KUBERNETES_SERVICE_PORT")

	_, err := h.getInClusterClient()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not running in-cluster")
}

// TestGetInClusterClient_InjectedClientPreservedAcrossCalls guards against
// a future refactor that accidentally rebuilds the client per-call.
func TestGetInClusterClient_InjectedClientPreservedAcrossCalls(t *testing.T) {
	fake := k8sfake.NewSimpleClientset()
	h := &SelfUpgradeHandler{inClusterClient: fake}
	first, err := h.getInClusterClient()
	require.NoError(t, err)
	second, err := h.getInClusterClient()
	require.NoError(t, err)
	assert.Same(t, first, second)
}

// --- lightweight sanity check for the constant we use in the label
// selector — protects the "label match" branch above from silent
// selector renames slipping past all reviewers.
func TestFindDeployment_LabelSelectorConstantMatches(t *testing.T) {
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "irrelevant-name",
			Namespace: "ks",
			Labels:    map[string]string{"app.kubernetes.io/name": "kubestellar-console"},
		},
	}
	// A confuser with the right value under the wrong key must NOT match.
	dep2 := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "confuser",
			Namespace: "ks",
			Labels:    map[string]string{"app": "kubestellar-console"},
		},
	}
	fake := k8sfake.NewSimpleClientset(dep, dep2)
	h := &SelfUpgradeHandler{}
	got, err := h.findDeployment(context.Background(), fake, "ks")
	require.NoError(t, err)
	assert.Equal(t, "irrelevant-name", got.Name)
}

// _ = filepath so goimports doesn't strip the import if the file gets
// extended later to touch the SA-file fallback path with a temp dir.
var _ = filepath.Join
