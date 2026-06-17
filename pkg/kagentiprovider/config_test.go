package kagentiprovider

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestKubernetesConfigManager_GetStatus(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
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
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: defaultKagentiLLMSecretName, Namespace: "kagenti-system"},
			Data: map[string][]byte{
				"OPENAI_API_KEY":    []byte("sk-openai"),
				"ANTHROPIC_API_KEY": []byte("sk-anthropic"),
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus returned error: %v", err)
	}
	if status.LLMProvider != "openai" {
		t.Fatalf("expected provider openai, got %q", status.LLMProvider)
	}
	if !status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be true")
	}
	if len(status.ConfiguredProviders) != 2 {
		t.Fatalf("expected two configured providers, got %v", status.ConfiguredProviders)
	}
}

func TestKubernetesConfigManager_UpdateConfig(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{
						Containers: []corev1.Container{{Name: "backend"}},
					},
				},
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.UpdateConfig(context.Background(), ConfigUpdate{
		LLMProvider: "gemini",
		APIKey:      "gemini-secret",
	})
	if err != nil {
		t.Fatalf("UpdateConfig returned error: %v", err)
	}
	if status.LLMProvider != "gemini" {
		t.Fatalf("expected provider gemini, got %q", status.LLMProvider)
	}
	if !status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be true")
	}

	secret, err := client.CoreV1().Secrets("kagenti-system").Get(context.Background(), defaultKagentiLLMSecretName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to read secret: %v", err)
	}
	if got := string(secret.Data["GEMINI_API_KEY"]); got != "gemini-secret" {
		t.Fatalf("expected GEMINI_API_KEY to be updated, got %q", got)
	}

	deployment, err := client.AppsV1().Deployments("kagenti-system").Get(context.Background(), "kagenti-backend", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to read deployment: %v", err)
	}
	if got := extractLLMProvider(deployment); got != "gemini" {
		t.Fatalf("expected deployment provider gemini, got %q", got)
	}
	if deployment.Spec.Template.Annotations[rolloutRestartAnnotation] == "" {
		t.Fatal("expected rollout annotation to be set")
	}
}

func TestKubernetesConfigManager_UpdateConfigRequiresKey(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "backend"}}},
				},
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai"})
	if err == nil {
		t.Fatal("expected error when no key is available")
	}
	if !errors.Is(err, ErrAPIKeyRequired) {
		t.Fatalf("expected ErrAPIKeyRequired, got %v", err)
	}
}

func TestUpdateConfig_UnsupportedProvider(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "backend"}}},
				},
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "invalid-llm", APIKey: "any-key"})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrUnsupportedLLMProvider)
}

func TestUpdateConfig_ExistingSecretNoNewKey(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "backend"}}},
				},
			},
		},
		// ResourceVersion must be non-empty so UpdateConfig takes the Update path
		// instead of trying to Create (which would fail with "already exists").
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: defaultKagentiLLMSecretName, Namespace: "kagenti-system", ResourceVersion: "1"},
			Data:       map[string][]byte{"OPENAI_API_KEY": []byte("existing-key")},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	// When the secret already holds the provider's API key, callers may omit
	// APIKey in the update request and the existing key is preserved.
	status, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: ""})
	require.NoError(t, err)
	assert.Equal(t, "openai", status.LLMProvider)
	assert.True(t, status.APIKeyConfigured)
}

func TestUpdateConfig_ExistingSecretNoKeyForProvider(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "backend"}}},
				},
			},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: defaultKagentiLLMSecretName, Namespace: "kagenti-system"},
			Data:       map[string][]byte{"OPENAI_API_KEY": []byte("existing-key")},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	// Secret exists but has no anthropic key; empty APIKey should fail.
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "anthropic", APIKey: ""})
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrAPIKeyRequired)
}

func TestSetDeploymentLLMProvider_NoContainers(t *testing.T) {
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "no-containers", Namespace: "ns"},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{},
			},
		},
	}
	err := setDeploymentLLMProvider(deployment, "openai")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no containers")
}

func TestSetDeploymentLLMProvider_UpdateExistingEnv(t *testing.T) {
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "my-deploy", Namespace: "ns"},
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

	err := setDeploymentLLMProvider(deployment, "anthropic")
	require.NoError(t, err)

	container := deployment.Spec.Template.Spec.Containers[0]
	// Verify the env var was updated in-place rather than appended: a duplicate
	// LLM_PROVIDER entry would cause undefined behaviour in the pod (two values
	// for the same env var, last-write-wins depending on the container runtime).
	count := 0
	val := ""
	for _, env := range container.Env {
		if env.Name == llmProviderEnvVarName {
			count++
			val = env.Value
		}
	}
	assert.Equal(t, 1, count, "LLM_PROVIDER should appear exactly once")
	assert.Equal(t, "anthropic", val)
}

func TestExtractLLMProvider_NoEnvVar(t *testing.T) {
	deployment := &appsv1.Deployment{
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name: "backend",
						Env:  []corev1.EnvVar{{Name: "OTHER_VAR", Value: "value"}},
					}},
				},
			},
		},
	}
	assert.Equal(t, "", extractLLMProvider(deployment))
}

func TestExtractLLMProvider_MultipleContainers(t *testing.T) {
	deployment := &appsv1.Deployment{
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{Name: "sidecar"},
						{Name: "backend", Env: []corev1.EnvVar{{Name: llmProviderEnvVarName, Value: "gemini"}}},
					},
				},
			},
		},
	}
	assert.Equal(t, "gemini", extractLLMProvider(deployment))
}

// newDeployment is a helper to build a minimal Deployment for config tests.
func newDeployment(name, namespace, provider string) *appsv1.Deployment {
	env := []corev1.EnvVar{}
	if provider != "" {
		env = append(env, corev1.EnvVar{Name: llmProviderEnvVarName, Value: provider})
	}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Name: "backend", Env: env}},
				},
			},
		},
	}
}

// TestGetStatus_DeploymentNotFound verifies GetStatus propagates a deployment
// Get error (e.g. the deployment does not exist yet).
func TestGetStatus_DeploymentNotFound(t *testing.T) {
	client := fake.NewSimpleClientset() // no deployment pre-loaded
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	_, err := manager.GetStatus(context.Background())
	require.Error(t, err)
}

// TestGetStatus_NoLLMProvider verifies that when the deployment carries no
// LLM_PROVIDER env var the returned status has an empty provider and
// APIKeyConfigured=false (exercises the stringSliceContains("", …) early-return).
func TestGetStatus_NoLLMProvider(t *testing.T) {
	client := fake.NewSimpleClientset(newDeployment("kagenti-backend", "kagenti-system", ""))
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	status, err := manager.GetStatus(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "", status.LLMProvider)
	assert.False(t, status.APIKeyConfigured)
}

// TestGetStatus_SecretGetError verifies GetStatus surfaces a non-NotFound secret
// error from getConfiguredProviders.
func TestGetStatus_SecretGetError(t *testing.T) {
	client := fake.NewSimpleClientset(newDeployment("kagenti-backend", "kagenti-system", "openai"))
	client.PrependReactor("get", "secrets", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("etcd connection refused")
	})
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	_, err := manager.GetStatus(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "etcd connection refused")
}

// TestGetStatus_ProviderNotConfigured verifies that when the deployment's
// LLM_PROVIDER is set but has no corresponding secret key the status reflects
// APIKeyConfigured=false, exercising the stringSliceContains "not found in
// non-empty slice" return-false path.
func TestGetStatus_ProviderNotConfigured(t *testing.T) {
	client := fake.NewSimpleClientset(
		newDeployment("kagenti-backend", "kagenti-system", "gemini"),
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: defaultKagentiLLMSecretName, Namespace: "kagenti-system"},
			Data:       map[string][]byte{"OPENAI_API_KEY": []byte("sk-openai")},
		},
	)
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	status, err := manager.GetStatus(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "gemini", status.LLMProvider)
	assert.False(t, status.APIKeyConfigured)
}

// TestUpdateConfig_DeploymentGetError verifies UpdateConfig returns an error when
// the deployment cannot be fetched after the secret is written.
func TestUpdateConfig_DeploymentGetError(t *testing.T) {
	client := fake.NewSimpleClientset() // no deployment
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	// Secret doesn't exist so a new one will be created; deployment Get then fails
	// with "not found" because no deployment was pre-loaded.
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-test"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "kagenti-backend")
}

// TestUpdateConfig_SecretGetError verifies UpdateConfig surfaces a non-NotFound
// error when reading the secret fails.
func TestUpdateConfig_SecretGetError(t *testing.T) {
	client := fake.NewSimpleClientset(newDeployment("kagenti-backend", "kagenti-system", "openai"))
	client.PrependReactor("get", "secrets", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("etcd unavailable")
	})
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-test"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "etcd unavailable")
}

// TestUpdateConfig_DeploymentUpdateError verifies UpdateConfig surfaces a
// deployment Update error.
func TestUpdateConfig_DeploymentUpdateError(t *testing.T) {
	client := fake.NewSimpleClientset(newDeployment("kagenti-backend", "kagenti-system", "openai"))
	client.PrependReactor("update", "deployments", func(action ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("deployment update rejected")
	})
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai", APIKey: "sk-test"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "deployment update rejected")
}
