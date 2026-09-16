package k8s

import (
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
)

func runScheme() *k8sruntime.Scheme {
	return k8sruntime.NewScheme()
}
