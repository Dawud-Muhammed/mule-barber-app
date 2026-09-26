'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getShopDate } from '@/lib/shopDate';
import { notifyQueueStateChange, notifyTerminalEntry } from '@/lib/notificationRules';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];

interface QueueActionResult {
  success: boolean;
  error?: string;
  promotedEntry?: QueueEntry | null;
  acceptingQueue?: boolean;
}

async function notifyAfterChange() {
  try {
    await notifyQueueStateChange();
  } catch (error) {
    console.error('[queue notifications]', error);
  }
}

export async function startService(): Promise<QueueActionResult> {
  try {
    const { data, error } = await createAdminClient().rpc('start_service', {
      p_queue_date: getShopDate(),
    });
    if (error) {
      console.error('[start service]', error);
      return { success: false, error: 'Generic failure' };
    }
    if (data) await notifyAfterChange();
    return { success: true, promotedEntry: data as unknown as QueueEntry };
  } catch (error) {
    console.error('[start service]', error);
    return { success: false, error: 'Generic failure' };
  }
}

async function advanceEntry(entryId: string, newStatus: 'completed' | 'skipped') {
  try {
    const { data, error } = await createAdminClient().rpc('advance_queue', {
      p_queue_date: getShopDate(),
      p_current_entry_id: entryId,
      p_new_status: newStatus,
    });
    if (error) {
      console.error('[advance queue]', error);
      return { success: false, error: 'Generic failure' };
    }
    if (newStatus === 'skipped') await notifyTerminalEntry(entryId, 'skipped');
    if (newStatus === 'completed') await notifyTerminalEntry(entryId, 'completed');
    await notifyAfterChange();
    return { success: true, promotedEntry: data as unknown as QueueEntry };
  } catch (error) {
    console.error('[advance queue]', error);
    return { success: false, error: 'Generic failure' };
  }
}

export async function completeEntry(entryId: string): Promise<QueueActionResult> {
  return advanceEntry(entryId, 'completed');
}

export async function skipInService(entryId: string): Promise<QueueActionResult> {
  return advanceEntry(entryId, 'skipped');
}

async function updateWaitingEntry(entryId: string, status: 'skipped' | 'cancelled') {
  try {
    const { data, error } = await createAdminClient()
      .from('queue_entries')
      .update({ status, completed_at: new Date().toISOString() })
      .eq('id', entryId)
      .eq('queue_date', getShopDate())
      .eq('status', 'waiting')
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[waiting entry]', error);
      return { success: false, error: 'Generic failure' };
    }
    if (data) {
      await notifyTerminalEntry(entryId, status);
      await notifyAfterChange();
    }
    return { success: true, promotedEntry: null };
  } catch (error) {
    console.error('[waiting entry]', error);
    return { success: false, error: 'Generic failure' };
  }
}

export async function skipWaiting(entryId: string): Promise<QueueActionResult> {
  return updateWaitingEntry(entryId, 'skipped');
}

export async function cancelEntry(entryId: string): Promise<QueueActionResult> {
  return updateWaitingEntry(entryId, 'cancelled');
}

export async function requeueEntry(entryId: string): Promise<QueueActionResult> {
  try {
    const { data, error } = await createAdminClient().rpc('requeue_entry', {
      p_queue_date: getShopDate(),
      p_entry_id: entryId,
    });
    if (error) {
      console.error('[requeue]', error);
      return { success: false, error: 'Generic failure' };
    }
    if (!data) return { success: false, error: 'Generic failure' };
    await notifyAfterChange();
    return { success: true, promotedEntry: data as unknown as QueueEntry };
  } catch (error) {
    console.error('[requeue]', error);
    return { success: false, error: 'Generic failure' };
  }
}

export async function markLost(entryId: string): Promise<QueueActionResult> {
  try {
    const { data, error } = await createAdminClient()
      .from('queue_entries')
      .update({ status: 'lost' })
      .eq('id', entryId)
      .eq('queue_date', getShopDate())
      .eq('status', 'skipped')
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[mark lost]', error);
      return { success: false, error: 'Generic failure' };
    }
    return data ? { success: true, promotedEntry: null } : { success: false, error: 'Generic failure' };
  } catch (error) {
    console.error('[mark lost]', error);
    return { success: false, error: 'Generic failure' };
  }
}

export async function toggleQueueStatus(): Promise<QueueActionResult> {
  try {
    const { data, error } = await createAdminClient().rpc('toggle_accepting_queue');
    if (error || !data) {
      console.error('[queue status]', error);
      return { success: false, error: 'Generic failure' };
    }
    const state = data as { accepting_queue: boolean };
    return { success: true, acceptingQueue: state.accepting_queue };
  } catch (error) {
    console.error('[queue status]', error);
    return { success: false, error: 'Generic failure' };
  }
}
