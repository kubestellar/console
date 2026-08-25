import React from 'react'
import type { QuantumSystemStatus } from '../../../hooks/useCachedQuantum'
import type { ControlState } from './hooks/useQuantumControls'

interface Props {
  statusTab: 'system' | 'job'
  onTabChange: (tab: 'system' | 'job') => void
  displayStatus: QuantumSystemStatus
  isHealthy: boolean
  lastExecution: ControlState['last_execution']
}

export const QuantumStatusPanel: React.FC<Props> = ({
  statusTab,
  onTabChange,
  displayStatus,
  isHealthy,
  lastExecution,
}) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
    <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
      <button
        onClick={() => onTabChange('system')}
        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
          statusTab === 'system'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-blue-500'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        System Status
      </button>
      <button
        onClick={() => onTabChange('job')}
        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
          statusTab === 'job'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-b-2 border-blue-500'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        Last Job
      </button>
    </div>

    <div className="p-3">
      {statusTab === 'system' ? (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Status:</span>
            <span className={`font-semibold ${isHealthy ? 'text-green-400' : 'text-yellow-400'}`}>
              {displayStatus.loop_running ? 'loop_running' : displayStatus.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Running:</span>
            <span className={displayStatus.running ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}>
              {displayStatus.running ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Mode:</span>
            <span className="text-gray-900 dark:text-gray-100 font-mono text-xs">
              {displayStatus.execution_mode}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Loop:</span>
            <span className={`text-xs font-semibold ${displayStatus.loop_mode ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {displayStatus.loop_mode ? 'ON' : 'OFF'}
            </span>
          </div>
          {displayStatus.circuit_info && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Qubits:</span>
              <span className="text-gray-900 dark:text-gray-100 text-xs">
                {displayStatus.circuit_info.num_qubits}
              </span>
            </div>
          )}
          {displayStatus.control_system && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Command:</span>
              <span className="text-gray-900 dark:text-gray-100 text-xs">
                {displayStatus.control_system.command}
              </span>
            </div>
          )}
          {displayStatus.last_result_time && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Result Time:</span>
              <span className="text-gray-900 dark:text-gray-100 text-xs">
                {new Date(displayStatus.last_result_time).toLocaleTimeString()}
              </span>
            </div>
          )}
          {displayStatus.version_info && (
            <>
              <div className="flex justify-between pt-1 border-t border-gray-300 dark:border-gray-600 mt-2">
                <span className="text-gray-600 dark:text-gray-400">Backend Ver:</span>
                <span className="text-gray-900 dark:text-gray-100 text-xs font-mono font-semibold">
                  {displayStatus.version_info.version}
                </span>
              </div>
              {displayStatus.version_info.commit && displayStatus.version_info.commit !== 'unknown' && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Commit:</span>
                  <span className="text-gray-900 dark:text-gray-100 text-xs font-mono">
                    {displayStatus.version_info.commit}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          {lastExecution ? (
            <>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-mono">ID:</span> {lastExecution.job_id.substring(0, 8)}...
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-mono">Status:</span> {lastExecution.status}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-mono">Time:</span> {new Date(lastExecution.timestamp).toLocaleTimeString()}
              </p>
            </>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic">No jobs executed yet</p>
          )}
        </div>
      )}
    </div>
  </div>
)
