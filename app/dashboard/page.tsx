/**
 * /dashboard
 * Owner queue dashboard with live Realtime updates.
 * Shows in-service entry and waiting queue.
 */
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];
type Service = Database['public']['Tables']['services']['Row'];

interface DashboardState {
  inService: QueueEntry | null;
  waiting: QueueEntry[];
  services: Map<string, Service>;
  loading: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'connecting';
  lastUpdate: Date | null;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]; // ms, with exponential backoff cap

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({
    inService: null,
    waiting: [],
    services: new Map(),
    loading: true,
    connectionStatus: 'connecting' as const,
    lastUpdate: null,
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const reconnectAttempts = useRef(0);
  const realtimeUnsubscribe = useRef<(() => void) | null>(null);

  // Fetch today's queue data
  const fetchQueueData = useCallback(async () => {
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      // Fetch in_service entry
      const { data: inServiceData } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_date', today)
        .eq('status', 'in_service')
        .single();

      // Fetch waiting entries ordered by queue_number
      const { data: waitingData } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_date', today)
        .eq('status', 'waiting')
        .order('queue_number', { ascending: true });

      // Fetch services for display
      const { data: servicesData } = await supabase
        .from('services')
        .select('*');

      setState((prev) => ({
        ...prev,
        inService: inServiceData || null,
        waiting: waitingData || [],
        services: new Map((servicesData || []).map((s) => [s.id, s])),
        connectionStatus: 'connected',
        lastUpdate: new Date(),
      }));

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

      // Unsubscribe from previous channel if exists
      if (realtimeUnsubscribe.current) {
        realtimeUnsubscribe.current();
      }

      // Subscribe to all queue_entries changes for today
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
            // Re-fetch data on any change
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

  // Handle Realtime disconnection with backoff retry
  const handleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= RECONNECT_DELAYS.length) {
      // Cap at final delay
      reconnectAttempts.current = RECONNECT_DELAYS.length - 1;
    }

    const delay = RECONNECT_DELAYS[reconnectAttempts.current];
    reconnectAttempts.current++;

    console.log('[realtime] reconnecting in', delay, 'ms');
    setState((prev) => ({
      ...prev,
      connectionStatus: 'reconnecting',
    }));

    setTimeout(() => {
      subscribeToRealtimeUpdates();
    }, delay);
  }, [subscribeToRealtimeUpdates]);

  // Initial setup: check auth, fetch data, subscribe
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

      setIsAuthenticated(true);
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

  // Watch for disconnection and attempt reconnect
  useEffect(() => {
    if (state.connectionStatus === 'disconnected') {
      const timer = setTimeout(() => {
        handleReconnect();
      }, 2000); // Brief delay before attempting
      return () => clearTimeout(timer);
    }
  }, [state.connectionStatus, handleReconnect]);

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
            <span className="text-sm font-medium">
              {state.connectionStatus === 'reconnecting'
                ? 'Connection lost — reconnecting...'
                : 'Connection lost — reconnecting...'}
            </span>
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
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-slate-500">
                        {new Date(entry.joined_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Refresh Button (Fallback) */}
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
    </div>
  );
}
