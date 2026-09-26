export type NotificationType = 'promoted' | 'pos_1' | 'pos_2' | 'pos_3' | 'terminal' | 'cancelled' | 'skipped';

export interface TelegramSendResult {
  success: boolean;
  error?: string;
}

export function getNotificationMessage(type: NotificationType): string {
  const messages: Record<NotificationType, string> = {
    promoted: 'It is your turn now. Please come in.',
    pos_1: 'You are next. Please get ready.',
    pos_2: '1 person is ahead of you.',
    pos_3: '2 people are ahead of you.',
    terminal: '3 people are ahead of you.',
    cancelled: 'Your spot was cancelled. If this is a mistake, message us.',
    skipped: 'We moved to the next person because we could not reach you. Message us to rejoin.',
  };

  return messages[type];
}

export async function sendTelegramMessage(
  chatId: number,
  type: NotificationType,
  text = getNotificationMessage(type)
): Promise<TelegramSendResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { success: false, error: 'Telegram is unavailable' };

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      return { success: false, error: `Telegram delivery failed (${response.status})` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Telegram is unavailable' };
  }
}
