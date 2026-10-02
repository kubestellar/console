package k8s

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/util/retry"

	"github.com/kubestellar/console/pkg/sanitize"
)

// LabelClusterNodes labels all nodes in a cluster with the given labels.
// Each node update uses retry-on-conflict to handle transient ResourceVersion
// mismatches. Errors are collected per-node so that one failure does not
// prevent labeling the remaining nodes (#10256).
func (m *MultiClusterClient) LabelClusterNodes(ctx context.Context, cluster string, labels map[string]string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return err
	}

	nodeList, err := dynamicClient.Resource(gvrNodes).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes in %s: %w", cluster, err)
	}

	var errs []error
	for _, node := range nodeList.Items {
		nodeName := node.GetName()
		retryErr := retry.RetryOnConflict(retry.DefaultRetry, func() error {
			// Re-fetch the node to get the latest ResourceVersion.
			fresh, getErr := dynamicClient.Resource(gvrNodes).Get(ctx, nodeName, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("failed to get node %s in %s: %w", nodeName, cluster, getErr)
			}
			existing := fresh.GetLabels()
			if existing == nil {
				existing = make(map[string]string)
			}
			for k, v := range labels {
				existing[k] = v
			}
			fresh.SetLabels(existing)
			_, updateErr := dynamicClient.Resource(gvrNodes).Update(ctx, fresh, metav1.UpdateOptions{})
			return updateErr
		})
		if retryErr != nil {
			slog.Error("[LabelClusterNodes] failed to label node after retries",
				"node", sanitize.LogString(nodeName), "cluster", sanitize.LogString(cluster), "error", retryErr)
			errs = append(errs, fmt.Errorf("node %s: %w", nodeName, retryErr))
		}
	}
	return errors.Join(errs...)
}

// RemoveClusterNodeLabels removes specified labels from all nodes in a cluster.
// Each node update uses retry-on-conflict to handle transient ResourceVersion
// mismatches. Errors are collected per-node so that one failure does not
// prevent updating the remaining nodes (#10256).
func (m *MultiClusterClient) RemoveClusterNodeLabels(ctx context.Context, cluster string, labelKeys []string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return err
	}

	nodeList, err := dynamicClient.Resource(gvrNodes).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes in %s: %w", cluster, err)
	}

	var errs []error
	for _, node := range nodeList.Items {
		nodeName := node.GetName()
		retryErr := retry.RetryOnConflict(retry.DefaultRetry, func() error {
			// Re-fetch the node to get the latest ResourceVersion.
			fresh, getErr := dynamicClient.Resource(gvrNodes).Get(ctx, nodeName, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("failed to get node %s in %s: %w", nodeName, cluster, getErr)
			}
			existing := fresh.GetLabels()
			if existing == nil {
				return nil // no labels to remove
			}
			changed := false
			for _, k := range labelKeys {
				if _, ok := existing[k]; ok {
					delete(existing, k)
					changed = true
				}
			}
			if !changed {
				return nil // nothing to update
			}
			fresh.SetLabels(existing)
			_, updateErr := dynamicClient.Resource(gvrNodes).Update(ctx, fresh, metav1.UpdateOptions{})
			return updateErr
		})
		if retryErr != nil {
			slog.Error("[RemoveClusterNodeLabels] failed to update node after retries",
				"node", sanitize.LogString(nodeName), "cluster", sanitize.LogString(cluster), "error", retryErr)
			errs = append(errs, fmt.Errorf("node %s: %w", nodeName, retryErr))
		}
	}
	return errors.Join(errs...)
}
