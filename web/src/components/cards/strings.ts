export const CARD_UI_STRINGS = {
  compliance: {
    requiresLocalAgent: 'Requires kc-agent (local agent mode)',
    trivyUnavailable: 'Vulnerability scanning not available',
    kubescapeUnavailable: 'Security posture scanning not available',
    policyViolationsUnavailable: 'Policy violation scanning not available',
    complianceScoreUnavailable: 'Compliance scoring not available',
  },
  hardwareHealth: {
    searchDevicesPlaceholder: 'Search devices...',
    clickToUnsnooze: 'Click to unsnooze',
    snoozeAlert: 'Snooze alert',
    clearAlertAfterPowerCycle: 'Clear alert (after power cycle)',
    noMatchingAlerts: 'No matching alerts',
    allHardwareDevicesHealthy: 'All hardware devices healthy',
    noMatchingNodes: 'No matching nodes',
    noNodesTrackedYet: 'No nodes tracked yet',
    waitingForDeviceScan: 'Waiting for device scan...',
    badgeLabels: {
      sriov: 'SR-IOV',
      rdma: 'RDMA',
      mellanox: 'Mellanox',
      mofed: 'MOFED',
      gpuDriver: 'GPU Driver',
    },
  },
} as const
