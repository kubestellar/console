package k8s

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

const testServicesCluster = "services-cluster"

func newServicesClient(clientset *k8sfake.Clientset) *MultiClusterClient {
	client := &MultiClusterClient{}
	client.SetClient(testServicesCluster, clientset)
	return client
}

func TestGetServices_ExternalAddressPrecedence(t *testing.T) {
	t.Parallel()

	const (
		serviceNamespace = "default"
		servicePort      = int32(443)
		nodePort         = int32(30443)
	)

	now := time.Now().Add(-2 * time.Hour)
	testCases := []struct {
		name           string
		service        *corev1.Service
		wantExternalIP string
		wantLBStatus   string
	}{
		{
			name: "load balancer hostname used when ip missing",
			service: &corev1.Service{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "hostname-only",
					Namespace:         serviceNamespace,
					CreationTimestamp: metav1.NewTime(now),
				},
				Spec: corev1.ServiceSpec{
					Type: corev1.ServiceTypeLoadBalancer,
					Ports: []corev1.ServicePort{{
						Name:     "https",
						Port:     servicePort,
						NodePort: nodePort,
						Protocol: corev1.ProtocolTCP,
					}},
					Selector: map[string]string{"app": "web"},
				},
				Status: corev1.ServiceStatus{
					LoadBalancer: corev1.LoadBalancerStatus{
						Ingress: []corev1.LoadBalancerIngress{{Hostname: "lb.example.test"}},
					},
				},
			},
			wantExternalIP: "lb.example.test",
			wantLBStatus:   LBStatusReady,
		},
		{
			name: "spec external ip overrides load balancer status",
			service: &corev1.Service{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "external-ip-override",
					Namespace:         serviceNamespace,
					CreationTimestamp: metav1.NewTime(now),
				},
				Spec: corev1.ServiceSpec{
					Type:        corev1.ServiceTypeLoadBalancer,
					ExternalIPs: []string{"198.51.100.7"},
					Ports: []corev1.ServicePort{{
						Name:     "https",
						Port:     servicePort,
						NodePort: nodePort,
						Protocol: corev1.ProtocolTCP,
					}},
					Selector: map[string]string{"app": "api"},
				},
				Status: corev1.ServiceStatus{
					LoadBalancer: corev1.LoadBalancerStatus{
						Ingress: []corev1.LoadBalancerIngress{{IP: "203.0.113.7"}},
					},
				},
			},
			wantExternalIP: "198.51.100.7",
			wantLBStatus:   LBStatusReady,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			clientset := k8sfake.NewSimpleClientset(tc.service)
			client := newServicesClient(clientset)

			services, err := client.GetServices(context.Background(), testServicesCluster, serviceNamespace)

			require.NoError(t, err)
			require.Len(t, services, 1)
			got := services[0]
			assert.Equal(t, tc.wantExternalIP, got.ExternalIP)
			assert.Equal(t, tc.wantLBStatus, got.LBStatus)
			assert.Equal(t, []string{"443:30443/TCP"}, got.Ports)
			require.Len(t, got.PortDetails, 1)
			assert.Equal(t, "https", got.PortDetails[0].Name)
			assert.Equal(t, servicePort, got.PortDetails[0].Port)
			assert.Equal(t, nodePort, got.PortDetails[0].NodePort)
			assert.Equal(t, string(corev1.ProtocolTCP), got.PortDetails[0].Protocol)
		})
	}
}

func TestGetServices_EndpointListFailureDoesNotFailRequest(t *testing.T) {
	t.Parallel()

	const serviceNamespace = "default"

	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "api",
			Namespace:         serviceNamespace,
			CreationTimestamp: metav1.NewTime(time.Now().Add(-90 * time.Minute)),
			Labels:            map[string]string{"tier": "backend"},
			Annotations:       map[string]string{"owner": "platform"},
		},
		Spec: corev1.ServiceSpec{
			Type:      corev1.ServiceTypeClusterIP,
			ClusterIP: "10.0.0.12",
			Selector:  map[string]string{"app": "api"},
			Ports: []corev1.ServicePort{{
				Port:     8080,
				Protocol: corev1.ProtocolTCP,
			}},
		},
	}

	clientset := k8sfake.NewSimpleClientset(service)
	clientset.PrependReactor("list", "endpoints", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("endpoint list denied")
	})

	client := newServicesClient(clientset)
	services, err := client.GetServices(context.Background(), testServicesCluster, serviceNamespace)

	require.NoError(t, err)
	require.Len(t, services, 1)
	got := services[0]
	assert.Equal(t, "api", got.Name)
	assert.Equal(t, serviceNamespace, got.Namespace)
	assert.Equal(t, testServicesCluster, got.Cluster)
	assert.Equal(t, "10.0.0.12", got.ClusterIP)
	assert.Equal(t, 0, got.Endpoints)
	assert.Equal(t, map[string]string{"tier": "backend"}, got.Labels)
	assert.Equal(t, map[string]string{"owner": "platform"}, got.Annotations)
	assert.Equal(t, map[string]string{"app": "api"}, got.Selector)
	assert.NotEmpty(t, got.Age)
}
