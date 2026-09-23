/**
 * POST /api/telegram/webhook
 * Telegram webhook endpoint with secret validation.
 * 
 * Validates TELEGRAM_WEBHOOK_SECRET before passing to grammy.
 * Secret can be provided as:
 * - Authorization header: "Bearer <secret>"
 * - Query parameter: ?secret=<secret>
 * - Header: X-Telegram-Webhook-Secret: <secret>
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWebhookCallback } from '@/lib/telegram/bot';

// Cache the webhook callback handler
let cachedHandler: any = null;

function getHandler() {
  if (!cachedHandler) {
    cachedHandler = getWebhookCallback();
  }
  return cachedHandler;
}

/**
 * Extract and validate the webhook secret from the request.
 */
function validateWebhookSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.warn('[webhook] TELEGRAM_WEBHOOK_SECRET not set, accepting all requests');
    return true;
  }

  // Try Authorization header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token === expectedSecret) {
      return true;
    }
  }

  // Try X-Telegram-Webhook-Secret header
  const headerSecret = request.headers.get('X-Telegram-Webhook-Secret');
  if (headerSecret === expectedSecret) {
    return true;
  }

  // Try query parameter
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret === expectedSecret) {
    return true;
  }

  return false;
}

/**
 * POST handler: receive Telegram webhook updates.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validate secret first (before grammy sees the request)
    if (!validateWebhookSecret(request)) {
      console.warn('[webhook] Invalid or missing secret');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Convert Next.js Request to a format grammy's webhookCallback can use
    const body = await request.json();

    // Create a mock Request object for grammy's handler
    // grammy expects a Response-like object it can call .json(), .status(), etc on
    const mockReq = {
      body,
      method: 'POST',
      url: new URL(request.url).pathname,
    };

    // Create a response wrapper
    let statusCode = 200;
    let responseBody: any = { ok: true };

    // Get the handler and execute it
    // grammy's webhookCallback('std/http') expects (req, res) handlers
    const handler = getHandler();

    // Execute the handler (this is internal to grammy)
    try {
      await handler(mockReq, {
        status: (code: number) => {
          statusCode = code;
          return { end: () => {}, send: (data: any) => {
            responseBody = data;
          } };
        },
        json: (data: any) => {
          responseBody = data;
          return { end: () => {} };
        },
        end: () => {},
      });
    } catch (botErr) {
      console.error('[webhook] bot handler error:', botErr);
      return NextResponse.json(
        { ok: true },
        { status: 200 }
      );
    }

    return NextResponse.json(responseBody, { status: statusCode });
  } catch (err) {
    console.error('[webhook] error:', err);
    // Always return 200 to Telegram to avoid retries, but log the error
    return NextResponse.json(
      { ok: true },
      { status: 200 }
    );
  }
}

/**
 * GET handler: health check (optional, for testing).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    { status: 'webhook running' },
    { status: 200 }
  );
}
