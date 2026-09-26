import { InlineKeyboardMarkup } from 'grammy/types';
import { Language, MessageKey, t } from './messages';

export type ServiceDisplay = {
  id: string;
  name: string;
  name_am: string | null;
  is_active: boolean;
  sort_order: number;
};

export function languageKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: t('am', 'btn_amharic'), callback_data: 'language_am' },
      { text: t('en', 'btn_english'), callback_data: 'language_en' },
    ]],
  };
}

export function servicesKeyboard(services: ServiceDisplay[], language: Language): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...services.map((service) => [{
        text: language === 'am' ? service.name_am || service.name : service.name,
        callback_data: `service_${service.id}`,
      }]),
      [{ text: t(language, 'btn_language'), callback_data: 'language_switch' }],
    ],
  };
}

export function confirmJoinKeyboard(language: Language): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: t(language, 'btn_join'), callback_data: 'confirm_join' },
      { text: t(language, 'btn_cancel'), callback_data: 'cancel' },
    ]],
  };
}

export function checkPositionKeyboard(language: Language): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: t(language, 'btn_my_position'), callback_data: 'check_position' }]] };
}

export function messageWithPosition(
  language: Language,
  key: MessageKey,
  queueNumber: number,
  countAhead: number
): string {
  return t(language, key, { n: queueNumber, a: countAhead });
}

export function joinedMessage(language: Language, queueNumber: number, countAhead: number): string {
  return countAhead === 0
    ? t(language, 'joined_next')
    : t(language, 'joined', { n: queueNumber, a: countAhead });
}

export function positionMessage(language: Language, queueNumber: number, countAhead: number): string {
  return t(language, 'position_check', { n: queueNumber, a: countAhead });
}

export function notInLineMessage(language: Language): string {
  return t(language, 'not_in_line');
}

export function queueClosedMessage(language: Language): string {
  return t(language, 'queue_closed');
}

export function alreadyInLineMessage(language: Language, queueNumber: number, countAhead: number): string {
  return t(language, 'already_in_line', { n: queueNumber, a: countAhead });
}

export function confirmServiceMessage(language: Language, name: string, service: string): string {
  return t(language, 'confirm_join', { name, service });
}

export function genericFailureMessage(language: Language): string {
  return t(language, 'generic_error');
}
