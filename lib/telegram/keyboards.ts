/**
 * Telegram inline keyboards and message builders.
 */
import { InlineKeyboardMarkup } from 'grammy/types';

export type ServiceDisplay = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

/**
 * Build inline keyboard for service selection.
 * Each service is a button that calls a callback query with data "service_<serviceId>".
 */
export function servicesKeyboard(services: ServiceDisplay[]): InlineKeyboardMarkup {
  return {
    inline_keyboard: services.map((service) => [
      {
        text: service.name,
        callback_data: `service_${service.id}`,
      },
    ]),
  };
}

/**
 * Build keyboard for confirming queue join (after service selected).
 */
export function confirmJoinKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Join Queue', callback_data: 'confirm_join' },
        { text: '✗ Cancel', callback_data: 'cancel' },
      ],
    ],
  };
}

/**
 * Build keyboard for checking position when in queue.
 */
export function checkPositionKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '📍 Check my position', callback_data: 'check_position' }],
    ],
  };
}

/**
 * Format the queue position message.
 * Example: "Queue #8 — 7 ahead"
 */
export function formatPositionMessage(queueNumber: number, countAhead: number): string {
  if (countAhead === 0) {
    return `🎯 Queue #${queueNumber} — You're next!`;
  }
  const plural = countAhead === 1 ? 'person' : 'people';
  return `📋 Queue #${queueNumber} — ${countAhead} ${plural} ahead`;
}

/**
 * Format a friendly "not in queue" message.
 */
export function notInQueueMessage(): string {
  return "You're not currently in the queue. Use /start to join!";
}

/**
 * Format a friendly "queue closed" message.
 */
export function queueClosedMessage(): string {
  return "We're not taking walk-ins right now. Check back later!";
}

/**
 * Format duplicate entry response (already in queue).
 * Shows their existing position.
 */
export function alreadyInQueueMessage(queueNumber: number, countAhead: number): string {
  const posMsg = formatPositionMessage(queueNumber, countAhead);
  return `You're already in the queue!\n\n${posMsg}`;
}

/**
 * Format the initial /start message with instructions.
 */
export function startMessage(): string {
  return `🏳️ Welcome to Mule Barber!\n\nSelect a service to join the queue:`;
}

/**
 * Format the service confirmation message.
 * Example: "Ready to join for Haircut + Beard?"
 */
export function confirmServiceMessage(serviceName: string): string {
  return `Ready to join for ${serviceName}?\n\nConfirm to get your queue number!`;
}
