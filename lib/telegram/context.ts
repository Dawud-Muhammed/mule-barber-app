/**
 * Telegram bot context types and conversation state.
 */
import { Context } from 'grammy';
import { Database } from '@/types/database';
import { Language } from './messages';

export type QueueEntryRow = Database['public']['Tables']['queue_entries']['Row'];
export type ServiceRow = Database['public']['Tables']['services']['Row'];

/**
 * Session state stored per user (telegram_chat_id).
 * Persisted in-memory for this MVP; can migrate to Supabase table later.
 */
export interface SessionData {
  language?: Language;
  // Current flow state
  step?: 'selecting_service' | 'awaiting_name' | 'awaiting_phone' | 'confirming_join';
  selectedServiceId?: string;
  selectedServiceName?: string;
  clientName?: string;
  clientPhone?: string;

  // User's cached active entry (refreshed on demand)
  activeEntry?: QueueEntryRow | null;
  activeEntryFetchedAt?: number; // timestamp
}

/**
 * grammy Context extended with our session data.
 */
export type BotContext = Context & {
  session: SessionData;
};
