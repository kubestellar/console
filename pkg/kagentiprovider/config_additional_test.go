package kagentiprovider

import (
	"context"
	"errors"
	"os"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestNewKubernetesConfigManagerFromEnv(t *testing.T) {
	originalHost, hasHost := os.LookupEnv("KUBERNETES_SERVICE_HOST")
	originalPort, hasPort := os.LookupEnv("KUBERNETES_SERVICE_PORT")
	t.Cleanup(func() {
		if hasHost {
			t.Setenv("KUBERNETES_SERVICE_HOST", originalHost)
		} else {
			_ = os.Unsetenv("KUBERNETES_SERVICE_HOST")
		}
		if hasPort {
			t.Setenv("KUBERNETES_SERVICE_PORT", originalPort)
		} else {
			_ = os.Unsetenv("KUBERNETES_SERVICE_PORT")
		}
	})

	_ = os.Unsetenv("KUBERNETES_SERVICE_HOST")
	_ = os.Unsetenv("KUBERNETES_SERVICE_PORT")

	manager, err := NewKubernetesConfigManagerFromEnv()
	if err == nil {
		t.Fatalf("expected in-cluster config error, got manager %#v", manager)
	}
}

func TestKubernetesConfigManagerGetStatusWithoutMatchingKey(t *testing.T) {
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
				"ANTHROPIC_API_KEY": []byte("sk-anthropic"),
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus returned error: %v", err)
	}
	if status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be false")
	}
}

func TestKubernetesConfigManagerGetStatusWithoutSecret(t *testing.T) {
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
	status, err := manager.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus returned error: %v", err)
	}
	if status.LLMProvider != "" {
		t.Fatalf("expected empty provider, got %q", status.LLMProvider)
	}
	if status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to be false")
	}
	if len(status.ConfiguredProviders) != 0 {
		t.Fatalf("expected no configured providers, got %v", status.ConfiguredProviders)
	}
}

func TestKubernetesConfigManagerUpdateConfigUnsupportedProvider(t *testing.T) {
	manager := newKubernetesConfigManager(fake.NewSimpleClientset(), "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)

	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "unknown"})
	if err == nil {
		t.Fatal("expected unsupported provider error")
	}
	if !errors.Is(err, ErrUnsupportedLLMProvider) {
		t.Fatalf("expected ErrUnsupportedLLMProvider, got %v", err)
	}
}

func TestKubernetesConfigManagerUpdateConfigRequiresExistingProviderKey(t *testing.T) {
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
			Data: map[string][]byte{
				"GEMINI_API_KEY": []byte("gemini-secret"),
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	_, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai"})
	if err == nil {
		t.Fatal("expected error when selected provider has no stored key")
	}
	if !errors.Is(err, ErrAPIKeyRequired) {
		t.Fatalf("expected ErrAPIKeyRequired, got %v", err)
	}
}

func TestKubernetesConfigManagerUpdateConfigReusesExistingKey(t *testing.T) {
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
			ObjectMeta: metav1.ObjectMeta{
				Name:            defaultKagentiLLMSecretName,
				Namespace:       "kagenti-system",
				ResourceVersion: "1",
			},
			Data: map[string][]byte{
				"OPENAI_API_KEY": []byte("existing-openai-key"),
			},
		},
	)

	manager := newKubernetesConfigManager(client, "kagenti-system", "kagenti-backend", defaultKagentiLLMSecretName)
	status, err := manager.UpdateConfig(context.Background(), ConfigUpdate{LLMProvider: "openai"})
	if err != nil {
		t.Fatalf("UpdateConfig returned error: %v", err)
	}
	if !status.APIKeyConfigured {
		t.Fatal("expected APIKeyConfigured to remain true")
	}
	if status.LLMProvider != "openai" {
		t.Fatalf("expected provider openai, got %q", status.LLMProvider)
	}
}

func TestSetDeploymentLLMProviderNoContainers(t *testing.T) {
	deployment := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "kagenti-backend", Namespace: "kagenti-system"}}

	err := setDeploymentLLMProvider(deployment, "openai")
	if err == nil {
		t.Fatal("expected error for empty container list")
	}
}

func TestSetDeploymentLLMProviderUpdatesExistingEnv(t *testing.T) {
	deployment := &appsv1.Deployment{
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
	}

	if err := setDeploymentLLMProvider(deployment, "anthropic"); err != nil {
		t.Fatalf("setDeploymentLLMProvider returned error: %v", err)
	}
	if got := extractLLMProvider(deployment); got != "anthropic" {
		t.Fatalf("expected provider anthropic, got %q", got)
	}
	if deployment.Spec.Template.Annotations[rolloutRestartAnnotation] == "" {
		t.Fatal("expected rollout annotation to be set")
	}
}

func TestStringSliceContains(t *testing.T) {
	if stringSliceContains([]string{"openai"}, "") {
		t.Fatal("expected empty target to return false")
	}
	if stringSliceContains([]string{"openai"}, "anthropic") {
		t.Fatal("expected missing target to return false")
	}
	if !stringSliceContains([]string{"openai", "anthropic"}, "anthropic") {
		t.Fatal("expected present target to return true")
	}
}
