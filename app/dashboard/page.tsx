/**
 * /dashboard
 * Mobile-first queue dashboard. Built for phones first, scales to desktop.
 * Responsive layout, touch-friendly buttons, real-time updates.
 */
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  completeEntry,
  skipInService,
  skipWaiting,
  cancelEntry,
  requeueSkipped,
} from '@/app/actions/queue';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];
type Service = Database['public']['Tables']['services']['Row'];

interface DashboardState {
  inService: QueueEntry | null;
  waiting: QueueEntry[];
  completed: QueueEntry[];
  skipped: QueueEntry[];
  cancelled: QueueEntry[];
  services: Map<string, Service>;
  loading: boolean;
}

interface LoadingState {
  [key: string]: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({
    inService: null,
    waiting: [],
    completed: [],
    skipped: [],
    cancelled: [],
    services: new Map(),
    loading: true,
  });
  const [loadingActions, setLoadingActions] = useState<LoadingState>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['waiting']));

  const realtimeUnsubscribe = useRef<(() => void) | null>(null);

  // Fetch today's queue data
  const fetchQueueData = useCallback(async () => {
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      const { data: allData, error: dataError } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_date', today)
        .in('status', ['in_service', 'waiting', 'completed', 'skipped', 'cancelled'])
        .order('queue_number', { ascending: true });

      const { data: servicesData } = await supabase.from('services').select('*');

      if (dataError) {
        console.error('[fetch] error:', dataError);
        return;
      }

      if (allData) {
        const inServiceEntry = allData.find((e) => e.status === 'in_service') || null;
        const waitingEntries = allData.filter((e) => e.status === 'waiting');
        const completedEntries = allData.filter((e) => e.status === 'completed');
        const skippedEntries = allData.filter((e) => e.status === 'skipped');
        const cancelledEntries = allData.filter((e) => e.status === 'cancelled');

        setState((prev) => ({
          ...prev,
          inService: inServiceEntry,
          waiting: waitingEntries,
          completed: completedEntries,
          skipped: skippedEntries,
          cancelled: cancelledEntries,
          services: new Map((servicesData || []).map((s) => [s.id, s])),
          loading: false,
        }));
      }
    } catch (err) {
      console.error('[fetchQueueData] error:', err);
    }
  }, []);

  // Subscribe to Realtime updates
  const subscribeToUpdates = useCallback(() => {
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      if (realtimeUnsubscribe.current) {
        realtimeUnsubscribe.current();
      }

      const channel = supabase
        .channel(`queue-${today}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'queue_entries',
            filter: `queue_date=eq.${today}`,
          },
          () => {
            fetchQueueData();
          }
        )
        .subscribe();

      realtimeUnsubscribe.current = () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.error('[realtime] error:', err);
    }
  }, [fetchQueueData]);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      await fetchQueueData();
      subscribeToUpdates();
    };

    init();

    return () => {
      if (realtimeUnsubscribe.current) {
        realtimeUnsubscribe.current();
      }
    };
  }, [fetchQueueData, subscribeToUpdates, router]);

  // Action handlers with immediate UI update
  const handleStartService = async () => {
    if (state.waiting.length === 0) return;

    const firstWaiting = state.waiting[0];
    setLoadingActions((prev) => ({ ...prev, [firstWaiting.id]: true }));
    setError(null);

    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('queue_entries')
        .update({ status: 'in_service', started_at: new Date().toISOString() })
        .eq('id', firstWaiting.id);

      if (err) {
        setError('Failed to start service');
        console.error('[startService]', err);
        return;
      }

      // Immediate UI update
      setState((prev) => ({
        ...prev,
        inService: firstWaiting,
        waiting: prev.waiting.slice(1),
      }));
    } finally {
      setLoadingActions((prev) => ({ ...prev, [firstWaiting.id]: false }));
    }
  };

  const handleCompleteEntry = async () => {
    if (!state.inService) return;

    const entryId = state.inService.id;
    const completedEntry = state.inService;
    
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));
    setError(null);

    try {
      const result = await completeEntry(entryId);

      if (!result.success) {
        setError(result.error || 'Failed to complete');
        return;
      }

      // Immediate UI update
      setState((prev) => ({
        ...prev,
        inService: (result.promotedEntry as any) || null,
        completed: [...prev.completed, { ...completedEntry, status: 'completed' as const }],
      }));
    } catch (err) {
      setError('Network error');
      console.error('[handleCompleteEntry]', err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleSkipInService = async () => {
    if (!state.inService) return;

    const entryId = state.inService.id;
    const skippedEntry = state.inService;
    
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));
    setError(null);

    try {
      const result = await skipInService(entryId);

      if (!result.success) {
        setError(result.error || 'Failed to skip');
        return;
      }

      // Immediate UI update
      setState((prev) => ({
        ...prev,
        inService: (result.promotedEntry as any) || null,
        skipped: [...prev.skipped, { ...skippedEntry, status: 'skipped' as const }],
      }));
    } catch (err) {
      setError('Network error');
      console.error('[handleSkipInService]', err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleSkipWaiting = async (entryId: string) => {
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));
    setError(null);

    try {
      const result = await skipWaiting(entryId);

      if (!result.success) {
        setError(result.error || 'Failed to skip');
        return;
      }

      const skipped = state.waiting.find((e) => e.id === entryId);
      if (skipped) {
        setState((prev) => ({
          ...prev,
          waiting: prev.waiting.filter((e) => e.id !== entryId),
          skipped: [...prev.skipped, { ...skipped, status: 'skipped' as const }],
        }));
      }
    } catch (err) {
      setError('Network error');
      console.error('[handleSkipWaiting]', err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleCancelEntry = async (entryId: string) => {
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));
    setError(null);

    try {
      const result = await cancelEntry(entryId);

      if (!result.success) {
        setError(result.error || 'Failed to cancel');
        return;
      }

      const cancelled = state.waiting.find((e) => e.id === entryId);
      if (cancelled) {
        setState((prev) => ({
          ...prev,
          waiting: prev.waiting.filter((e) => e.id !== entryId),
          cancelled: [...prev.cancelled, { ...cancelled, status: 'cancelled' as const }],
        }));
      }
    } catch (err) {
      setError('Network error');
      console.error('[handleCancelEntry]', err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleRequeueSkipped = async (entry: QueueEntry) => {
    if (!entry.telegram_chat_id || !entry.service_id) return;

    setLoadingActions((prev) => ({ ...prev, [entry.id]: true }));
    setError(null);

    try {
      const result = await requeueSkipped(
        entry.telegram_chat_id,
        entry.client_name || '',
        entry.service_id
      );

      if (!result.success) {
        setError(result.error || 'Failed to rejoin');
        return;
      }

      setState((prev) => ({
        ...prev,
        skipped: prev.skipped.filter((e) => e.id !== entry.id),
      }));
    } catch (err) {
      setError('Network error');
      console.error('[handleRequeueSkipped]', err);
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entry.id]: false }));
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const getServiceName = (serviceId: string | null) => {
    if (!serviceId) return 'Service';
    return state.services.get(serviceId)?.name || 'Service';
  };

  const getTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (state.loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-800 border-b border-slate-700 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Mule Barber</h1>
            <p className="text-xs sm:text-sm text-slate-400">Queue System</p>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/login');
            }}
            className="shrink-0 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium rounded-lg transition-colors text-sm"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 text-red-300 px-4 py-3 sm:px-6">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Now Serving Section */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 sm:p-6">
            {state.inService ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs sm:text-sm text-slate-400 font-semibold uppercase">Now Serving</p>
                  <p className="text-5xl sm:text-6xl font-bold text-blue-400 mt-2">#{state.inService.queue_number}</p>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-slate-400">Customer</p>
                    <p className="text-lg sm:text-xl font-semibold text-white">
                      {state.inService.client_name || 'Guest'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{getServiceName(state.inService.service_id)}</span>
                    <span className="text-slate-500">
                      Started: {getTime(state.inService.started_at)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-700">
                  <button
                    onClick={handleCompleteEntry}
                    disabled={loadingActions[state.inService.id]}
                    className="flex-1 px-4 py-3 sm:py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm sm:text-base"
                  >
                    {loadingActions[state.inService.id] ? '⏳' : '✓ Complete'}
                  </button>
                  <button
                    onClick={handleSkipInService}
                    disabled={loadingActions[state.inService.id]}
                    className="flex-1 px-4 py-3 sm:py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm sm:text-base"
                  >
                    {loadingActions[state.inService.id] ? '⏳' : '⊘ No-show'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No one being served</p>
                <button
                  onClick={handleStartService}
                  disabled={state.waiting.length === 0}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  {state.waiting.length === 0 ? 'Queue Empty' : '▶ Start Service'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Waiting Section */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('waiting')}
            className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors border-b border-slate-700"
          >
            <div className="text-left">
              <p className="text-xs sm:text-sm text-slate-400 font-semibold uppercase">Waiting</p>
              <p className="text-lg sm:text-xl font-bold text-white">{state.waiting.length} in queue</p>
            </div>
            <span className={`text-xl transition-transform ${expandedSections.has('waiting') ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {expandedSections.has('waiting') && (
            <div className="divide-y divide-slate-700 max-h-96 overflow-y-auto">
              {state.waiting.length === 0 ? (
                <div className="p-4 sm:p-6 text-center text-slate-400">No one waiting</div>
              ) : (
                state.waiting.map((entry) => (
                  <div key={entry.id} className="p-4 sm:p-6 hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-slate-700 rounded flex items-center justify-center font-bold text-white">
                        #{entry.queue_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm sm:text-base">
                          {entry.client_name || 'Guest'}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400">
                          {getServiceName(entry.service_id)}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleSkipWaiting(entry.id)}
                          disabled={loadingActions[entry.id]}
                          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 rounded transition-colors disabled:opacity-50"
                        >
                          Skip
                        </button>
                        <button
                          onClick={() => handleCancelEntry(entry.id)}
                          disabled={loadingActions[entry.id]}
                          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Completed Section */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('completed')}
            className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors border-b border-slate-700"
          >
            <div className="text-left">
              <p className="text-xs sm:text-sm text-green-400 font-semibold uppercase">Completed</p>
              <p className="text-lg sm:text-xl font-bold text-white">✓ {state.completed.length}</p>
            </div>
            <span className={`text-xl transition-transform ${expandedSections.has('completed') ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {expandedSections.has('completed') && (
            <div className="divide-y divide-slate-700 max-h-96 overflow-y-auto">
              {state.completed.length === 0 ? (
                <div className="p-4 sm:p-6 text-center text-slate-400">No completed yet</div>
              ) : (
                state.completed.map((entry) => (
                  <div key={entry.id} className="p-4 sm:p-6 bg-green-500/5">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-green-600/20 rounded flex items-center justify-center font-bold text-green-400">
                        #{entry.queue_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm sm:text-base">
                          {entry.client_name || 'Guest'}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400">
                          {getServiceName(entry.service_id)}
                        </p>
                      </div>
                      <div className="text-right text-xs sm:text-sm text-slate-500 flex-shrink-0">
                        {getTime(entry.completed_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Skipped Section */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('skipped')}
            className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors border-b border-slate-700"
          >
            <div className="text-left">
              <p className="text-xs sm:text-sm text-amber-400 font-semibold uppercase">Skipped (No-show)</p>
              <p className="text-lg sm:text-xl font-bold text-white">⊘ {state.skipped.length}</p>
            </div>
            <span className={`text-xl transition-transform ${expandedSections.has('skipped') ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {expandedSections.has('skipped') && (
            <div className="divide-y divide-slate-700 max-h-96 overflow-y-auto">
              {state.skipped.length === 0 ? (
                <div className="p-4 sm:p-6 text-center text-slate-400">No skipped</div>
              ) : (
                state.skipped.map((entry) => (
                  <div key={entry.id} className="p-4 sm:p-6 bg-amber-500/5">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-amber-600/20 rounded flex items-center justify-center font-bold text-amber-400">
                        #{entry.queue_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm sm:text-base">
                          {entry.client_name || 'Guest'}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400">
                          {getServiceName(entry.service_id)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRequeueSkipped(entry)}
                        disabled={loadingActions[entry.id]}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm flex-shrink-0 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded transition-colors disabled:opacity-50"
                      >
                        {loadingActions[entry.id] ? '...' : 'Rejoin'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Cancelled Section */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('cancelled')}
            className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors border-b border-slate-700"
          >
            <div className="text-left">
              <p className="text-xs sm:text-sm text-red-400 font-semibold uppercase">Cancelled</p>
              <p className="text-lg sm:text-xl font-bold text-white">✕ {state.cancelled.length}</p>
            </div>
            <span className={`text-xl transition-transform ${expandedSections.has('cancelled') ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {expandedSections.has('cancelled') && (
            <div className="divide-y divide-slate-700 max-h-96 overflow-y-auto">
              {state.cancelled.length === 0 ? (
                <div className="p-4 sm:p-6 text-center text-slate-400">No cancelled</div>
              ) : (
                state.cancelled.map((entry) => (
                  <div key={entry.id} className="p-4 sm:p-6 bg-red-500/5">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-red-600/20 rounded flex items-center justify-center font-bold text-red-400">
                        #{entry.queue_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm sm:text-base">
                          {entry.client_name || 'Guest'}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-400">
                          {getServiceName(entry.service_id)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRequeueSkipped(entry)}
                        disabled={loadingActions[entry.id]}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm flex-shrink-0 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded transition-colors disabled:opacity-50"
                      >
                        {loadingActions[entry.id] ? '...' : 'Rejoin'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <div className="h-4" />
      </main>
    </div>
  );
}
