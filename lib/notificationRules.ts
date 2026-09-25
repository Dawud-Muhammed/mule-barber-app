/**
 * Position-based notification rules with support for positions 4, 3, 2, 1.
 * Sends bilingual messages (English + Amharic) when customers reach each position.
 * Implements success-only flag rule: flags only set after successful send.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTelegramMessage, type NotificationType } from '@/lib/notifications';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];

interface NotificationToSend {
  type: NotificationType;
  chatId: number;
  entryId: string;
}

/**
 * Compute today's waiting positions and determine notifications to send.
 * Returns list of notifications to send.
 * Does NOT send yet (caller handles sending + flag updates).
 */
export async function computeNotificationsToSend(): Promise<NotificationToSend[]> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get all active entries (waiting + in_service) ordered by queue_number
    const { data: allActiveEntries, error } = await admin
      .from('queue_entries')
      .select('*')
      .eq('queue_date', today)
      .in('status', ['waiting', 'in_service'])
      .order('queue_number', { ascending: true }) as any;

    if (error || !allActiveEntries) {
      console.error('[notificationRules] query error:', error);
      return [];
    }

    const toSend: NotificationToSend[] = [];

    // For each waiting entry, calculate its position and check if notification needed
    (allActiveEntries as any[]).forEach((entry: any, index: number) => {
      if (entry.status !== 'waiting') return; // Only notify waiting entries

      const position = index + 1; // 1-indexed position in queue

      // Position 4: send if not yet notified
      if (position === 4 && !entry.notified_pos_4) {
        toSend.push({
          type: 'pos_4',
          chatId: entry.telegram_chat_id,
          entryId: entry.id,
        });
      }

      // Position 3: send if not yet notified
      if (position === 3 && !entry.notified_pos_3) {
        toSend.push({
          type: 'pos_3',
          chatId: entry.telegram_chat_id,
          entryId: entry.id,
        });
      }

      // Position 2: send if not yet notified
      if (position === 2 && !entry.notified_pos_2) {
        toSend.push({
          type: 'pos_2',
          chatId: entry.telegram_chat_id,
          entryId: entry.id,
        });
      }

      // Position 1: send if not yet notified
      if (position === 1 && !entry.notified_pos_1) {
        toSend.push({
          type: 'pos_1',
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
      const flagMap: Record<NotificationType, string> = {
        pos_4: 'notified_pos_4',
        pos_3: 'notified_pos_3',
        pos_2: 'notified_pos_2',
        pos_1: 'notified_pos_1',
      };

      const updateData = { [flagMap[type]]: true } as any;

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
 * Check if a specific entry has unsent notifications.
 * Used by dashboard to show ⚠️ for entries needing notification.
 */
export async function hasUnsendNotification(entryId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get all active entries
    const { data: allActiveEntries, error } = await admin
      .from('queue_entries')
      .select('*')
      .eq('queue_date', today)
      .in('status', ['waiting', 'in_service'])
      .order('queue_number', { ascending: true }) as any;

    if (error || !allActiveEntries) return false;

    // Find this entry and its position
    const index = (allActiveEntries as any[]).findIndex((e) => e.id === entryId);
    if (index === -1) return false;

    // Skip if not waiting (don't warn for in_service entries)
    if ((allActiveEntries as any[])[index].status !== 'waiting') return false;

    const position = index + 1;
    const entry = (allActiveEntries as any[])[index];

    // Check if any notification at this position is unsent
    if (position === 4 && !entry.notified_pos_4) return true;
    if (position === 3 && !entry.notified_pos_3) return true;
    if (position === 2 && !entry.notified_pos_2) return true;
    if (position === 1 && !entry.notified_pos_1) return true;

    return false;
  } catch (err) {
    console.error('[notificationRules] hasUnsendNotification error:', err);
    return false;
  }
}

/**
 * Special case: new joiner at position 4, 3, 2, or 1.
 * Send applicable messages immediately.
 */
export async function sendNewJoinerNotifications(entryId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get the new entry
    const { data: entry, error } = await admin
      .from('queue_entries')
      .select('*')
      .eq('id', entryId)
      .single() as any;

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
      .order('queue_number', { ascending: true }) as any;

    if (!allActiveEntries) return;

    const index = (allActiveEntries as any[]).findIndex((e) => e.id === entryId);
    const position = index + 1;

    const notificationMap: Record<number, { flag: string; type: NotificationType }> = {
      4: { flag: 'notified_pos_4', type: 'pos_4' },
      3: { flag: 'notified_pos_3', type: 'pos_3' },
      2: { flag: 'notified_pos_2', type: 'pos_2' },
      1: { flag: 'notified_pos_1', type: 'pos_1' },
    };

    if (position in notificationMap) {
      const { flag, type } = notificationMap[position];
      if (!(entry as any)[flag]) {
        const sent = await sendTelegramMessage(entry.telegram_chat_id, entryId, type);
        if (sent) {
          await admin
            .from('queue_entries')
            .update({ [flag]: true } as any)
            .eq('id', entryId);
        }
      }
    }
  } catch (err) {
    console.error('[notificationRules] sendNewJoinerNotifications error:', err);
  }
}
