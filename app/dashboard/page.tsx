/**
 * /dashboard
 * Owner queue dashboard with live Realtime updates and action buttons.
 * Shows in-service entry, waiting queue, and skipped entries.
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
  skipped: QueueEntry[];
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
    skipped: [],
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
  const [skippedExpanded, setSkippedExpanded] = useState(false);

  const reconnectAttempts = useRef(0);
  const realtimeUnsubscribe = useRef<(() => void) | null>(null);

  // Fetch today's queue data
  const fetchQueueData = useCallback(async () => {
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      // Fetch in_service, waiting, and skipped entries
      const { data: allData } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_date', today)
        .in('status', ['in_service', 'waiting', 'skipped'])
        .order('queue_number', { ascending: true });

      // Fetch services
      const { data: servicesData } = await supabase.from('services').select('*');

      if (allData) {
        const inServiceEntry = allData.find((e) => e.status === 'in_service') || null;
        const waitingEntries = allData.filter((e) => e.status === 'waiting');
        const skippedEntries = allData.filter((e) => e.status === 'skipped');

        setState((prev) => ({
          ...prev,
          inService: inServiceEntry,
          waiting: waitingEntries,
          skipped: skippedEntries,
          services: new Map((servicesData || []).map((s) => [s.id, s])),
          connectionStatus: 'connected',
          lastUpdate: new Date(),
        }));
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
            console.log('[realtime] update received:', payload);
            fetchQueueData();
          }
        )
        .subscribe((status) => {
          console.log('[realtime] subscription status:', status);
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

  // Handle reconnect
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

  // Initial setup
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

  // Watch for disconnection
  useEffect(() => {
    if (state.connectionStatus === 'disconnected') {
      const timer = setTimeout(() => {
        handleReconnect();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.connectionStatus, handleReconnect]);

  // Action handlers
  const handleCompleteEntry = async () => {
    if (!state.inService) return;

    const entryId = state.inService.id;
    setLoadingActions((prev) => ({ ...prev, [entryId]: true }));

    try {
      const result = await completeEntry(entryId);
      if (result.success) {
        // Optimistic update: mark as completed
        setState((prev) => ({
          ...prev,
          inService:
            result.promotedEntry || null,
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
      title: 'Skip Entry?',
      message: 'This will remove them from the queue. They can rejoin anytime.',
    });
  };

  const handleCancelEntry = async (entryId: string) => {
    setConfirmDialog({
      action: 'cancel',
      entryId,
      title: 'Cancel Entry?',
      message: 'This will remove them from the queue. They can rejoin anytime.',
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
        // Optimistic: remove from skipped, add to waiting
        setState((prev) => ({
          ...prev,
          skipped: prev.skipped.filter((e) => e.id !== entry.id),
        }));
        // Realtime will fetch and reconcile
      }
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entry.id]: false }));
    }
  };

  // Execute confirmed action
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
        }));
      } else if (action === 'cancel') {
        await cancelEntry(entryId);
        setState((prev) => ({
          ...prev,
          waiting: prev.waiting.filter((e) => e.id !== entryId),
        }));
      }
    } finally {
      setLoadingActions((prev) => ({ ...prev, [entryId]: false }));
      setConfirmDialog(null);
    }
  };

  const getServiceName = (serviceId: string | null) => {
    if (!serviceId) return 'Service';
    return state.services.get(serviceId)?.name || 'Service';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-1">Mule Barber</h1>
            <p className="text-slate-600">Queue Dashboard</p>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/login');
            }}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 font-medium rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Connection Status */}
      {state.connectionStatus !== 'connected' && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className={`p-3 rounded-lg flex items-center gap-2 ${
            state.connectionStatus === 'reconnecting'
              ? 'bg-amber-100 border border-amber-300 text-amber-900'
              : 'bg-red-100 border border-red-300 text-red-900'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              state.connectionStatus === 'reconnecting'
                ? 'bg-amber-600 animate-pulse'
                : 'bg-red-600'
            }`} />
            <span className="text-sm font-medium">Connection lost — reconnecting...</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto space-y-6">
        {/* In-Service Card */}
        <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <h2 className="text-2xl font-bold text-white">Now Serving</h2>
          </div>

          <div className="p-6">
            {state.inService ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-5xl font-bold text-blue-600 mb-2">
                      Queue #{state.inService.queue_number}
                    </p>
                    <p className="text-xl text-slate-700">
                      {state.inService.client_name || 'Guest'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {getServiceName(state.inService.service_id)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">
                      Since {state.inService.started_at
                        ? new Date(state.inService.started_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={handleCompleteEntry}
                    disabled={loadingActions[state.inService.id]}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {loadingActions[state.inService.id] ? 'Completing...' : '✓ Complete Customer'}
                  </button>
                  <button
                    onClick={handleSkipInService}
                    disabled={loadingActions[state.inService.id]}
                    className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {loadingActions[state.inService.id] ? 'Skipping...' : '⊘ Skip (No-show)'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <p className="text-lg">Queue is empty</p>
              </div>
            )}
          </div>
        </div>

        {/* Waiting Queue */}
        <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-4">
            <h2 className="text-xl font-bold text-white">
              Waiting ({state.waiting.length})
            </h2>
          </div>

          <div className="p-6">
            {state.waiting.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-lg">Queue is empty</p>
              </div>
            ) : (
              <div className="space-y-2">
                {state.waiting.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
                      <span className="text-lg font-bold text-slate-700">
                        #{entry.queue_number}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">
                        {entry.client_name || 'Guest'}
                      </p>
                      <p className="text-sm text-slate-600">
                        {getServiceName(entry.service_id)}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right mr-4">
                      <p className="text-xs text-slate-500">
                        {new Date(entry.joined_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSkipWaiting(entry.id)}
                        disabled={loadingActions[entry.id]}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors disabled:cursor-not-allowed"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => handleCancelEntry(entry.id)}
                        disabled={loadingActions[entry.id]}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Skipped Today (Collapsible) */}
        {state.skipped.length > 0 && (
          <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
            <button
              onClick={() => setSkippedExpanded(!skippedExpanded)}
              className="w-full bg-slate-100 hover:bg-slate-200 px-6 py-4 flex items-center justify-between transition-colors"
            >
              <h2 className="text-lg font-bold text-slate-900">
                Skipped Today ({state.skipped.length})
              </h2>
              <span className={`transform transition-transform ${skippedExpanded ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>

            {skippedExpanded && (
              <div className="p-6 space-y-2 border-t border-slate-200">
                {state.skipped.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
                      <span className="text-lg font-bold text-slate-700">
                        #{entry.queue_number}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">
                        {entry.client_name || 'Guest'}
                      </p>
                      <p className="text-sm text-slate-600">
                        {getServiceName(entry.service_id)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRequeueSkipped(entry)}
                      disabled={loadingActions[entry.id]}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500 disabled:opacity-50 text-white font-medium rounded transition-colors disabled:cursor-not-allowed"
                    >
                      {loadingActions[entry.id] ? 'Requeuing...' : 'Requeue'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Refresh Button */}
        <div className="text-center">
          <button
            onClick={() => fetchQueueData()}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 font-medium rounded-lg transition-colors text-sm"
          >
            ↻ Manual Refresh
          </button>
        </div>

        {/* Last Update */}
        <div className="text-center text-xs text-slate-500">
          Last update: {state.lastUpdate?.toLocaleTimeString() || 'loading...'}
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {confirmDialog.title}
            </h3>
            <p className="text-slate-600 mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={loadingActions[confirmDialog.entryId]}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {loadingActions[confirmDialog.entryId] ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
