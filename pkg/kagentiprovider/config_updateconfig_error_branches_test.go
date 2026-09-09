package kagentiprovider

import (
	"context"
	"errors"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

// These tests cover UpdateConfig error branches that were previously uncovered:
// - Secret Get returns a non-NotFound error
// - Secret Create returns an error (secret did not previously exist)
// - Secret Update returns an error (secret existed)
// - Deployment Get returns an error after secret write
// - Deployment Update returns an error
// - setDeploymentLLMProvider returns an error via UpdateConfig (deployment with no containers)

const (
	updErrNamespace  = "kagenti-system"
	updErrDeployment = "kagenti-backend"
)

func newDeploymentForUpdate() *appsv1.Deployment {
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: updErrDeployment, Namespace: updErrNamespace},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name: "backend",
						Env:  []corev1.EnvVar{{Name: llmProviderEnvVarName, Value: "openai"}},
					}},
				},
			},
		},
	}
}

func TestUpdateConfig_SecretGetNonNotFoundError(t *testing.T) {
	client := fake.NewSimpleClientset(newDeploymentForUpdate())
	client.PrependReactor("get", "secrets", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewInternalError(errors.New("boom"))
	})

	manager := newKubernetesConfigManager(client, updErrNamespace, updErrDeployment, defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-new"})
	if err == nil {
		t.Fatal("expected error from secret Get, got nil")
	}
	if apierrors.IsNotFound(err) {
		t.Fatalf("expected non-NotFound error, got NotFound: %v", err)
	}
}

func TestUpdateConfig_SecretCreateError(t *testing.T) {
	// No secret preloaded → NotFound path → Create → error injected here.
	client := fake.NewSimpleClientset(newDeploymentForUpdate())
	client.PrependReactor("create", "secrets", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("create denied")
	})

	manager := newKubernetesConfigManager(client, updErrNamespace, updErrDeployment, defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-new"})
	if err == nil || err.Error() != "create denied" {
		t.Fatalf("expected create denied error, got %v", err)
	}
}

func TestUpdateConfig_SecretUpdateError(t *testing.T) {
	client := fake.NewSimpleClientset(
		newDeploymentForUpdate(),
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       updErrNamespace,
				ResourceVersion: "1",
			},
			Data: map[string][]byte{"OPENAI_API_KEY": []byte("sk-old")},
		},
	)
	client.PrependReactor("update", "secrets", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("update denied")
	})

	manager := newKubernetesConfigManager(client, updErrNamespace, updErrDeployment, defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-new"})
	if err == nil || err.Error() != "update denied" {
		t.Fatalf("expected update denied error, got %v", err)
	}
}

func TestUpdateConfig_DeploymentGetError(t *testing.T) {
	client := fake.NewSimpleClientset(
		newDeploymentForUpdate(),
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       updErrNamespace,
				ResourceVersion: "1",
			},
			Data: map[string][]byte{"OPENAI_API_KEY": []byte("sk-old")},
		},
	)
	client.PrependReactor("get", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("deployment get failed")
	})

	manager := newKubernetesConfigManager(client, updErrNamespace, updErrDeployment, defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-new"})
	if err == nil || err.Error() != "deployment get failed" {
		t.Fatalf("expected deployment get failed, got %v", err)
	}
}

func TestUpdateConfig_DeploymentUpdateError(t *testing.T) {
	client := fake.NewSimpleClientset(
		newDeploymentForUpdate(),
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       updErrNamespace,
				ResourceVersion: "1",
			},
			Data: map[string][]byte{"OPENAI_API_KEY": []byte("sk-old")},
		},
	)
	client.PrependReactor("update", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("deployment update denied")
	})

	manager := newKubernetesConfigManager(client, updErrNamespace, updErrDeployment, defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-new"})
	if err == nil || err.Error() != "deployment update denied" {
		t.Fatalf("expected deployment update denied, got %v", err)
	}
}

func TestUpdateConfig_DeploymentNoContainersReturnsError(t *testing.T) {
	// Deployment with no containers → setDeploymentLLMProvider returns an error
	// from within UpdateConfig (previously exercised only via a direct helper test).
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: updErrDeployment, Namespace: updErrNamespace},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{Spec: corev1.PodSpec{}},
			},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       updErrNamespace,
				ResourceVersion: "1",
			},
			Data: map[string][]byte{"OPENAI_API_KEY": []byte("sk-old")},
		},
	)

	manager := newKubernetesConfigManager(client, updErrNamespace, updErrDeployment, defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-new"})
	if err == nil {
		t.Fatal("expected error from deployment with no containers, got nil")
	}
}

// Silence unused-import check when schema is unused above; keep for future
// reactors that need typed GroupResource errors.
var _ = schema.GroupResource{}
