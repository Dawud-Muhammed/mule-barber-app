/**
 * Position-based notification rules and flag management.
 * Determines which notifications to send based on queue position and flags.
 * Implements success-only flag rule: flags only set after successful send.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTelegramMessage } from '@/lib/notifications';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];

interface NotificationToSend {
  type: 'close' | 'next';
  chatId: number;
  entryId: string;
}

/**
 * Compute today's waiting positions and determine notifications to send.
 * Returns list of notifications to send in order (close before next).
 * Does NOT send yet (caller handles sending + flag updates).
 */
export async function computeNotificationsToSend(): Promise<NotificationToSend[]> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get all waiting entries ordered by queue_number
    const { data: waitingEntries, error } = await admin
      .from('queue_entries')
      .select('id, queue_number, telegram_chat_id, notified_close, notified_next')
      .eq('queue_date', today)
      .eq('status', 'waiting')
      .order('queue_number', { ascending: true });

    if (error || !waitingEntries) {
      console.error('[notificationRules] query error:', error);
      return [];
    }

    const toSend: NotificationToSend[] = [];

    waitingEntries.forEach((entry, index) => {
      const position = index + 1; // 1-indexed position

      // Position <= 3: check for "getting close" notification
      if (position <= 3 && !entry.notified_close) {
        toSend.push({
          type: 'close',
          chatId: entry.telegram_chat_id,
          entryId: entry.id,
        });
      }

      // Position = 1: check for "you're next" notification
      if (position === 1 && !entry.notified_next) {
        toSend.push({
          type: 'next',
          chatId: entry.telegram_chat_id,
          entryId: entry.id,
        });
      }
    });

    return toSend;
  } catch (err) {
    console.error('[notificationRules] error:', err);
    return [];
  }
}

/**
 * Send all notifications and update flags (success-only rule).
 * Sends in order: close messages first, then next messages.
 * Flags only set after successful send.
 * Returns count of notifications sent.
 */
export async function sendAndUpdateNotifications(
  notificationsToSend: NotificationToSend[]
): Promise<number> {
  const admin = createAdminClient();
  let sentCount = 0;

  for (const notification of notificationsToSend) {
    const { type, chatId, entryId } = notification;

    // Attempt to send
    const success = await sendTelegramMessage(chatId, entryId, type);

    if (success) {
      // Success-only rule: update flag ONLY if send succeeded
      const updateData =
        type === 'close'
          ? { notified_close: true }
          : { notified_next: true };

      const { error } = await admin
        .from('queue_entries')
        .update(updateData)
        .eq('id', entryId);

      if (error) {
        console.error(
          `[notificationRules] failed to update flag for ${entryId}:`,
          error
        );
      } else {
        sentCount++;
      }
    } else {
      // Failed to send: flag remains false so next action retries
      console.error(
        `[notificationRules] message ${type} not sent to ${chatId}, flag left false for retry`
      );
    }
  }

  return sentCount;
}

/**
 * Check if a specific entry needs a notification.
 * Used by dashboard to show ⚠️ for entries at position <= 3 with notified_close = false.
 */
export async function hasUnsendNotification(entryId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get all waiting entries
    const { data: waitingEntries, error } = await admin
      .from('queue_entries')
      .select('id, queue_number, notified_close')
      .eq('queue_date', today)
      .eq('status', 'waiting')
      .order('queue_number', { ascending: true });

    if (error || !waitingEntries) return false;

    // Find this entry and its position
    const index = waitingEntries.findIndex((e) => e.id === entryId);
    if (index === -1) return false;

    const position = index + 1;
    const entry = waitingEntries[index];

    // Warning if: position <= 3 AND notified_close = false
    return position <= 3 && !entry.notified_close;
  } catch (err) {
    console.error('[notificationRules] hasUnsendNotification error:', err);
    return false;
  }
}

/**
 * Special case: new joiner at position <= 3.
 * Send applicable messages immediately, in order (close before next).
 */
export async function sendNewJoinerNotifications(entryId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get the new entry
    const { data: entry, error } = await admin
      .from('queue_entries')
      .select('id, queue_number, telegram_chat_id, notified_close, notified_next')
      .eq('id', entryId)
      .single();

    if (error || !entry) {
      console.error('[notificationRules] could not fetch new entry:', error);
      return;
    }

    // Get all waiting entries to compute position
    const { data: waitingEntries } = await admin
      .from('queue_entries')
      .select('id')
      .eq('queue_date', today)
      .eq('status', 'waiting')
      .order('queue_number', { ascending: true });

    if (!waitingEntries) return;

    const position = waitingEntries.findIndex((e) => e.id === entryId) + 1;

    // Send messages in order
    if (position <= 3 && !entry.notified_close) {
      const closeSent = await sendTelegramMessage(entry.telegram_chat_id, entryId, 'close');
      if (closeSent) {
        await admin
          .from('queue_entries')
          .update({ notified_close: true })
          .eq('id', entryId);
      }
    }

    if (position === 1 && !entry.notified_next) {
      const nextSent = await sendTelegramMessage(entry.telegram_chat_id, entryId, 'next');
      if (nextSent) {
        await admin
          .from('queue_entries')
          .update({ notified_next: true })
          .eq('id', entryId);
      }
    }
  } catch (err) {
    console.error('[notificationRules] sendNewJoinerNotifications error:', err);
  }
}
