package kagentiprovider

import (
	"context"
	"errors"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
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
	client := fake.NewSimpleClientset()
	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{
		LLMProvider: "unsupported-llm",
		APIKey:      "some-key",
	})
	if !errors.Is(err, ErrUnsupportedLLMProvider) {
		t.Fatalf("expected ErrUnsupportedLLMProvider, got %v", err)
	}
}

func TestUpdateConfig_SecretExistsNoKey(t *testing.T) {
	// Secret exists but has no key for the chosen provider; no new key supplied.
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
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       "kagenti-system",
				ResourceVersion: "1",
			},
			Data: map[string][]byte{},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai"})
	if !errors.Is(err, ErrAPIKeyRequired) {
		t.Fatalf("expected ErrAPIKeyRequired, got %v", err)
	}
}

func TestUpdateConfig_ReuseExistingKey(t *testing.T) {
	// Secret already has a key for the provider; a new API key is not required.
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
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       "kagenti-system",
				ResourceVersion: "1", // required so UpdateConfig calls Update, not Create
			},
			Data: map[string][]byte{"OPENAI_API_KEY": []byte("existing-key")},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai"})
	if err != nil {
		t.Fatalf("UpdateConfig returned error: %v", err)
	}
	if status.LLMProvider != "openai" {
		t.Fatalf("expected provider openai, got %q", status.LLMProvider)
	}
	if !status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be true")
	}
}

func TestGetStatus_DeploymentNotFound(t *testing.T) {
	client := fake.NewSimpleClientset()
	manager := newKubernetesConfigManager(client, "kagenti-system", "missing-deployment", defaultKagentiLLMSecretName)
	_, err := manager.GetStatus(context.Background())
	if err == nil {
		t.Fatal("expected error when deployment does not exist")
	}
}

func TestSetDeploymentLLMProvider_NoContainers(t *testing.T) {
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{Containers: []corev1.Container{}},
			},
		},
	}
	err := setDeploymentLLMProvider(deployment, "openai")
	if err == nil {
		t.Fatal("expected error for deployment with no containers")
	}
}

func TestExtractLLMProvider_NoMatchingEnvVar(t *testing.T) {
	deployment := &appsv1.Deployment{
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name: "backend",
						Env:  []corev1.EnvVar{{Name: "OTHER_VAR", Value: "other"}},
					}},
				},
			},
		},
	}
	got := extractLLMProvider(deployment)
	if got != "" {
		t.Fatalf("expected empty provider, got %q", got)
	}
}

func TestStringSliceContains_EmptyTarget(t *testing.T) {
	if stringSliceContains([]string{"a", "b"}, "") {
		t.Fatal("expected false for empty target")
	}
}

func TestStringSliceContains_NotInList(t *testing.T) {
	if stringSliceContains([]string{"a", "b"}, "c") {
		t.Fatal("expected false when target is not in list")
	}
}

func TestGetStatus_NoSecret(t *testing.T) {
	// Deployment exists but no secret — getConfiguredProviders handles NotFound → empty list.
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
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus returned error: %v", err)
	}
	if status.LLMProvider != "openai" {
		t.Fatalf("expected provider openai, got %q", status.LLMProvider)
	}
	if status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be false when no secret exists")
	}
	if len(status.ConfiguredProviders) != 0 {
		t.Fatalf("expected no configured providers, got %v", status.ConfiguredProviders)
	}
}

func TestUpdateConfig_SecretNilData(t *testing.T) {
	// Secret exists but has nil Data — UpdateConfig must initialise the map before writing.
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
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       "kagenti-system",
				ResourceVersion: "1",
			},
			Data: nil, // intentionally nil to exercise the make(map[string][]byte) branch
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.UpdateConfig(context.Background(), ConfigUpdate{
		LLMProvider: "anthropic",
		APIKey:      "sk-ant",
	})
	if err != nil {
		t.Fatalf("UpdateConfig returned error: %v", err)
	}
	if status.LLMProvider != "anthropic" {
		t.Fatalf("expected provider anthropic, got %q", status.LLMProvider)
	}
	if !status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be true")
	}
}

func TestSetDeploymentLLMProvider_UpdateExistingEnvVar(t *testing.T) {
	// Deployment already has LLM_PROVIDER set — setDeploymentLLMProvider must update it in-place.
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name: "backend",
						Env:  []corev1.EnvVar{{Name: llmProviderEnvVarName, Value: "anthropic"}},
					}},
				},
			},
		},
	}

	err := setDeploymentLLMProvider(deployment, "openai")
	if err != nil {
		t.Fatalf("setDeploymentLLMProvider returned error: %v", err)
	}
	if got := extractLLMProvider(deployment); got != "openai" {
		t.Fatalf("expected LLM_PROVIDER updated to openai, got %q", got)
	}
	// Verify the env slice length hasn't grown (update, not append).
	if n := len(deployment.Spec.Template.Spec.Containers[0].Env); n != 1 {
		t.Fatalf("expected 1 env var after update, got %d", n)
	}
}

// TestNewKubernetesConfigManagerFromEnv_Error verifies that the function returns
// an error when no in-cluster Kubernetes configuration is available (the normal
// case in unit-test environments).
func TestNewKubernetesConfigManagerFromEnv_Error(t *testing.T) {
	_, err := NewKubernetesConfigManagerFromEnv()
	if err == nil {
		// Only skip — don't fail — in case the test happens to run inside a real cluster.
		t.Skip("in-cluster config unexpectedly available; skipping error-path test")
	}
}

// TestUpdateConfig_SetDeploymentProviderError verifies that UpdateConfig propagates
// an error from setDeploymentLLMProvider when the deployment has no containers.
// This covers the error-return path after a successful secret update.
func TestUpdateConfig_SetDeploymentProviderError(t *testing.T) {
	client := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{Containers: []corev1.Container{}}, // no containers
				},
			},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       "kagenti-system",
				ResourceVersion: "1",
			},
			Data: map[string][]byte{"OPENAI_API_KEY": []byte("sk-existing")},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai"})
	if err == nil {
		t.Fatal("expected error when deployment has no containers")
	}
	if !strings.Contains(err.Error(), "no containers") {
		t.Fatalf("expected 'no containers' in error, got: %v", err)
	}
}
