package providers

import (
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// newDynamicClientForConfig is a package-level seam overridden by tests.
var newDynamicClientForConfig = func(cfg *rest.Config) (dynamic.Interface, error) {
	return dynamic.NewForConfig(cfg)
}

// newKubernetesClientForConfig is a package-level seam overridden by tests.
var newKubernetesClientForConfig = func(cfg *rest.Config) (kubernetes.Interface, error) {
	return kubernetes.NewForConfig(cfg)
}
