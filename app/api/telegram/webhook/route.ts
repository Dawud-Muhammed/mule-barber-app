/**
 * POST /api/telegram/webhook
 * Telegram webhook endpoint with secret validation.
 * Validates secret and delegates to grammy bot handler.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWebhookCallback } from '@/lib/telegram/bot';

/**
 * Validate webhook secret from query parameter
 */
function validateWebhookSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[webhook] TELEGRAM_WEBHOOK_SECRET not configured');
    return false;
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');

  const isValid = querySecret === expectedSecret;
  if (!isValid) {
    console.warn('[webhook] Secret validation failed');
  }
  return isValid;
}

/**
 * POST handler: Receive Telegram webhook updates
 * Validates secret, then passes to grammy bot handler
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validate secret
    if (!validateWebhookSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    console.log('[webhook] Received update:', body.message?.text || body.callback_query?.data || 'update');

    // Get grammy webhook handler and process update
    const handler = getWebhookCallback();

    // Call handler with mock Node.js request/response objects
    // grammy's webhookCallback('std/http') expects Express-like (req, res)
    const mockReq = { body };
    let responseData: any = { ok: true };

    const mockRes = {
      status: (code: number) => {
        return {
          end: () => {},
          json: (data: any) => {
            responseData = data;
          },
          send: (data: any) => {
            responseData = data;
          },
        };
      },
      json: (data: any) => {
        responseData = data;
        return { end: () => {} };
      },
      end: () => {},
    };

    // Execute handler
    try {
      await handler(mockReq, mockRes);
    } catch (botErr) {
      console.error('[webhook] bot handler error:', botErr);
      // Still return 200 to prevent Telegram retries
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[webhook] handler error:', err);
    // Always return 200 to Telegram to prevent retry loops
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

/**
 * GET handler: Health check
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'webhook ok' }, { status: 200 });
}
