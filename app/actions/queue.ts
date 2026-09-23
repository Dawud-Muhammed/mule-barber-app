/**
 * Server actions for queue operations.
 * All use service-role client (server-side only).
 * Returns new promoted entry or null for Realtime reconciliation.
 * Triggers Phase 5 auto-notifications after each state-changing action.
 */
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeNotificationsToSend,
  sendAndUpdateNotifications,
  sendNewJoinerNotifications,
} from '@/lib/notificationRules';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];

interface QueueActionResult {
  success: boolean;
  error?: string;
  promotedEntry?: QueueEntry | null;
}

/**
 * Helper to trigger notifications after action (fire-and-forget).
 * Never breaks the triggering action.
 */
async function triggerNotifications() {
  try {
    const toSend = await computeNotificationsToSend();
    await sendAndUpdateNotifications(toSend);
  } catch (err) {
    console.error('[triggerNotifications] error:', err);
  }
}

/**
 * Complete the current in_service entry.
 * Calls advance_queue('next', entry_id) and returns the new in_service entry.
 * Triggers Phase 5 notifications.
 */
export async function completeEntry(entryId: string): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('advance_queue', {
      p_action: 'next',
      p_entry_id: entryId,
    });

    if (error) {
      console.error('[completeEntry] RPC error:', error);
      return { success: false, error: 'Failed to complete entry' };
    }

    // Trigger notifications (fire-and-forget)
    triggerNotifications();

    const promotedEntry = (data as any)?.new_in_service_entry || null;
    return { success: true, promotedEntry };
  } catch (err) {
    console.error('[completeEntry] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Skip the current in_service entry (no-show).
 * Calls advance_queue('skip', entry_id) and returns the new in_service entry.
 */
export async function skipInService(entryId: string): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('advance_queue', {
      p_action: 'skip',
      p_entry_id: entryId,
    });

    if (error) {
      console.error('[skipInService] RPC error:', error);
      return { success: false, error: 'Failed to skip entry' };
    }

    // Trigger notifications
    triggerNotifications();

    const promotedEntry = (data as any)?.new_in_service_entry || null;
    return { success: true, promotedEntry };
  } catch (err) {
    console.error('[skipInService] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Skip a waiting entry (they're not in the chair, no promotion needed).
 * Updates status to 'skipped' directly.
 */
export async function skipWaiting(entryId: string): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    const { error } = await admin
      .from('queue_entries')
      .update({ status: 'skipped' })
      .eq('id', entryId);

    if (error) {
      console.error('[skipWaiting] error:', error);
      return { success: false, error: 'Failed to skip entry' };
    }

    // Trigger notifications (other entries may move up)
    triggerNotifications();

    return { success: true, promotedEntry: null };
  } catch (err) {
    console.error('[skipWaiting] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Cancel a waiting entry.
 * Updates status to 'cancelled' directly.
 */
export async function cancelEntry(entryId: string): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    const { error } = await admin
      .from('queue_entries')
      .update({ status: 'cancelled' })
      .eq('id', entryId);

    if (error) {
      console.error('[cancelEntry] error:', error);
      return { success: false, error: 'Failed to cancel entry' };
    }

    // Trigger notifications
    triggerNotifications();

    return { success: true, promotedEntry: null };
  } catch (err) {
    console.error('[cancelEntry] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Requeue a skipped entry.
 * Calls assign_queue_number() fresh (they go to the back with new number).
 * Resets notified_close/notified_next so Phase 5 re-notifies at new position.
 */
export async function requeueSkipped(
  chatId: number,
  clientName: string,
  serviceId: string
): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('assign_queue_number', {
      p_telegram_chat_id: chatId,
      p_client_name: clientName,
      p_service_id: serviceId,
    });

    if (error) {
      console.error('[requeueSkipped] RPC error:', error);
      return { success: false, error: 'Failed to requeue entry' };
    }

    const response = data as any;
    if (!response?.success) {
      return {
        success: false,
        error: response?.error || 'Failed to requeue',
      };
    }

    // Trigger notifications for the new joiner position
    triggerNotifications();

    return { success: true, promotedEntry: null };
  } catch (err) {
    console.error('[requeueSkipped] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Join the queue (from Telegram bot or dashboard).
 * This is called by the bot's assign_queue_number() RPC.
 * For Phase 5, we need to trigger notifications when a new entry is created.
 * However, the bot calls assign_queue_number() directly via RPC.
 * This server action exists for potential dashboard client joins in future phases.
 */
export async function joinQueue(
  chatId: number,
  clientName: string,
  serviceId: string
): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('assign_queue_number', {
      p_telegram_chat_id: chatId,
      p_client_name: clientName,
      p_service_id: serviceId,
    });

    if (error) {
      console.error('[joinQueue] RPC error:', error);
      return { success: false, error: 'Failed to join queue' };
    }

    const response = data as any;
    if (!response?.success) {
      return {
        success: false,
        error: response?.error || 'Failed to join queue',
      };
    }

    // New joiner: send applicable notifications immediately
    const newEntryId = response.id;
    sendNewJoinerNotifications(newEntryId);

    return { success: true, promotedEntry: null };
  } catch (err) {
    console.error('[joinQueue] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}
