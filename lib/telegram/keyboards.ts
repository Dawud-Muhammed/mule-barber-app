import { InlineKeyboardMarkup } from 'grammy/types';

export type ServiceDisplay = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export function servicesKeyboard(services: ServiceDisplay[]): InlineKeyboardMarkup {
  return {
    inline_keyboard: services.map((service) => [{ text: service.name, callback_data: `service_${service.id}` }]),
  };
}

export function confirmJoinKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: 'Join', callback_data: 'confirm_join' }, { text: 'Cancel', callback_data: 'cancel' }]],
  };
}

export function checkPositionKeyboard(): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: 'Check position', callback_data: 'check_position' }]] };
}

export function joinedMessage(queueNumber: number, countAhead: number): string {
  if (countAhead === 0) return 'You are next in line. Please stay close.';
  return `You are number ${queueNumber} in line. ${countAhead} people are ahead of you. We will message you when your turn is near.`;
}

export function positionMessage(queueNumber: number, countAhead: number): string {
  return `You are number ${queueNumber} in line. ${countAhead} people are ahead of you.`;
}

export function notInLineMessage(): string {
  return 'You are not in line today. Want to join?';
}

export function queueClosedMessage(): string {
  return 'We are not taking new customers right now. Please try again later.';
}

export function alreadyInLineMessage(queueNumber: number, countAhead: number): string {
  return `You are already in line - number ${queueNumber}. ${countAhead} people are ahead of you.`;
}

export function startMessage(): string {
  return 'You are not in line today. Want to join?';
}

export function confirmServiceMessage(name: string, service: string): string {
  return `${name} - ${service}. Join the line?`;
}

export function genericFailureMessage(): string {
  return 'Sorry, something went wrong. Please try again.';
}
