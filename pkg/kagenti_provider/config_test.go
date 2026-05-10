package kagenti_provider

import (
	"context"
	"errors"
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
