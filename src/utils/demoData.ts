// Demo data for offline/demo mode
import { Card } from '../types/cards';
import { ConsoleUser } from '../types/users';
import { CommandHistoryItem } from '../components/cards/Kubectl.types';

export const DEMO_DATA = {
  cards: [
    { id: 'demo-card-1', card_type: 'default', config: {}, position: { x: 0, y: 0 } },
    { id: 'demo-card-2', card_type: 'default', config: {}, position: { x: 0, y: 0 } },
    { id: 'demo-card-3', card_type: 'default', config: {}, position: { x: 0, y: 0 } },
    { id: 'demo-card-4', card_type: 'default', config: {}, position: { x: 0, y: 0 } },
    { id: 'demo-card-5', card_type: 'default', config: {}, position: { x: 0, y: 0 } }
  ] as Card[],
  users: [
    { id: '1', name: 'Admin User', role: 'admin', email: 'admin@demo.com', github_id: 'admin', github_login: 'admin', onboarded: true },
    { id: '2', name: 'Demo User', role: 'viewer', email: 'user@demo.com', github_id: 'demo', github_login: 'demo', onboarded: true },
    { id: '3', name: 'Guest User', role: 'viewer', email: 'guest@demo.com', github_id: 'guest', github_login: 'guest', onboarded: false }
  ] as ConsoleUser[],
  kubectlHistory: [
    { id: 'demo-cmd-1', context: 'default', command: 'kubectl get pods', output: '', timestamp: new Date('2024-07-04T12:00:00Z'), success: true },
    { id: 'demo-cmd-2', context: 'default', command: 'kubectl describe node node-1', output: '', timestamp: new Date('2024-07-04T11:45:00Z'), success: true },
    { id: 'demo-cmd-3', context: 'default', command: 'kubectl logs pod-1 -n default', output: '', timestamp: new Date('2024-07-04T11:30:00Z'), success: false },
    { id: 'demo-cmd-4', context: 'default', command: 'kubectl get services', output: '', timestamp: new Date('2024-07-04T11:15:00Z'), success: true },
    { id: 'demo-cmd-5', context: 'default', command: 'kubectl apply -f deployment.yaml', output: '', timestamp: new Date('2024-07-04T11:00:00Z'), success: true }
  ] as CommandHistoryItem[],
  aiSuggestions: [
    { id: '1', text: 'Consider increasing replicas for deployment' },
    { id: '2', text: 'Pod memory usage is high, consider optimization' },
    { id: '3', text: 'Node has available capacity for additional workloads' },
    { id: '4', text: 'Review security policies for namespace' }
  ]
};