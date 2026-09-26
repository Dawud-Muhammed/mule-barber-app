export interface TelegramSendResult {
  success: boolean;
  error?: string;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string
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
