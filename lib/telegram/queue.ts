/**
 * Telegram queue operations: joining and position checking.
 * Uses admin client to call RPC functions (service-role bypass).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { QueueEntryRow } from './context';

interface JoinQueueResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  queueNumber?: number;
  entryId?: string;
  countAhead?: number;
}

interface PositionResult {
  success: boolean;
  queueNumber?: number;
  countAhead?: number;
  status?: string;
  error?: string;
}

/**
 * Call assign_queue_number() RPC to atomically join the queue.
 * Handles business logic errors (duplicate, closed).
 */
export async function joinQueue(
  chatId: number,
  clientName: string,
  serviceId: string
): Promise<JoinQueueResult> {
  try {
    const admin = createAdminClient();

    // Call the RPC function
    const { data, error } = await admin.rpc('assign_queue_number', {
      p_telegram_chat_id: chatId,
      p_client_name: clientName,
      p_service_id: serviceId,
    });

    if (error) {
      console.error('[joinQueue] RPC error:', error);
      return {
        success: false,
        error: 'Database error',
        errorCode: 'db_error',
      };
    }

    // data is JSON returned by the PL/pgSQL function
    // Type guard for the response
    if (!data || typeof data !== 'object' || !('success' in data)) {
      return {
        success: false,
        error: 'Invalid response',
        errorCode: 'invalid_response',
      };
    }

    const response = data as any;
    if (!response.success) {
      return {
        success: false,
        error: response.error || 'Unknown error',
        errorCode: response.error_code,
      };
    }

    // Count how many entries are ahead (waiting with lower queue_number)
    const { count, error: countError } = await admin
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('queue_date', new Date().toISOString().split('T')[0])
      .eq('status', 'waiting')
      .lt('queue_number', response.queue_number);

    if (countError) {
      console.error('[joinQueue] count ahead error:', countError);
    }

    const countAhead = count ?? 0;

    return {
      success: true,
      queueNumber: response.queue_number,
      entryId: response.id,
      countAhead,
    };
  } catch (err) {
    console.error('[joinQueue] unexpected error:', err);
    return {
      success: false,
      error: 'Unexpected error',
      errorCode: 'unknown',
    };
  }
}

/**
 * Find the user's active queue entry for today and calculate their position.
 * Returns position if active, or error if none.
 */
export async function checkPosition(chatId: number): Promise<PositionResult> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Get the user's active entry for today
    const { data: entries, error: queryError } = await admin
      .from('queue_entries')
      .select('id, queue_number, status')
      .eq('telegram_chat_id', chatId)
      .eq('queue_date', today)
      .in('status', ['waiting', 'in_service']);

    if (queryError) {
      console.error('[checkPosition] query error:', queryError);
      return {
        success: false,
        error: 'Database error',
      };
    }

    if (!entries || entries.length === 0) {
      return {
        success: false,
        error: 'Not in queue',
      };
    }

    const entry = entries[0];

    // Count how many are ahead
    const { count: countAhead, error: countError } = await admin
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('queue_date', today)
      .eq('status', 'waiting')
      .lt('queue_number', entry.queue_number);

    if (countError) {
      console.error('[checkPosition] count error:', countError);
      return {
        success: true,
        queueNumber: entry.queue_number,
        status: entry.status,
        countAhead: 0,
      };
    }

    return {
      success: true,
      queueNumber: entry.queue_number,
      status: entry.status,
      countAhead: countAhead ?? 0,
    };
  } catch (err) {
    console.error('[checkPosition] unexpected error:', err);
    return {
      success: false,
      error: 'Unexpected error',
    };
  }
}

/**
 * Get active services to show in the /start menu.
 */
export async function getActiveServices() {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('services')
      .select('id, name, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[getActiveServices] error:', error);
      return [];
    }

    return (data || []) as Array<{
      id: string;
      name: string;
      is_active: boolean;
      sort_order: number;
    }>;
  } catch (err) {
    console.error('[getActiveServices] unexpected error:', err);
    return [];
  }
}

/**
 * Get the shop's current state (accepting queue or closed).
 */
export async function isQueueOpen() {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('shop_state')
      .select('accepting_queue')
      .eq('id', true)
      .single();

    if (error || !data) {
      console.error('[isQueueOpen] error:', error);
      return true; // default to open on error
    }

    return data.accepting_queue;
  } catch (err) {
    console.error('[isQueueOpen] unexpected error:', err);
    return true; // default to open on error
  }
}
