'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getShopDate } from '@/lib/shopDate';
import {
  cancelEntry,
  completeEntry,
  requeueEntry,
  skipInService,
  skipWaiting,
  startService,
  toggleQueueStatus,
} from '@/app/actions/queue';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];
type Service = Database['public']['Tables']['services']['Row'];
type Tab = 'live' | 'done' | 'skipped';

function Identity({ entry }: { entry: QueueEntry }) {
  return (
    <div>
      <p className="font-semibold text-white">{entry.client_name || 'Guest'}</p>
      {entry.client_phone && (
        <a className="text-sm text-blue-300 underline" href={`tel:${entry.client_phone}`}>
          {entry.client_phone}
        </a>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('live');
  const [inService, setInService] = useState<QueueEntry | null>(null);
  const [waiting, setWaiting] = useState<QueueEntry[]>([]);
  const [done, setDone] = useState<QueueEntry[]>([]);
  const [skipped, setSkipped] = useState<QueueEntry[]>([]);
  const [services, setServices] = useState<Map<string, Service>>(new Map());
  const [acceptingQueue, setAcceptingQueue] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const today = getShopDate();
    const [{ data, error: queueError }, { data: servicesData }, { data: shopState }] = await Promise.all([
      supabase.from('queue_entries').select('*').eq('queue_date', today).order('queue_number'),
      supabase.from('services').select('*'),
      supabase.from('shop_state').select('accepting_queue').eq('id', true).single(),
    ]);
    if (queueError) {
      setError('Sorry, something went wrong. Please try again.');
      return;
    }
    const entries = data || [];
    setInService(entries.find((entry) => entry.status === 'in_service') || null);
    setWaiting(entries.filter((entry) => entry.status === 'waiting'));
    setDone(entries.filter((entry) => entry.status === 'completed'));
    setSkipped(entries.filter((entry) => entry.status === 'skipped'));
    setServices(new Map((servicesData || []).map((service) => [service.id, service])));
    if (shopState) setAcceptingQueue(shopState.accepting_queue);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      await refresh();
    };
    init();
    const channel = supabase
      .channel(`dashboard-${getShopDate()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_state' }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, router]);

  const run = async (key: string, action: () => Promise<{ success: boolean; error?: string }>) => {
    if (busy[key]) return;
    setBusy((current) => ({ ...current, [key]: true }));
    setError(null);
    try {
      const result = await action();
      if (!result.success) setError(result.error || 'Sorry, something went wrong. Please try again.');
      await refresh();
    } catch {
      setError('Sorry, something went wrong. Please try again.');
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-slate-300">Loading...</main>;

  const serviceName = (id: string | null) => (id ? services.get(id)?.name || 'Service' : 'Service');
  const time = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
  const waitingRow = (entry: QueueEntry) => (
    <div key={entry.id} className="flex items-center justify-between gap-4 border-b border-slate-800 py-4">
      <div className="flex items-center gap-4"><span className="text-xl font-bold text-blue-300">#{entry.queue_number}</span><div><Identity entry={entry} /><p className="text-xs text-slate-400">{serviceName(entry.service_id)} · Joined {time(entry.joined_at)}</p>{entry.notification_error && <p className="text-xs text-amber-300">Notification failed</p>}</div></div>
      <div className="flex gap-2"><button disabled={busy[entry.id]} onClick={() => run(entry.id, () => skipWaiting(entry.id))} className="rounded bg-amber-700 px-3 py-2 text-sm">Skip</button><button disabled={busy[entry.id]} onClick={() => run(entry.id, () => cancelEntry(entry.id))} className="rounded bg-red-700 px-3 py-2 text-sm">Cancel</button></div>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-4"><div className="mx-auto flex max-w-3xl items-center justify-between"><div><h1 className="text-2xl font-bold">Mule Barber</h1><p className="text-sm text-slate-400">Today&apos;s line</p></div><button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); }} className="rounded bg-slate-700 px-3 py-2 text-sm">Sign out</button></div></header>
      {error && <div className="border-b border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">{error}</div>}
      <div className="mx-auto max-w-3xl p-4">
        <nav className="mb-6 flex gap-2 border-b border-slate-800 pb-2">{([['live', 'Live'], ['done', 'Done today'], ['skipped', 'Skipped today']] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`px-3 py-2 text-sm ${tab === value ? 'border-b-2 border-blue-400 text-white' : 'text-slate-400'}`}>{label}</button>)}</nav>
        {tab === 'live' && <>
          <section className="mb-6 rounded border border-slate-800 bg-slate-900 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs uppercase text-slate-400">Queue status</p><p className="font-semibold">{acceptingQueue ? 'Open' : 'Closed'}</p></div><button onClick={() => run('queue-status', async () => { const result = await toggleQueueStatus(); if (result.success && result.acceptingQueue !== undefined) setAcceptingQueue(result.acceptingQueue); return result; })} disabled={busy['queue-status']} className="rounded bg-blue-700 px-3 py-2 text-sm">{acceptingQueue ? 'Close line' : 'Open line'}</button></div>
            {inService ? <div><p className="mb-2 text-xs uppercase text-slate-400">In service · #{inService.queue_number}</p><Identity entry={inService} /><p className="mt-1 text-sm text-slate-400">{serviceName(inService.service_id)} · Started {time(inService.started_at)}</p><div className="mt-4 flex gap-2"><button disabled={busy[inService.id]} onClick={() => run(inService.id, () => completeEntry(inService.id))} className="rounded bg-green-700 px-4 py-2">Complete</button><button disabled={busy[inService.id]} onClick={() => run(inService.id, () => skipInService(inService.id))} className="rounded bg-amber-700 px-4 py-2">No-show</button></div></div> : <div><p className="mb-3 text-slate-400">No one is in service.</p><button disabled={!waiting.length || busy.start} onClick={() => run('start', startService)} className="rounded bg-blue-700 px-4 py-2">Start Service</button></div>}
          </section>
          <section className="rounded border border-slate-800 bg-slate-900 p-4"><h2 className="mb-2 text-lg font-semibold">Waiting ({waiting.length})</h2>{waiting.length ? waiting.map(waitingRow) : <p className="py-4 text-slate-400">No one is waiting.</p>}</section>
        </>}
        {tab === 'done' && <section className="rounded border border-slate-800 bg-slate-900 p-4"><h2 className="mb-2 text-lg font-semibold">Done today</h2>{done.map((entry) => <div key={entry.id} className="border-b border-slate-800 py-4"><Identity entry={entry} /><p className="text-sm text-slate-400">#{entry.queue_number} · {serviceName(entry.service_id)} · Completed {time(entry.completed_at)}</p></div>)}</section>}
        {tab === 'skipped' && <section className="rounded border border-slate-800 bg-slate-900 p-4"><h2 className="mb-2 text-lg font-semibold">Skipped today</h2>{skipped.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-4 border-b border-slate-800 py-4"><div><Identity entry={entry} /><p className="text-sm text-slate-400">#{entry.queue_number} · {serviceName(entry.service_id)} · {time(entry.completed_at)}</p></div><button disabled={busy[entry.id]} onClick={() => run(entry.id, () => requeueEntry(entry.telegram_chat_id, entry.client_name || 'Guest', entry.client_phone, entry.service_id || ''))} className="rounded bg-blue-700 px-3 py-2 text-sm">Requeue</button></div>)}</section>}
      </div>
    </main>
  );
}
