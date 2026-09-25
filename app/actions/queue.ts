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

    console.log('[completeEntry] RPC response:', data);

    // Trigger notifications (fire-and-forget)
    triggerNotifications();

    const result = data as any;
    const promotedEntry = result?.new_in_service_entry || null;
    return { success: result?.success !== false, promotedEntry };
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

    console.log('[skipInService] RPC response:', data);

    // Trigger notifications
    triggerNotifications();

    const result = data as any;
    const promotedEntry = result?.new_in_service_entry || null;
    return { success: result?.success !== false, promotedEntry };
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
 * Toggle the shop's queue acceptance status.
 */
export async function toggleQueueStatus(): Promise<QueueActionResult> {
  try {
    const admin = createAdminClient();

    // Fetch current state
    const { data: currentState, error: fetchError } = await admin
      .from('shop_state')
      .select('accepting_queue')
      .eq('id', true)
      .single();

    if (fetchError || !currentState) {
      console.error('[toggleQueueStatus] fetch error:', fetchError);
      return { success: false, error: 'Failed to toggle queue status' };
    }

    // Toggle
    const newStatus = !currentState.accepting_queue;
    const { error: updateError } = await admin
      .from('shop_state')
      .update({ accepting_queue: newStatus })
      .eq('id', true);

    if (updateError) {
      console.error('[toggleQueueStatus] update error:', updateError);
      return { success: false, error: 'Failed to update queue status' };
    }

    return { success: true, promotedEntry: null };
  } catch (err) {
    console.error('[toggleQueueStatus] error:', err);
    return { success: false, error: 'Unexpected error' };
  }
}
