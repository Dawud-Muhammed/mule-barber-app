import { Bot, webhookCallback } from 'grammy';
import { BotContext, SessionData } from './context';
import { checkPosition, getActiveServices, joinQueue } from './queue';
import {
  alreadyInLineMessage,
  checkPositionKeyboard,
  confirmJoinKeyboard,
  confirmServiceMessage,
  genericFailureMessage,
  joinedMessage,
  notInLineMessage,
  positionMessage,
  queueClosedMessage,
  servicesKeyboard,
  startMessage,
} from './keyboards';

const sessions = new Map<number, SessionData>();

function resetFlow(session: SessionData) {
  session.step = undefined;
  session.selectedServiceId = undefined;
  session.selectedServiceName = undefined;
  session.clientName = undefined;
  session.clientPhone = undefined;
}

async function showServices(ctx: BotContext) {
  const services = await getActiveServices();
  if (services.length === 0) return ctx.reply(genericFailureMessage());
  ctx.session.step = 'selecting_service';
  await ctx.reply(startMessage(), { reply_markup: servicesKeyboard(services) });
}

export function createBot(): Bot<BotContext> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const bot = new Bot<BotContext>(token);

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();
    if (!sessions.has(chatId)) sessions.set(chatId, {});
    ctx.session = sessions.get(chatId)!;
    await next();
    sessions.set(chatId, ctx.session);
  });

  bot.command('start', async (ctx) => {
    const position = await checkPosition(ctx.chat!.id);
    if (position.success && position.queueNumber !== undefined) {
      await ctx.reply(alreadyInLineMessage(position.queueNumber, position.countAhead || 0), {
        reply_markup: checkPositionKeyboard(),
      });
      return;
    }
    resetFlow(ctx.session);
    await showServices(ctx);
  });

  bot.callbackQuery(/^service_/, async (ctx) => {
    const position = await checkPosition(ctx.chat!.id);
    if (position.success && position.queueNumber !== undefined) {
      await ctx.editMessageText(alreadyInLineMessage(position.queueNumber, position.countAhead || 0), {
        reply_markup: checkPositionKeyboard(),
      });
      await ctx.answerCallbackQuery();
      return;
    }

    const serviceId = ctx.callbackQuery.data.replace('service_', '');
    const service = (await getActiveServices()).find((item) => item.id === serviceId);
    if (!service) {
      await ctx.editMessageText(genericFailureMessage());
      await ctx.answerCallbackQuery();
      return;
    }

    ctx.session.selectedServiceId = service.id;
    ctx.session.selectedServiceName = service.name;
    ctx.session.step = 'awaiting_name';
    await ctx.editMessageText('What is your name?');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('confirm_join', async (ctx) => {
    const serviceId = ctx.session.selectedServiceId;
    const name = ctx.session.clientName;
    const phone = ctx.session.clientPhone;
    if (!serviceId || !name || !phone) {
      await ctx.editMessageText(genericFailureMessage());
      resetFlow(ctx.session);
      await ctx.answerCallbackQuery();
      return;
    }

    const result = await joinQueue(ctx.chat!.id, name, phone, serviceId);
    if (!result.success) {
      await ctx.editMessageText(result.errorCode === 'shop_closed' ? queueClosedMessage() : genericFailureMessage());
      resetFlow(ctx.session);
      await ctx.answerCallbackQuery();
      return;
    }

    resetFlow(ctx.session);
    await ctx.editMessageText(joinedMessage(result.queueNumber!, result.countAhead || 0), {
      reply_markup: checkPositionKeyboard(),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cancel', async (ctx) => {
    resetFlow(ctx.session);
    await ctx.editMessageText(startMessage(), { reply_markup: servicesKeyboard(await getActiveServices()) });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('check_position', async (ctx) => {
    const result = await checkPosition(ctx.chat!.id);
    if (!result.success || result.queueNumber === undefined) {
      await ctx.editMessageText(notInLineMessage());
    } else {
      await ctx.editMessageText(positionMessage(result.queueNumber, result.countAhead || 0), {
        reply_markup: checkPositionKeyboard(),
      });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx) => {
    const position = await checkPosition(ctx.chat.id);
    if (position.success && position.queueNumber !== undefined) {
      await ctx.reply(positionMessage(position.queueNumber, position.countAhead || 0), {
        reply_markup: checkPositionKeyboard(),
      });
      return;
    }

    if (ctx.session.step === 'awaiting_name') {
      const name = ctx.message.text.trim();
      if (name.length < 2) {
        await ctx.reply('Please type your real name.');
        return;
      }
      ctx.session.clientName = name;
      ctx.session.step = 'awaiting_phone';
      await ctx.reply('What is your phone number?');
      return;
    }

    if (ctx.session.step === 'awaiting_phone') {
      const phone = ctx.message.text.replace(/\D/g, '');
      if (phone.length < 10) {
        await ctx.reply('Please type a valid phone number, for example 0912345678.');
        return;
      }
      ctx.session.clientPhone = phone;
      ctx.session.step = 'confirming_join';
      await ctx.reply(confirmServiceMessage(ctx.session.clientName!, ctx.session.selectedServiceName!), {
        reply_markup: confirmJoinKeyboard(),
      });
      return;
    }

    await showServices(ctx);
  });

  return bot;
}

export function getWebhookCallback() {
  return webhookCallback(createBot(), 'std/http');
}
