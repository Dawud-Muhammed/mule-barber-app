/**
 * POST /api/telegram/webhook
 * Telegram webhook endpoint using grammy
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Bot } from 'grammy';
import { createBot } from '@/lib/telegram/bot';
import type { BotContext } from '@/lib/telegram/context';

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

// Cache the initialized bot (module-level)
let cachedBot: Bot<BotContext> | null = null;
let botInitPromise: Promise<Bot<BotContext>> | null = null;

/**
 * Get or create initialized bot
 */
async function getInitializedBot() {
  // If already initialized, return cached bot
  if (cachedBot) {
    return cachedBot;
  }

  // If initialization is in progress, wait for it
  if (botInitPromise) {
    return botInitPromise;
  }

  // Start initialization
  botInitPromise = (async () => {
    try {
      const bot = createBot();
      console.log('[webhook] Initializing bot...');
      await bot.init();
      console.log('[webhook] Bot initialized successfully');
      cachedBot = bot;
      return bot;
    } catch (err) {
      console.error('[webhook] Failed to initialize bot:', err);
      botInitPromise = null; // Reset so next request retries
      throw err;
    }
  })();

  return botInitPromise;
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

    // Get initialized bot
    const bot = await getInitializedBot();

    // Process the update
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
