package handlers

import (
	"k8s.io/apimachinery/pkg/runtime"
	k8sscheme "k8s.io/client-go/kubernetes/scheme"
)

func newK8sScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = k8sscheme.AddToScheme(scheme)
	return scheme
}
