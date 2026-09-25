/**
 * /dashboard
 * Modern 2026 queue dashboard with glass morphism, smooth animations, and intuitive UX.
 * Shows Now Serving, Waiting, Completed, Skipped, and Cancelled.
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
import { hasUnsendNotification } from '@/lib/notificationRules';
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
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'connecting';
  lastUpdate: Date | null;
}

interface LoadingState {
  [key: string]: boolean;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];

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
    connectionStatus: 'connecting',
    lastUpdate: null,
  });
  const [loadingActions, setLoadingActions] = useState<LoadingState>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    action: string;
    entryId: string;
    title: string;
    message: string;
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['waiting']));
  const [unsentNotifications, setUnsentNotifications] = useState<Set<string>>(new Set());

  const reconnectAttempts = useRef(0);
  const realtimeUnsubscribe = useRef<(() => void) | null>(null);

  // Fetch today's queue data
  const fetchQueueData = useCallback(async () => {
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      const { data: allData } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_date', today)
        .in('status', ['in_service', 'waiting', 'completed', 'skipped', 'cancelled'])
        .order('queue_number', { ascending: true });

      const { data: servicesData } = await supabase.from('services').select('*');

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
          connectionStatus: 'connected',
          lastUpdate: new Date(),
        }));

        const unsent = new Set<string>();
        for (const entry of waitingEntries) {
          const hasUnsent = await hasUnsendNotification(entry.id);
          if (hasUnsent) {
            unsent.add(entry.id);
          }
        }
        setUnsentNotifications(unsent);
      }

      reconnectAttempts.current = 0;
    } catch (err) {
      console.error('[dashboard] fetch error:', err);
      setState((prev) => ({
        ...prev,
        connectionStatus: 'disconnected',
      }));
    }
  }, []);

  // Subscribe to Realtime updates
  const subscribeToRealtimeUpdates = useCallback(() => {
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
          (payload) => {
            fetchQueueData();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setState((prev) => ({
              ...prev,
              connectionStatus: 'connected',
            }));
            reconnectAttempts.current = 0;
          } else if (status === 'CHANNEL_ERROR') {
            setState((prev) => ({
              ...prev,
              connectionStatus: 'disconnected',
            }));
          }
        });

      realtimeUnsubscribe.current = () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.error('[realtime] subscription error:', err);
      setState((prev) => ({
        ...prev,
        connectionStatus: 'disconnected',
      }));
    }
  }, [fetchQueueData]);

  const handleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= RECONNECT_DELAYS.length) {
      reconnectAttempts.current = RECONNECT_DELAYS.length - 1;
    }

    const delay = RECONNECT_DELAYS[reconnectAttempts.current];
    reconnectAttempts.current++;

    setState((prev) => ({
      ...prev,
      connectionStatus: 'reconnecting',
    }));

    setTimeout(() => {
      subscribeToRealtimeUpdates();
    }, delay);
  }, [subscribeToRealtimeUpdates]);

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
      subscribeToRealtimeUpdates();
    };

    init();

    return () => {
      if (realtimeUnsubscribe.current) {
        realtimeUnsubscribe.current();
      }
    };
  }, [fetchQueueData, subscribeToRealtimeUpdates, router]);

  useEffect(() => {
    if (state.connectionStatus === 'disconnected') {
      const timer = setTimeout(() => {
        handleReconnect();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.connectionStatus, handleReconnect]);

  // Action handlers
  const handleStartService = async () => {
    if (state.waiting.length === 0) return;

    const firstWaiting = state.waiting[0];
    const entryId = firstWaiting.id;
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));

    try {
      // Update status to in_service
      const supabase = createClient();
      await supabase
        .from('queue_entries')
        .update({ status: 'in_service', started_at: new Date().toISOString() })
        .eq('id', entryId);

      setState((prev) => ({
        ...prev,
        inService: firstWaiting,
        waiting: prev.waiting.slice(1),
      }));
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleCompleteEntry = async () => {
    if (!state.inService) return;

    const entryId = state.inService.id;
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));

    try {
      const result = await completeEntry(entryId);
      if (result.success) {
        setState((prev) => ({
          ...prev,
          inService: result.promotedEntry || null,
          completed: [...prev.completed, prev.inService!],
        }));
      }
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleSkipInService = async () => {
    if (!state.inService) return;

    const entryId = state.inService.id;
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));

    try {
      const result = await skipInService(entryId);
      if (result.success) {
        setState((prev) => ({
          ...prev,
          inService: result.promotedEntry || null,
          skipped: [...prev.skipped, prev.inService!],
        }));
      }
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleSkipWaiting = async (entryId: string) => {
    setConfirmDialog({
      action: 'skip_waiting',
      entryId,
      title: 'No-show?',
      message: 'Mark as skipped. They can rejoin anytime.',
    });
  };

  const handleCancelEntry = async (entryId: string) => {
    setConfirmDialog({
      action: 'cancel',
      entryId,
      title: 'Cancel Entry?',
      message: 'Remove from queue. They can rejoin anytime.',
    });
  };

  const handleRequeueSkipped = async (entry: QueueEntry) => {
    if (!entry.telegram_chat_id || !entry.service_id) return;

    setLoadingActions((prev) => ({ ...prev, [entry.id]: true }));

    try {
      const result = await requeueSkipped(
        entry.telegram_chat_id,
        entry.client_name || '',
        entry.service_id
      );
      if (result.success) {
        setState((prev) => ({
          ...prev,
          skipped: prev.skipped.filter((e) => e.id !== entry.id),
        }));
      }
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entry.id]: false }));
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmDialog) return;

    const { action, entryId } = confirmDialog;
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));

    try {
      if (action === 'skip_waiting') {
        await skipWaiting(entryId);
        setState((prev) => ({
          ...prev,
          waiting: prev.waiting.filter((e) => e.id !== entryId),
          skipped: [...prev.skipped, prev.waiting.find(e => e.id === entryId)!],
        }));
      } else if (action === 'cancel') {
        await cancelEntry(entryId);
        setState((prev) => ({
          ...prev,
          waiting: prev.waiting.filter((e) => e.id !== entryId),
          cancelled: [...prev.cancelled, prev.waiting.find(e => e.id === entryId)!],
        }));
      }
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
      setConfirmDialog(null);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Animated background grid */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-grid-pattern"></div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50 shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                Mule Barber
              </h1>
              <p className="text-slate-400 text-sm mt-1">Queue Management System</p>
            </div>
            <div className="flex items-center gap-4">
              {state.connectionStatus === 'connected' && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-400">Live</span>
                </div>
              )}
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  router.push('/login');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg transition-all duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Now Serving Section */}
          <div className="group">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-500"></div>
              <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>

                <div className="relative px-8 py-8">
                  {state.inService ? (
                    <div className="space-y-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-slate-400 text-sm font-medium">NOW SERVING</p>
                          <p className="text-7xl font-bold text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text mt-2">
                            #{state.inService.queue_number}
                          </p>
                          <p className="text-2xl text-slate-200 font-semibold mt-4">
                            {state.inService.client_name || 'Guest'}
                          </p>
                          <p className="text-slate-400 mt-2">
                            {getServiceName(state.inService.service_id)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-500 text-sm">Started at</p>
                          <p className="text-2xl font-semibold text-slate-200">
                            {state.inService.started_at
                              ? new Date(state.inService.started_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-6 border-t border-slate-700/50">
                        <button
                          onClick={handleCompleteEntry}
                          disabled={loadingActions[state.inService.id]}
                          className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95"
                        >
                          {loadingActions[state.inService.id] ? '⏳ Processing...' : '✓ Complete'}
                        </button>
                        <button
                          onClick={handleSkipInService}
                          disabled={loadingActions[state.inService.id]}
                          className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95"
                        >
                          {loadingActions[state.inService.id] ? '⏳ Processing...' : '⊘ No-show'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <p className="text-slate-400 text-lg mb-6">No one being served</p>
                      <button
                        onClick={handleStartService}
                        disabled={state.waiting.length === 0}
                        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95"
                      >
                        {state.waiting.length === 0 ? 'Queue Empty' : '▶ Start Service'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Grid Layout for Waiting, Completed, Skipped, Cancelled */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Waiting Section */}
            <div>
              <button
                onClick={() => toggleSection('waiting')}
                className="w-full group"
              >
                <div className="relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-slate-600 to-slate-700 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-500"></div>
                  <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl px-6 py-4 flex items-center justify-between hover:border-slate-600/50 transition-all">
                    <div>
                      <p className="text-slate-400 text-sm font-medium">WAITING</p>
                      <p className="text-2xl font-bold text-white mt-1">{state.waiting.length} in queue</p>
                    </div>
                    <span className={`text-2xl transition-transform ${expandedSections.has('waiting') ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {expandedSections.has('waiting') && (
                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                  {state.waiting.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>No one waiting</p>
                    </div>
                  ) : (
                    state.waiting.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="group/item bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:bg-slate-800 hover:border-slate-600/50 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-slate-300">#{entry.queue_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-200">{entry.client_name || 'Guest'}</p>
                            <p className="text-sm text-slate-400">{getServiceName(entry.service_id)}</p>
                          </div>
                          {unsentNotifications.has(entry.id) && (
                            <span className="text-lg" title="Notification pending">⚠️</span>
                          )}
                          <div className="flex gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleSkipWaiting(entry.id)}
                              disabled={loadingActions[entry.id]}
                              className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-xs font-medium rounded transition-all"
                            >
                              Skip
                            </button>
                            <button
                              onClick={() => handleCancelEntry(entry.id)}
                              disabled={loadingActions[entry.id]}
                              className="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-300 text-xs font-medium rounded transition-all"
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
            </div>

            {/* Completed Section */}
            <div>
              <button
                onClick={() => toggleSection('completed')}
                className="w-full group"
              >
                <div className="relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-500"></div>
                  <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl px-6 py-4 flex items-center justify-between hover:border-slate-600/50 transition-all">
                    <div>
                      <p className="text-green-400 text-sm font-medium">COMPLETED</p>
                      <p className="text-2xl font-bold text-white mt-1">✓ {state.completed.length}</p>
                    </div>
                    <span className={`text-2xl transition-transform ${expandedSections.has('completed') ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {expandedSections.has('completed') && (
                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                  {state.completed.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>No completed yet</p>
                    </div>
                  ) : (
                    state.completed.map((entry) => (
                      <div key={entry.id} className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0 w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-green-400">#{entry.queue_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-200">{entry.client_name || 'Guest'}</p>
                            <p className="text-sm text-slate-400">{getServiceName(entry.service_id)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">
                              {entry.completed_at
                                ? new Date(entry.completed_at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Skipped Section */}
            <div>
              <button
                onClick={() => toggleSection('skipped')}
                className="w-full group"
              >
                <div className="relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-500"></div>
                  <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl px-6 py-4 flex items-center justify-between hover:border-slate-600/50 transition-all">
                    <div>
                      <p className="text-amber-400 text-sm font-medium">SKIPPED (No-show)</p>
                      <p className="text-2xl font-bold text-white mt-1">⊘ {state.skipped.length}</p>
                    </div>
                    <span className={`text-2xl transition-transform ${expandedSections.has('skipped') ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {expandedSections.has('skipped') && (
                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                  {state.skipped.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>No skipped</p>
                    </div>
                  ) : (
                    state.skipped.map((entry) => (
                      <div key={entry.id} className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0 w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-amber-400">#{entry.queue_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-200">{entry.client_name || 'Guest'}</p>
                            <p className="text-sm text-slate-400">{getServiceName(entry.service_id)}</p>
                          </div>
                          <button
                            onClick={() => handleRequeueSkipped(entry)}
                            disabled={loadingActions[entry.id]}
                            className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-medium rounded transition-all"
                          >
                            {loadingActions[entry.id] ? '...' : 'Rejoin'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Cancelled Section */}
            <div>
              <button
                onClick={() => toggleSection('cancelled')}
                className="w-full group"
              >
                <div className="relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-rose-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-500"></div>
                  <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl px-6 py-4 flex items-center justify-between hover:border-slate-600/50 transition-all">
                    <div>
                      <p className="text-red-400 text-sm font-medium">CANCELLED</p>
                      <p className="text-2xl font-bold text-white mt-1">✕ {state.cancelled.length}</p>
                    </div>
                    <span className={`text-2xl transition-transform ${expandedSections.has('cancelled') ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {expandedSections.has('cancelled') && (
                <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                  {state.cancelled.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>No cancelled</p>
                    </div>
                  ) : (
                    state.cancelled.map((entry) => (
                      <div key={entry.id} className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0 w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-red-400">#{entry.queue_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-200">{entry.client_name || 'Guest'}</p>
                            <p className="text-sm text-slate-400">{getServiceName(entry.service_id)}</p>
                          </div>
                          <button
                            onClick={() => handleRequeueSkipped(entry)}
                            disabled={loadingActions[entry.id]}
                            className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs font-medium rounded transition-all"
                          >
                            {loadingActions[entry.id] ? '...' : 'Rejoin'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-slate-500 text-sm py-8">
            <p>Last update: {state.lastUpdate?.toLocaleTimeString() || 'loading...'}</p>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl p-8 max-w-sm">
            <h3 className="text-2xl font-bold text-white mb-3">
              {confirmDialog.title}
            </h3>
            <p className="text-slate-400 mb-8">{confirmDialog.message}</p>
            <div className="flex gap-4">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={loadingActions[confirmDialog.entryId]}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-medium rounded-lg transition-all"
              >
                {loadingActions[confirmDialog.entryId] ? '⏳' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes grid {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 40px 40px;
          }
        }
        .bg-grid-pattern {
          background-image:
            linear-gradient(45deg, #475569 25%, transparent 25%),
            linear-gradient(-45deg, #475569 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #475569 75%),
            linear-gradient(-45deg, transparent 75%, #475569 75%);
          background-size: 40px 40px;
          background-position: 0 0, 0 20px, 20px -20px, -20px 0px;
          animation: grid 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
