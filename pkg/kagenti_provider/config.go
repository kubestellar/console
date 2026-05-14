package kagenti_provider

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

const (
	defaultKagentiDeploymentName = defaultKagentiServiceName
	defaultKagentiLLMSecretName  = "kagenti-llm-secrets"
	llmProviderEnvVarName        = "LLM_PROVIDER"
	rolloutRestartAnnotation     = "kubectl.kubernetes.io/restartedAt"
)

var (
	ErrUnsupportedLLMProvider = errors.New("unsupported llm provider")
	ErrAPIKeyRequired         = errors.New("api key required for selected provider")
)

var llmProviderAPIKeyEnvVars = map[string]string{
	"anthropic": "ANTHROPIC_API_KEY",
	"gemini":    "GEMINI_API_KEY",
	"openai":    "OPENAI_API_KEY",
}

// ConfigStatus describes the in-cluster Kagenti LLM configuration.
type ConfigStatus struct {
	LLMProvider         string   `json:"llm_provider,omitempty"`
	APIKeyConfigured    bool     `json:"api_key_configured"`
	ConfiguredProviders []string `json:"configured_providers,omitempty"`
}

// ConfigUpdate is the request payload for updating Kagenti LLM configuration.
type ConfigUpdate struct {
	LLMProvider string
	APIKey      string
}

// ConfigManager manages the in-cluster Kagenti LLM provider configuration.
type ConfigManager interface {
	GetStatus(ctx context.Context) (*ConfigStatus, error)
	UpdateConfig(ctx context.Context, update ConfigUpdate) (*ConfigStatus, error)
}

// KubernetesConfigManager manages Kagenti config through the Kubernetes API.
type KubernetesConfigManager struct {
	client         kubernetes.Interface
	namespace      string
	deploymentName string
	secretName     string
}

// NewKubernetesConfigManagerFromEnv creates a config manager using in-cluster credentials.
func NewKubernetesConfigManagerFromEnv() (ConfigManager, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		return nil, err
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	namespace := strings.TrimSpace(os.Getenv("KAGENTI_NAMESPACE"))
	if namespace == "" {
		namespace = defaultKagentiNamespace
	}

	deploymentName := strings.TrimSpace(os.Getenv("KAGENTI_DEPLOYMENT_NAME"))
	if deploymentName == "" {
		deploymentName = strings.TrimSpace(os.Getenv("KAGENTI_SERVICE_NAME"))
	}
	if deploymentName == "" {
		deploymentName = defaultKagentiDeploymentName
	}

	secretName := strings.TrimSpace(os.Getenv("KAGENTI_LLM_SECRET_NAME"))
	if secretName == "" {
		secretName = defaultKagentiLLMSecretName
	}

	return newKubernetesConfigManager(clientset, namespace, deploymentName, secretName), nil
}

func newKubernetesConfigManager(client kubernetes.Interface, namespace, deploymentName, secretName string) *KubernetesConfigManager {
	return &KubernetesConfigManager{
		client:         client,
		namespace:      namespace,
		deploymentName: deploymentName,
		secretName:     secretName,
	}
}

// GetStatus returns the current Kagenti provider and which provider keys are present.
func (m *KubernetesConfigManager) GetStatus(ctx context.Context) (*ConfigStatus, error) {
	deployment, err := m.client.AppsV1().Deployments(m.namespace).Get(ctx, m.deploymentName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	provider := extractLLMProvider(deployment)
	configuredProviders, err := m.getConfiguredProviders(ctx)
	if err != nil {
		return nil, err
	}

	status := &ConfigStatus{
		LLMProvider:         provider,
		APIKeyConfigured:    stringSliceContains(configuredProviders, provider),
		ConfiguredProviders: configuredProviders,
	}
	return status, nil
}

// UpdateConfig updates the Kagenti Secret and Deployment, then returns the new status.
func (m *KubernetesConfigManager) UpdateConfig(ctx context.Context, update ConfigUpdate) (*ConfigStatus, error) {
	provider := normalizeLLMProvider(update.LLMProvider)
	apiKeyEnvVar, ok := llmProviderAPIKeyEnvVars[provider]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedLLMProvider, update.LLMProvider)
	}

	trimmedAPIKey := strings.TrimSpace(update.APIKey)
	secret, err := m.client.CoreV1().Secrets(m.namespace).Get(ctx, m.secretName, metav1.GetOptions{})
	if err != nil {
		if !apierrors.IsNotFound(err) {
			return nil, err
		}
		if trimmedAPIKey == "" {
			return nil, ErrAPIKeyRequired
		}
		secret = &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      m.secretName,
				Namespace: m.namespace,
			},
			Type: corev1.SecretTypeOpaque,
			Data: map[string][]byte{},
		}
	}

	secret = secret.DeepCopy()
	if secret.Data == nil {
		secret.Data = make(map[string][]byte)
	}

	existingKey := strings.TrimSpace(string(secret.Data[apiKeyEnvVar]))
	if trimmedAPIKey == "" && existingKey == "" {
		return nil, ErrAPIKeyRequired
	}
	if trimmedAPIKey != "" {
		secret.Data[apiKeyEnvVar] = []byte(trimmedAPIKey)
	}

	if secret.ResourceVersion == "" {
		if _, err := m.client.CoreV1().Secrets(m.namespace).Create(ctx, secret, metav1.CreateOptions{}); err != nil {
			return nil, err
		}
	} else {
		if _, err := m.client.CoreV1().Secrets(m.namespace).Update(ctx, secret, metav1.UpdateOptions{}); err != nil {
			return nil, err
		}
	}

	deployment, err := m.client.AppsV1().Deployments(m.namespace).Get(ctx, m.deploymentName, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	deployment = deployment.DeepCopy()
	if err := setDeploymentLLMProvider(deployment, provider); err != nil {
		return nil, err
	}

	if _, err := m.client.AppsV1().Deployments(m.namespace).Update(ctx, deployment, metav1.UpdateOptions{}); err != nil {
		return nil, err
	}

	return m.GetStatus(ctx)
}

func (m *KubernetesConfigManager) getConfiguredProviders(ctx context.Context) ([]string, error) {
	secret, err := m.client.CoreV1().Secrets(m.namespace).Get(ctx, m.secretName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return []string{}, nil
		}
		return nil, err
	}

	configuredProviders := make([]string, 0, len(llmProviderAPIKeyEnvVars))
	for provider, envVar := range llmProviderAPIKeyEnvVars {
		if strings.TrimSpace(string(secret.Data[envVar])) != "" {
			configuredProviders = append(configuredProviders, provider)
		}
	}
	sort.Strings(configuredProviders)
	return configuredProviders, nil
}

func extractLLMProvider(deployment *appsv1.Deployment) string {
	for _, container := range deployment.Spec.Template.Spec.Containers {
		for _, envVar := range container.Env {
			if envVar.Name == llmProviderEnvVarName {
				return normalizeLLMProvider(envVar.Value)
			}
		}
	}
	return ""
}

func setDeploymentLLMProvider(deployment *appsv1.Deployment, provider string) error {
	if len(deployment.Spec.Template.Spec.Containers) == 0 {
		return fmt.Errorf("deployment %s/%s has no containers", deployment.Namespace, deployment.Name)
	}

	container := &deployment.Spec.Template.Spec.Containers[0]
	updated := false
	for index := range container.Env {
		if container.Env[index].Name == llmProviderEnvVarName {
			container.Env[index].Value = provider
			updated = true
			break
		}
	}
	if !updated {
		container.Env = append(container.Env, corev1.EnvVar{Name: llmProviderEnvVarName, Value: provider})
	}

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}
	deployment.Spec.Template.Annotations[rolloutRestartAnnotation] = time.Now().UTC().Format(time.RFC3339)
	return nil
}

func normalizeLLMProvider(provider string) string {
	return strings.ToLower(strings.TrimSpace(provider))
}

func stringSliceContains(items []string, target string) bool {
	if target == "" {
		return false
	}
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
