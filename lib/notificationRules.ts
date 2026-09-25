/**
 * Position-based notification rules and flag management.
 * Determines which notifications to send based on queue position and flags.
 * Implements success-only flag rule: flags only set after successful send.
 * 
 * Notification rules:
 * - When position reaches 2 (1 person ahead): send "you're next"
 * - When position reaches 4 (3 people ahead): send "getting close"
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

    // Get all waiting+in_service entries ordered by queue_number to compute real positions
    const { data: allActiveEntries, error } = await admin
      .from('queue_entries')
      .select('id, queue_number, telegram_chat_id, status, notified_close, notified_next')
      .eq('queue_date', today)
      .in('status', ['waiting', 'in_service'])
      .order('queue_number', { ascending: true });

    if (error || !allActiveEntries) {
      console.error('[notificationRules] query error:', error);
      return [];
    }

    const toSend: NotificationToSend[] = [];

    // For each waiting entry, calculate how many people are ahead
    allActiveEntries.forEach((entry, index) => {
      if (entry.status !== 'waiting') return; // Only notify waiting entries

      const position = index + 1; // 1-indexed position in queue
      const countAhead = position - 1; // How many people are ahead

      // Position = 4 (3 people ahead): send "getting close" message
      if (position === 4 && !entry.notified_close) {
        toSend.push({
          type: 'close',
          chatId: entry.telegram_chat_id,
          entryId: entry.id,
        });
      }

      // Position = 2 (1 person ahead): send "you're next" message
      if (position === 2 && !entry.notified_next) {
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
 * Used by dashboard to show ⚠️ for entries at position 4 or 2 with unsent notifications.
 */
export async function hasUnsendNotification(entryId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get all active entries (waiting + in_service)
    const { data: allActiveEntries, error } = await admin
      .from('queue_entries')
      .select('id, status, notified_close, notified_next')
      .eq('queue_date', today)
      .in('status', ['waiting', 'in_service'])
      .order('queue_number', { ascending: true });

    if (error || !allActiveEntries) return false;

    // Find this entry and its position
    const index = allActiveEntries.findIndex((e) => e.id === entryId);
    if (index === -1) return false;

    // Skip if not waiting (don't notify in_service entries)
    if (allActiveEntries[index].status !== 'waiting') return false;

    const position = index + 1;
    const entry = allActiveEntries[index];

    // Warning if: position is 4 or 2 AND notification flag is false
    if (position === 4 && !entry.notified_close) return true;
    if (position === 2 && !entry.notified_next) return true;

    return false;
  } catch (err) {
    console.error('[notificationRules] hasUnsendNotification error:', err);
    return false;
  }
}

/**
 * Special case: new joiner at position 4 or 2.
 * Send applicable messages immediately, in order (close before next).
 */
export async function sendNewJoinerNotifications(entryId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get the new entry
    const { data: entry, error } = await admin
      .from('queue_entries')
      .select('id, telegram_chat_id, notified_close, notified_next')
      .eq('id', entryId)
      .single();

    if (error || !entry) {
      console.error('[notificationRules] could not fetch new entry:', error);
      return;
    }

    // Get all active entries to compute position
    const { data: allActiveEntries } = await admin
      .from('queue_entries')
      .select('id, status')
      .eq('queue_date', today)
      .in('status', ['waiting', 'in_service'])
      .order('queue_number', { ascending: true });

    if (!allActiveEntries) return;

    const index = allActiveEntries.findIndex((e) => e.id === entryId);
    const position = index + 1;

    // Send "getting close" if position is 4
    if (position === 4 && !entry.notified_close) {
      const closeSent = await sendTelegramMessage(entry.telegram_chat_id, entryId, 'close');
      if (closeSent) {
        await admin
          .from('queue_entries')
          .update({ notified_close: true })
          .eq('id', entryId);
      }
    }

    // Send "you're next" if position is 2
    if (position === 2 && !entry.notified_next) {
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
