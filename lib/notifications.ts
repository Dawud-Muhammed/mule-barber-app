/**
 * Notification service for sending Telegram messages to clients.
 * Used by Phase 5 auto-notifications.
 * Handles API calls, logging, and never breaks the triggering action.
 */

interface NotificationLog {
  timestamp: string;
  chatId: number;
  entryId: string;
  messageType: 'close' | 'next';
  success: boolean;
  error?: string;
}

const logs: NotificationLog[] = [];

/**
 * Send a Telegram message to a client.
 * Returns true if successful, false if failed.
 * Logs all failures with structured data (never throws).
 */
export async function sendTelegramMessage(
  chatId: number,
  entryId: string,
  messageType: 'close' | 'next'
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logNotification({
      chatId,
      entryId,
      messageType,
      success: false,
      error: 'TELEGRAM_BOT_TOKEN not set',
    });
    return false;
  }

  try {
    const text =
      messageType === 'close'
        ? "📍 You're getting close! There are 3 or fewer people ahead of you in the queue."
        : "🎯 You're up next! Come on in when you're ready.";

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      logNotification({
        chatId,
        entryId,
        messageType,
        success: false,
        error: `Telegram API error: ${response.status} ${errorData}`,
      });
      return false;
    }

    logNotification({
      chatId,
      entryId,
      messageType,
      success: true,
    });
    return true;
  } catch (err) {
    logNotification({
      chatId,
      entryId,
      messageType,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Log a notification attempt (success or failure).
 * Structured logging with timestamp, chat_id, entry_id, error.
 */
function logNotification(data: Omit<NotificationLog, 'timestamp'>) {
  const log = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  logs.push(log);

  if (data.success) {
    console.log(`[notification] sent ${data.messageType} to chat ${data.chatId}:`, log);
  } else {
    console.error(`[notification] failed ${data.messageType} to chat ${data.chatId}:`, log);
  }
}

/**
 * Get all logged notifications (for debugging).
 */
export function getNotificationLogs() {
  return logs;
}

/**
 * Clear all logged notifications.
 */
export function clearNotificationLogs() {
  logs.length = 0;
}
