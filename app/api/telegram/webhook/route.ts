/**
 * POST /api/telegram/webhook
 * Telegram webhook endpoint using grammy's built-in adapter
 */
import { NextRequest, NextResponse } from 'next/server';
import { createBot } from '@/lib/telegram/bot';

/**
 * Validate webhook secret from query parameter
 */
function validateWebhookSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[webhook] TELEGRAM_WEBHOOK_SECRET not set');
    return false;
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  return querySecret === expectedSecret;
}

/**
 * POST handler: Receive and process Telegram webhook updates
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validate webhook secret
    if (!validateWebhookSecret(request)) {
      console.warn('[webhook] Invalid webhook secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    console.log('[webhook] Received update from Telegram');

    // Create bot instance
    const bot = createBot();

    // Process the update
    // bot.handleUpdate(update) returns void, so we just call it
    await bot.handleUpdate(body);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[webhook] error processing update:', err);
    // Return 200 to prevent Telegram retries
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

/**
 * GET handler: Health check
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'webhook ok' }, { status: 200 });
}
