/**
 * Notification service for sending Telegram messages to clients.
 * Used by auto-notifications based on queue position.
 * Handles API calls, logging, and never breaks the triggering action.
 */

export type NotificationType = 'pos_4' | 'pos_3' | 'pos_2' | 'pos_1';

interface NotificationLog {
  timestamp: string;
  chatId: number;
  entryId: string;
  messageType: NotificationType;
  success: boolean;
  error?: string;
}

const logs: NotificationLog[] = [];

/**
 * Get notification message in English and Amharic based on position
 */
function getNotificationMessage(messageType: NotificationType): string {
  const messages: Record<NotificationType, string> = {
    pos_4: `📍 YOU ARE IN POSITION 4
3 people ahead of you. You're getting close!

📍 ለዚህ ሰዓት ስም 4 ተኛ ነብሥ
3 ሰዎች ከእርስዎ ዛቅደም ናቸው። እየጠጉ ነው!`,

    pos_3: `📍 YOU ARE IN POSITION 3
2 people ahead of you. Almost your turn!

📍 ለዚህ ሰዓት ስም 3 ተኛ ነብሥ
2 ሰዎች ከእርስዎ ዛቅደም ናቸው። ምናልባትም ይህ ሰዓት ነው!`,

    pos_2: `🎯 YOU ARE IN POSITION 2
1 person ahead. You're next!

🎯 ለዚህ ሰዓት ስም 2 ተኛ ነብሥ
1 ሰው ከእርስዎ ዛቅደም ነው። አሁን ቅደም ተከተል ወደ እርስዎ ነው!`,

    pos_1: `🎉 YOU ARE IN POSITION 1 - YOU'RE UP!
Come to the barber now!

🎉 ለዚህ ሰዓት ስም 1 ተኛ ነብሥ - አሁን ሰላምታ ነው!
ወደ ሞጣር አሁንም ነው!`,
  };

  return messages[messageType];
}

/**
 * Send a Telegram message to a client.
 * Returns true if successful, false if failed.
 * Logs all failures with structured data (never throws).
 */
export async function sendTelegramMessage(
  chatId: number,
  entryId: string,
  messageType: NotificationType
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
    const text = getNotificationMessage(messageType);

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
