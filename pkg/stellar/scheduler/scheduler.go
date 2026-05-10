package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

const (
	defaultSchedulerInterval = 30 * time.Second
	maxDueActions            = 10
	restartedAtAnnotation    = "kubectl.kubernetes.io/restartedAt"
)

type Store interface {
	GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]store.StellarAction, error)
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
}

type Scheduler struct {
	store     Store
	k8sClient *k8s.MultiClusterClient
	interval  time.Duration
}

func New(store Store, client *k8s.MultiClusterClient) *Scheduler {
	return &Scheduler{
		store:     store,
		k8sClient: client,
		interval:  defaultSchedulerInterval,
	}
}

func (s *Scheduler) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	slog.Info("stellar/scheduler: started")
	for {
		select {
		case <-ctx.Done():
			slog.Info("stellar/scheduler: stopped")
			return
		case <-ticker.C:
			s.runDue(ctx)
		}
	}
}

func (s *Scheduler) runDue(ctx context.Context) {
	if s.store == nil || s.k8sClient == nil {
		return
	}
	actions, err := s.store.GetDueApprovedStellarActions(ctx, time.Now().UTC(), maxDueActions)
	if err != nil || len(actions) == 0 {
		return
	}
	for _, action := range actions {
		_ = s.store.UpdateStellarActionStatus(ctx, action.ID, "running", "", "")
		outcome, execErr := s.execute(ctx, action)
		if execErr != nil {
			slog.Warn("stellar/scheduler: action failed", "action_id", action.ID, "error", execErr)
			_ = s.store.UpdateStellarActionStatus(ctx, action.ID, "failed", "", execErr.Error())
			_ = s.store.CreateStellarNotification(ctx, &store.StellarNotification{
				UserID:   action.UserID,
				Type:     "Action",
				Severity: "warning",
				Title:    "Scheduled action failed: " + action.Description,
				Body:     fmt.Sprintf("Action on %s failed: %s", action.Cluster, execErr.Error()),
				Cluster:  action.Cluster,
				ActionID: action.ID,
			})
			continue
		}
		_ = s.store.UpdateStellarActionStatus(ctx, action.ID, "completed", outcome, "")
		_ = s.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    action.UserID,
			Type:      "Action",
			Severity:  "info",
			Title:     "Action completed: " + action.Description,
			Body:      outcome,
			Cluster:   action.Cluster,
			ActionID:  action.ID,
			DedupeKey: "action-complete:" + action.ID,
		})
	}
}

func (s *Scheduler) execute(ctx context.Context, action store.StellarAction) (string, error) {
	params, err := decodeParameters(action.Parameters)
	if err != nil {
		return "", err
	}
	switch action.ActionType {
	case "ScaleDeployment":
		namespace := readStringParam(params, "namespace", action.Namespace)
		name := readStringParam(params, "name", readStringParam(params, "deployment", ""))
		replicas, convErr := readInt32Param(params, "replicas")
		if convErr != nil {
			return "", convErr
		}
		if err := s.scaleDeployment(ctx, action.Cluster, namespace, name, replicas); err != nil {
			return "", err
		}
		return fmt.Sprintf("Scaled %s/%s to %d replicas on %s.", namespace, name, replicas, action.Cluster), nil
	case "RestartDeployment":
		namespace := readStringParam(params, "namespace", action.Namespace)
		name := readStringParam(params, "name", readStringParam(params, "deployment", ""))
		if err := s.rolloutRestart(ctx, action.Cluster, namespace, name); err != nil {
			return "", err
		}
		return fmt.Sprintf("Restarted deployment %s/%s on %s.", namespace, name, action.Cluster), nil
	case "DeletePod":
		namespace := readStringParam(params, "namespace", action.Namespace)
		name := readStringParam(params, "name", readStringParam(params, "pod", ""))
		if err := s.deletePod(ctx, action.Cluster, namespace, name); err != nil {
			return "", err
		}
		return fmt.Sprintf("Deleted pod %s/%s on %s.", namespace, name, action.Cluster), nil
	case "CordonNode":
		node := readStringParam(params, "node", "")
		if err := s.cordonNode(ctx, action.Cluster, node); err != nil {
			return "", err
		}
		return fmt.Sprintf("Cordoned node %s on %s.", node, action.Cluster), nil
	case "DeleteCluster":
		token := readStringParam(params, "confirm_token", "")
		if len(action.ID) < 8 || token != action.ID[:8] {
			return "", fmt.Errorf("cluster deletion requires confirm_token = first 8 chars of action ID")
		}
		if err := s.k8sClient.RemoveContext(action.Cluster); err != nil {
			return "", err
		}
		return fmt.Sprintf("Removed cluster context %s from kubeconfig.", action.Cluster), nil
	default:
		return "", fmt.Errorf("unknown action type: %s", action.ActionType)
	}
}

func (s *Scheduler) scaleDeployment(ctx context.Context, cluster, namespace, name string, replicas int32) error {
	client, err := s.k8sClient.GetClient(cluster)
	if err != nil {
		return err
	}
	deployment, err := client.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	deployment.Spec.Replicas = &replicas
	_, err = client.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	return err
}

func (s *Scheduler) rolloutRestart(ctx context.Context, cluster, namespace, name string) error {
	client, err := s.k8sClient.GetClient(cluster)
	if err != nil {
		return err
	}
	deployment, err := client.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = map[string]string{}
	}
	deployment.Spec.Template.Annotations[restartedAtAnnotation] = time.Now().UTC().Format(time.RFC3339)
	_, err = client.AppsV1().Deployments(namespace).Update(ctx, deployment, metav1.UpdateOptions{})
	return err
}

func (s *Scheduler) deletePod(ctx context.Context, cluster, namespace, name string) error {
	client, err := s.k8sClient.GetClient(cluster)
	if err != nil {
		return err
	}
	return client.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (s *Scheduler) cordonNode(ctx context.Context, cluster, nodeName string) error {
	client, err := s.k8sClient.GetClient(cluster)
	if err != nil {
		return err
	}
	node, err := client.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		return err
	}
	node.Spec.Unschedulable = true
	_, err = client.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	return err
}

func decodeParameters(raw string) (map[string]any, error) {
	if raw == "" {
		return map[string]any{}, nil
	}
	params := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &params); err != nil {
		return nil, fmt.Errorf("invalid action parameters: %w", err)
	}
	return params, nil
}

func readStringParam(params map[string]any, key, fallback string) string {
	value, ok := params[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return fallback
		}
		return typed
	default:
		return fallback
	}
}

func readInt32Param(params map[string]any, key string) (int32, error) {
	value, ok := params[key]
	if !ok {
		return 0, fmt.Errorf("missing required parameter: %s", key)
	}
	switch typed := value.(type) {
	case float64:
		return int32(typed), nil
	case int:
		return int32(typed), nil
	default:
		return 0, fmt.Errorf("invalid %s parameter type", key)
	}
}
