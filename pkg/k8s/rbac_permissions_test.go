package k8s

import (
	"context"
	"errors"
	"testing"

	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

const testRBACPermissionsCluster = "rbac-permissions-cluster"

func newRBACPermissionsClient(clientset *k8sfake.Clientset) *MultiClusterClient {
	client := &MultiClusterClient{}
	client.SetClient(testRBACPermissionsCluster, clientset)
	return client
}

func TestCheckPodExecPermissionForUser_RejectsMissingTarget(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		namespace string
		podName   string
	}{
		{name: "missing namespace", namespace: "", podName: "api-0"},
		{name: "missing pod name", namespace: "team-a", podName: ""},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			clientset := k8sfake.NewSimpleClientset()
			sarCalled := false
			clientset.PrependReactor("create", "subjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
				sarCalled = true
				return true, &authv1.SubjectAccessReview{}, nil
			})

			client := newRBACPermissionsClient(clientset)

			allowed, reason, err := client.CheckPodExecPermissionForUser(
				context.Background(),
				testRBACPermissionsCluster,
				"github:alice",
				[]string{"team-a", "platform"},
				tc.namespace,
				tc.podName,
			)

			require.NoError(t, err)
			assert.False(t, allowed)
			assert.Equal(t, "missing namespace or pod name", reason)
			assert.False(t, sarCalled)
		})
	}
}

func TestCheckPodExecPermissionForUser_PropagatesGroups(t *testing.T) {
	t.Parallel()

	const (
		testNamespace = "team-a"
		testPodName   = "api-0"
	)

	clientset := k8sfake.NewSimpleClientset()
	var captured *authv1.SubjectAccessReview
	clientset.PrependReactor("create", "subjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		createAction := action.(k8stesting.CreateAction)
		captured = createAction.GetObject().(*authv1.SubjectAccessReview).DeepCopy()
		return true, &authv1.SubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{
				Allowed: true,
				Reason:  "bound via clusterrole",
			},
		}, nil
	})

	client := newRBACPermissionsClient(clientset)
	allowed, reason, err := client.CheckPodExecPermissionForUser(
		context.Background(),
		testRBACPermissionsCluster,
		"github:alice",
		[]string{"team-a", "platform"},
		testNamespace,
		testPodName,
	)

	require.NoError(t, err)
	require.True(t, allowed)
	assert.Equal(t, "bound via clusterrole", reason)
	require.NotNil(t, captured)
	assert.Equal(t, []string{"team-a", "platform"}, captured.Spec.Groups)
	assert.Equal(t, testNamespace, captured.Spec.ResourceAttributes.Namespace)
	assert.Equal(t, testPodName, captured.Spec.ResourceAttributes.Name)
}

func TestGetClusterPermissions_IgnoresIndividualReviewErrors(t *testing.T) {
	t.Parallel()

	clientset := k8sfake.NewSimpleClientset()
	clientset.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		createAction := action.(k8stesting.CreateAction)
		review := createAction.GetObject().(*authv1.SelfSubjectAccessReview)
		attrs := review.Spec.ResourceAttributes

		switch {
		case attrs.Verb == "*" && attrs.Resource == "*" && attrs.Group == "*":
			return true, nil, errors.New("admin review failed")
		case attrs.Verb == "create" && attrs.Resource == "serviceaccounts":
			return true, &authv1.SelfSubjectAccessReview{
				Status: authv1.SubjectAccessReviewStatus{Allowed: true},
			}, nil
		case attrs.Verb == "create" && attrs.Resource == "rolebindings":
			return true, nil, errors.New("rolebinding review failed")
		case attrs.Verb == "get" && attrs.Resource == "secrets":
			return true, &authv1.SelfSubjectAccessReview{
				Status: authv1.SubjectAccessReviewStatus{Allowed: false},
			}, nil
		default:
			return false, nil, nil
		}
	})

	client := newRBACPermissionsClient(clientset)
	perms, err := client.GetClusterPermissions(context.Background(), testRBACPermissionsCluster)

	require.NoError(t, err)
	require.NotNil(t, perms)
	assert.Equal(t, testRBACPermissionsCluster, perms.Cluster)
	assert.False(t, perms.IsClusterAdmin)
	assert.True(t, perms.CanCreateSA)
	assert.False(t, perms.CanManageRBAC)
	assert.False(t, perms.CanViewSecrets)
}

func TestCheckCanI_UsesFullRequestAndWrapsErrors(t *testing.T) {
	t.Parallel()

	t.Run("success", func(t *testing.T) {
		t.Parallel()

		clientset := k8sfake.NewSimpleClientset()
		var captured *authv1.SelfSubjectAccessReview
		clientset.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			createAction := action.(k8stesting.CreateAction)
			captured = createAction.GetObject().(*authv1.SelfSubjectAccessReview).DeepCopy()
			return true, &authv1.SelfSubjectAccessReview{
				Status: authv1.SubjectAccessReviewStatus{
					Allowed: true,
					Reason:  "matched named resource rule",
				},
			}, nil
		})

		client := newRBACPermissionsClient(clientset)
		result, err := client.CheckCanI(context.Background(), testRBACPermissionsCluster, models.CanIRequest{
			Verb:        "get",
			Resource:    "pods",
			Namespace:   "team-a",
			Group:       "",
			Subresource: "log",
			Name:        "api-0",
		})

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.True(t, result.Allowed)
		assert.Equal(t, "matched named resource rule", result.Reason)
		require.NotNil(t, captured)
		assert.Equal(t, "get", captured.Spec.ResourceAttributes.Verb)
		assert.Equal(t, "pods", captured.Spec.ResourceAttributes.Resource)
		assert.Equal(t, "team-a", captured.Spec.ResourceAttributes.Namespace)
		assert.Equal(t, "log", captured.Spec.ResourceAttributes.Subresource)
		assert.Equal(t, "api-0", captured.Spec.ResourceAttributes.Name)
	})

	t.Run("error", func(t *testing.T) {
		t.Parallel()

		clientset := k8sfake.NewSimpleClientset()
		clientset.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, errors.New("apiserver unavailable")
		})

		client := newRBACPermissionsClient(clientset)
		result, err := client.CheckCanI(context.Background(), testRBACPermissionsCluster, models.CanIRequest{
			Verb:     "list",
			Resource: "deployments",
		})

		require.Nil(t, result)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to perform access review")
		assert.Contains(t, err.Error(), "apiserver unavailable")
	})
}

func TestGetPermissionsSummary_FallsBackToAccessibleNamespaces(t *testing.T) {
	t.Parallel()

	const accessibleNamespace = "team-a"

	clientset := k8sfake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: accessibleNamespace}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
	)
	clientset.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		createAction := action.(k8stesting.CreateAction)
		review := createAction.GetObject().(*authv1.SelfSubjectAccessReview)
		attrs := review.Spec.ResourceAttributes

		allowed := false
		switch {
		case attrs.Verb == "list" && attrs.Resource == "nodes":
			allowed = true
		case attrs.Verb == "create" && attrs.Resource == "rolebindings":
			allowed = true
		case attrs.Verb == "list" && attrs.Resource == "pods" && attrs.Namespace == accessibleNamespace:
			allowed = true
		}

		return true, &authv1.SelfSubjectAccessReview{
			Status: authv1.SubjectAccessReviewStatus{Allowed: allowed},
		}, nil
	})

	client := newRBACPermissionsClient(clientset)
	ctx := WithUserNamespace(context.Background(), accessibleNamespace)

	summary, err := client.GetPermissionsSummary(ctx, testRBACPermissionsCluster)

	require.NoError(t, err)
	require.NotNil(t, summary)
	assert.Equal(t, testRBACPermissionsCluster, summary.Cluster)
	assert.False(t, summary.IsClusterAdmin)
	assert.True(t, summary.CanListNodes)
	assert.False(t, summary.CanListNamespaces)
	assert.False(t, summary.CanCreateNamespaces)
	assert.True(t, summary.CanManageRBAC)
	assert.False(t, summary.CanViewSecrets)
	assert.Equal(t, []string{accessibleNamespace}, summary.AccessibleNamespaces)
}
