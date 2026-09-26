import { createAdminClient } from '@/lib/supabase/admin';
import { getShopDate } from '@/lib/shopDate';
import { sendTelegramMessage, type NotificationType } from '@/lib/notifications';
import type { Database } from '@/types/database';

type QueueEntry = Database['public']['Tables']['queue_entries']['Row'];

type NotificationTarget = {
  entry: QueueEntry;
  type: NotificationType;
  flag: 'notified_promoted' | 'notified_pos_1' | 'notified_pos_2' | 'notified_pos_3' | 'notified_terminal' | 'notified_cancelled' | 'notified_skipped' | 'notified_completed';
};

function targetForPosition(entry: QueueEntry, position: number): NotificationTarget | null {
  if (position === 1) return { entry, type: 'pos_1', flag: 'notified_pos_1' };
  if (position === 2) return { entry, type: 'pos_2', flag: 'notified_pos_2' };
  if (position === 3) return { entry, type: 'pos_3', flag: 'notified_pos_3' };
  if (position === 4) return { entry, type: 'terminal', flag: 'notified_terminal' };
  return null;
}

async function claimAndSend(target: NotificationTarget): Promise<void> {
  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin
    .from('queue_entries')
    .update({ [target.flag]: true, notification_error: null } as never)
    .eq('id', target.entry.id)
    .eq(target.flag as never, false)
    .select('id')
    .maybeSingle();

  if (claimError || !claimed) return;

  const result = await sendTelegramMessage(target.entry.telegram_chat_id, target.type);
  if (result.success) return;

  await admin
    .from('queue_entries')
    .update({ [target.flag]: false, notification_error: result.error || 'Telegram delivery failed' } as never)
    .eq('id', target.entry.id)
    .eq(target.flag as never, true);
}

export async function notifyQueueStateChange(): Promise<void> {
  const admin = createAdminClient();
  const today = getShopDate();
  const { data, error } = await admin
    .from('queue_entries')
    .select('*')
    .eq('queue_date', today)
    .in('status', ['waiting', 'in_service'])
    .order('queue_number', { ascending: true });

  if (error || !data) return;
  const entries = data as QueueEntry[];
  const inService = entries.find((entry) => entry.status === 'in_service');

  if (inService) {
    await claimAndSend({ entry: inService, type: 'promoted', flag: 'notified_promoted' });
  }

  const waiting = entries.filter((entry) => entry.status === 'waiting');
  for (const position of [4, 3, 2, 1]) {
    const target = waiting[position - 1] ? targetForPosition(waiting[position - 1], position) : null;
    if (target) await claimAndSend(target);
  }
}

export async function hasNotificationError(entryId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('queue_entries')
    .select('notification_error')
    .eq('id', entryId)
    .maybeSingle();
  return Boolean(data?.notification_error);
}

export async function notifyTerminalEntry(
  entryId: string,
  type: 'cancelled' | 'skipped' | 'completed'
): Promise<void> {
  const admin = createAdminClient();
  const flag = type === 'cancelled'
    ? 'notified_cancelled'
    : type === 'skipped'
      ? 'notified_skipped'
      : 'notified_completed';
  const { data: entry } = await admin
    .from('queue_entries')
    .select('telegram_chat_id')
    .eq('id', entryId)
    .maybeSingle();
  if (!entry) return;

  const { data: claimed } = await admin
    .from('queue_entries')
    .update({ [flag]: true, notification_error: null } as never)
    .eq('id', entryId)
    .eq(flag as never, false)
    .select('id')
    .maybeSingle();
  if (!claimed) return;

  const result = await sendTelegramMessage(entry.telegram_chat_id, type);
  if (result.success) return;
  await admin
    .from('queue_entries')
    .update({ [flag]: false, notification_error: result.error || 'Telegram delivery failed' } as never)
    .eq('id', entryId)
    .eq(flag as never, true);
}
