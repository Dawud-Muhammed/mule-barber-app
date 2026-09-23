/**
 * Telegram bot setup with grammy, handlers, and middleware.
 * No long-running process; driven by webhooks via Next.js API routes.
 */
import { Bot, webhookCallback } from 'grammy';
import { BotContext, SessionData } from './context';
import {
  joinQueue,
  checkPosition,
  getActiveServices,
  isQueueOpen,
} from './queue';
import {
  servicesKeyboard,
  confirmJoinKeyboard,
  checkPositionKeyboard,
  startMessage,
  confirmServiceMessage,
  alreadyInQueueMessage,
  queueClosedMessage,
  notInQueueMessage,
  formatPositionMessage,
  ServiceDisplay,
} from './keyboards';

// In-memory session store (per chat_id)
const sessions = new Map<number, SessionData>();

/**
 * Create and configure the bot instance.
 * Returns a bot configured with all handlers but NOT started as a process.
 */
export function createBot(): Bot<BotContext> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }

  const bot = new Bot<BotContext>(token);

  // ===== Middleware =====

  // Session middleware: load/save session data per chat_id
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return next();
    }

    // Load session
    if (!sessions.has(chatId)) {
      sessions.set(chatId, {});
    }
    ctx.session = sessions.get(chatId)!;

    await next();

    // Save session back
    sessions.set(chatId, ctx.session);
  });

  // ===== Commands =====

  bot.command('start', async (ctx) => {
    // Query active services fresh each time
    const services = await getActiveServices();

    if (services.length === 0) {
      return ctx.reply('Sorry, no services available right now.');
    }

    ctx.session.step = 'selecting_service';
    ctx.session.selectedServiceId = undefined;

    await ctx.reply(startMessage(), {
      reply_markup: servicesKeyboard(services),
    });
  });

  // ===== Callback Queries (Inline Button Presses) =====

  // Service selection callback
  bot.callbackQuery(/^service_/, async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const serviceId = callbackData.replace('service_', '');

    // Look up service name
    const services = await getActiveServices();
    const service = services.find((s) => s.id === serviceId);
    if (!service) {
      return ctx.answerCallbackQuery({
        text: 'Service not found',
        show_alert: true,
      });
    }

    ctx.session.selectedServiceId = serviceId;
    ctx.session.selectedServiceName = service.name;
    ctx.session.step = 'confirming_join';

    await ctx.editMessageText(confirmServiceMessage(service.name), {
      reply_markup: confirmJoinKeyboard(),
    });
  });

  // Confirm join callback
  bot.callbackQuery('confirm_join', async (ctx) => {
    const chatId = ctx.chat!.id;
    const serviceId = ctx.session.selectedServiceId;
    const serviceName = ctx.session.selectedServiceName || 'Service';

    if (!serviceId) {
      return ctx.answerCallbackQuery({
        text: 'Error: service not selected',
        show_alert: true,
      });
    }

    // Check if queue is open
    const open = await isQueueOpen();
    if (!open) {
      // Queue closed — show message
      await ctx.editMessageText(queueClosedMessage(), {
        reply_markup: undefined,
      });
      return ctx.answerCallbackQuery();
    }

    // Attempt to join
    const result = await joinQueue(chatId, '', serviceId);

    if (!result.success) {
      // Handle specific errors
      if (result.errorCode === 'duplicate_entry') {
        // Already in queue — show their position
        const posResult = await checkPosition(chatId);
        if (posResult.success && posResult.queueNumber) {
          const msg = alreadyInQueueMessage(
            posResult.queueNumber,
            posResult.countAhead || 0
          );
          await ctx.editMessageText(msg, {
            reply_markup: checkPositionKeyboard(),
          });
        } else {
          await ctx.editMessageText('You are already in the queue!', {
            reply_markup: undefined,
          });
        }
      } else if (result.errorCode === 'shop_closed') {
        // Queue closed
        await ctx.editMessageText(queueClosedMessage(), {
          reply_markup: undefined,
        });
      } else {
        // Other error
        await ctx.editMessageText(
          'Could not join queue. Please try again later.',
          {
            reply_markup: undefined,
          }
        );
      }
      return ctx.answerCallbackQuery();
    }

    // Success! Show queue number and count ahead
    const posMsg = formatPositionMessage(result.queueNumber!, result.countAhead || 0);
    const confirmMsg = `✅ Joined!\n\n${posMsg}`;

    ctx.session.step = undefined;
    ctx.session.selectedServiceId = undefined;
    ctx.session.selectedServiceName = undefined;

    await ctx.editMessageText(confirmMsg, {
      reply_markup: checkPositionKeyboard(),
    });

    await ctx.answerCallbackQuery({
      text: 'You have joined the queue!',
    });
  });

  // Cancel join callback
  bot.callbackQuery('cancel', async (ctx) => {
    ctx.session.step = undefined;
    ctx.session.selectedServiceId = undefined;
    ctx.session.selectedServiceName = undefined;

    const services = await getActiveServices();
    if (services.length === 0) {
      await ctx.editMessageText('No services available.');
    } else {
      await ctx.editMessageText(startMessage(), {
        reply_markup: servicesKeyboard(services),
      });
    }

    await ctx.answerCallbackQuery();
  });

  // Check position callback
  bot.callbackQuery('check_position', async (ctx) => {
    const chatId = ctx.chat!.id;
    const result = await checkPosition(chatId);

    if (!result.success || !result.queueNumber) {
      await ctx.editMessageText(notInQueueMessage(), {
        reply_markup: undefined,
      });
    } else {
      const posMsg = formatPositionMessage(
        result.queueNumber,
        result.countAhead || 0
      );
      await ctx.editMessageText(posMsg, {
        reply_markup: checkPositionKeyboard(),
      });
    }

    await ctx.answerCallbackQuery();
  });

  // ===== Text Messages (Catch-All) =====

  // Any text input when in queue → show position
  // Any text input when not in queue → re-show service menu
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;

    // Check if they have an active entry
    const posResult = await checkPosition(chatId);

    if (posResult.success && posResult.queueNumber) {
      // In queue — show position
      const posMsg = formatPositionMessage(
        posResult.queueNumber,
        posResult.countAhead || 0
      );
      await ctx.reply(posMsg, {
        reply_markup: checkPositionKeyboard(),
      });
    } else {
      // Not in queue — show service menu
      const services = await getActiveServices();
      if (services.length === 0) {
        await ctx.reply('Sorry, no services available right now.');
      } else {
        ctx.session.step = 'selecting_service';
        await ctx.reply(startMessage(), {
          reply_markup: servicesKeyboard(services),
        });
      }
    }
  });

  return bot;
}

/**
 * Create the webhookCallback handler for Next.js route handlers.
 * Returns an Express-like (req, res) handler that processes Telegram updates.
 */
export function getWebhookCallback() {
  const bot = createBot();
  return webhookCallback(bot, 'std/http');
}
