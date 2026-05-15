import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCachedQuality } from '../../hooks/useCachedData';
import { useCardLoadingState } from './CardDataContext';
import { 
  CheckCircle, 
  AlertTriangle, 
  Activity, 
  ShieldCheck, 
  Zap,
  TrendingUp,
  Search
} from 'lucide-react';

/**
 * QualityDashboard displays real-time metrics for state integrity and AI bug sweeps.
 * Part of the State Resilience Framework (#12000).
 */
const QualityDashboard: React.FC = () => {
  const { t } = useTranslation('cards');
  
  // Use the cached hook to fetch quality statistics.
  // This hook handles demo data, refresh behavior, and caching.
  const { 
    data: stats,
    isLoading: isDataLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
  } = useCachedQuality();

  // Report loading state to CardWrapper for skeleton/refresh behavior.
  // We consider we have data if the stats object is present.
  const hasData = !!stats;
  const loadingState = useCardLoadingState({
    isLoading: isDataLoading && !hasData,
    hasAnyData: hasData,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures
  });

  if (loadingState.showSkeleton) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Activity className="w-5 h-5 mr-2 animate-spin" />
        <span>{t('messages.checking')}</span>
      </div>
    );
  }

  // Display the dashboard with stats from the hook
  return (
    <div className="space-y-4 p-1">
      {/* State Integrity Section */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50" />
          <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-xs text-slate-400 font-medium">{t('quality.state_integrity')}</span>
          <span className="text-xl font-bold text-emerald-400 mt-1">{t('quality.synced')}</span>
          <div className="mt-2 flex items-center space-x-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-slate-500 uppercase tracking-tight">{t('quality.digest_active')}</span>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
          <TrendingUp className="w-5 h-5 text-blue-400 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-xs text-slate-400 font-medium">{t('quality.remediation_progress')}</span>
          <span className="text-xl font-bold text-blue-400 mt-1">{stats.progressPct}</span>
          <span className="text-[10px] text-slate-500 mt-1 italic">{t('quality.fixed', { count: stats.remediationsFixed })}</span>
        </div>
      </div>

      {/* AI Bug Sweep Section */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 relative overflow-hidden group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-slate-200">{t('quality.bug_sweep')}</h4>
          </div>
          <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{t('quality.issues_detected')}</span>
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold border border-red-500/30">
              {stats.bugsFoundCount}
            </span>
          </div>
          
          <div className="space-y-2 pt-1 border-t border-slate-800/40">
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-slate-400">{t('quality.fix_guards_applied')}</span>
            </div>
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-slate-400">
                <span className="text-amber-400 font-medium mr-1">{stats.driftEventsCount}</span>
                {t('quality.paths_flagged')}
              </span>
            </div>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between">
          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">{t('quality.sweep_scheduled')}</span>
        </div>
      </div>

      <div className="text-center">
        <span className="text-[9px] text-slate-600 font-mono tracking-tighter opacity-70 group-hover:opacity-100 transition-opacity">
          {t('quality.version_poc')}
        </span>
      </div>
    </div>
  );
};

export default QualityDashboard;
