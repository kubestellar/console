package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// Dispatch executes a StellarAction against the target cluster.
// Exported so handlers can call it for immediate execution.
func Dispatch(ctx context.Context, k8sClient *k8s.MultiClusterClient, a store.StellarAction) (string, error) {
	params, err := decodeParameters(a.Parameters)
	if err != nil {
		return "", err
	}
	switch a.ActionType {
	case "ScaleDeployment":
		ns := readString(params, "namespace", a.Namespace)
		name := readString(params, "name", "")
		n, convErr := readInt32(params, "replicas")
		if convErr != nil {
			return "", convErr
		}
		if n < 0 || n > 100 {
			return "", fmt.Errorf("replicas out of range: %d", n)
		}
		client, err := k8sClient.GetClient(a.Cluster)
		if err != nil {
			return "", err
		}
		deployment, err := client.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return "", err
		}
		deployment.Spec.Replicas = &n
		if _, err := client.AppsV1().Deployments(ns).Update(ctx, deployment, metav1.UpdateOptions{}); err != nil {
			return "", err
		}
		return fmt.Sprintf("Scaled %s/%s to %d replicas on %s.", ns, name, n, a.Cluster), nil
	case "RestartDeployment":
		ns := readString(params, "namespace", a.Namespace)
		name := readString(params, "name", "")
		client, err := k8sClient.GetClient(a.Cluster)
		if err != nil {
			return "", err
		}
		deployment, err := client.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return "", err
		}
		if deployment.Spec.Template.Annotations == nil {
			deployment.Spec.Template.Annotations = map[string]string{}
		}
		deployment.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().UTC().Format(time.RFC3339)
		if _, err := client.AppsV1().Deployments(ns).Update(ctx, deployment, metav1.UpdateOptions{}); err != nil {
			return "", err
		}
		return fmt.Sprintf("Rollout restart triggered for %s/%s on %s.", ns, name, a.Cluster), nil
	case "DeletePod":
		ns := readString(params, "namespace", a.Namespace)
		name := readString(params, "name", "")
		client, err := k8sClient.GetClient(a.Cluster)
		if err != nil {
			return "", err
		}
		if err := client.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
			return "", err
		}
		return fmt.Sprintf("Deleted pod %s/%s on %s.", ns, name, a.Cluster), nil
	case "CordonNode":
		nodeName := readString(params, "node", "")
		client, err := k8sClient.GetClient(a.Cluster)
		if err != nil {
			return "", err
		}
		node, err := client.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
		if err != nil {
			return "", err
		}
		node.Spec.Unschedulable = true
		if _, err := client.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{}); err != nil {
			return "", err
		}
		return fmt.Sprintf("Cordoned node %s on %s.", nodeName, a.Cluster), nil
	case "DeleteCluster":
		token := readString(params, "confirm_token", "")
		if len(a.ID) < 8 || token != a.ID[:8] {
			return "", fmt.Errorf("invalid confirm_token for cluster deletion")
		}
		if err := k8sClient.RemoveContext(a.Cluster); err != nil {
			return "", err
		}
		return "Cluster deletion initiated. Monitor cluster list for completion.", nil
	default:
		return "", fmt.Errorf("unknown action type: %s", a.ActionType)
	}
}

func decodeParameters(raw string) (map[string]any, error) {
	if strings.TrimSpace(raw) == "" {
		return map[string]any{}, nil
	}
	out := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func readString(params map[string]any, key, fallback string) string {
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	return fallback
}

func readInt32(params map[string]any, key string) (int32, error) {
	v, ok := params[key]
	if !ok {
		return 0, fmt.Errorf("missing %s", key)
	}
	switch n := v.(type) {
	case float64:
		if n != math.Trunc(n) {
			return 0, fmt.Errorf("%s must be a whole number: %v", key, n)
		}
		return checkedInt32(int64(n), key)
	case int:
		return checkedInt32(int64(n), key)
	case int32:
		return n, nil
	case int64:
		return checkedInt32(n, key)
	case string:
		parsed, err := strconv.Atoi(n)
		if err != nil {
			return 0, err
		}
		return checkedInt32(int64(parsed), key)
	default:
		return 0, fmt.Errorf("invalid %s", key)
	}
}

func checkedInt32(value int64, key string) (int32, error) {
	if value > int64(math.MaxInt32) || value < int64(math.MinInt32) {
		return 0, fmt.Errorf("%s value %d overflows int32", key, value)
	}
	return int32(value), nil
}
