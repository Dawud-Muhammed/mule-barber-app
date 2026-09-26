import { Bot, webhookCallback } from 'grammy';
import { BotContext, SessionData } from './context';
import {
  checkPosition,
  getActiveServices,
  getBotLanguage,
  joinQueue,
  saveBotLanguage,
} from './queue';
import {
  alreadyInLineMessage,
  checkPositionKeyboard,
  confirmJoinKeyboard,
  confirmServiceMessage,
  genericFailureMessage,
  joinedMessage,
  languageKeyboard,
  notInLineMessage,
  positionMessage,
  queueClosedMessage,
  servicesKeyboard,
} from './keyboards';
import { Language, t } from './messages';

const sessions = new Map<number, SessionData>();

function resetFlow(session: SessionData) {
  session.step = undefined;
  session.selectedServiceId = undefined;
  session.selectedServiceName = undefined;
  session.clientName = undefined;
  session.clientPhone = undefined;
}

async function getLanguage(ctx: BotContext): Promise<Language | null> {
  if (ctx.session.language) return ctx.session.language;
  const language = await getBotLanguage(ctx.chat!.id);
  if (language) ctx.session.language = language;
  return language;
}

async function showLanguagePrompt(ctx: BotContext) {
  await ctx.reply(t('en', 'language_prompt'), { reply_markup: languageKeyboard() });
}

async function showServices(ctx: BotContext, language: Language) {
  const services = await getActiveServices();
  if (services.length === 0) {
    await ctx.reply(genericFailureMessage(language));
    return;
  }
  ctx.session.step = 'selecting_service';
  await ctx.reply(t(language, 'choose_service'), {
    reply_markup: servicesKeyboard(services, language),
  });
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
    const language = await getLanguage(ctx);
    if (!language) {
      resetFlow(ctx.session);
      await showLanguagePrompt(ctx);
      return;
    }

    const position = await checkPosition(ctx.chat!.id);
    if (position.success && position.queueNumber !== undefined) {
      await ctx.reply(alreadyInLineMessage(language, position.queueNumber, position.countAhead || 0), {
        reply_markup: checkPositionKeyboard(language),
      });
      return;
    }

    resetFlow(ctx.session);
    await showServices(ctx, language);
  });

  bot.callbackQuery('language_switch', async (ctx) => {
    resetFlow(ctx.session);
    await ctx.editMessageText(t('en', 'language_prompt'), { reply_markup: languageKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^language_(am|en)$/, async (ctx) => {
    const language = ctx.callbackQuery.data === 'language_am' ? 'am' : 'en';
    const saved = await saveBotLanguage(ctx.chat!.id, language);
    if (!saved) {
      await ctx.editMessageText(genericFailureMessage(language));
      await ctx.answerCallbackQuery();
      return;
    }

    ctx.session.language = language;
    resetFlow(ctx.session);
    await ctx.editMessageText(t(language, 'choose_service'), {
      reply_markup: servicesKeyboard(await getActiveServices(), language),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^service_/, async (ctx) => {
    const language = await getLanguage(ctx);
    if (!language) {
      await ctx.editMessageText(t('en', 'language_prompt'), { reply_markup: languageKeyboard() });
      await ctx.answerCallbackQuery();
      return;
    }

    const position = await checkPosition(ctx.chat!.id);
    if (position.success && position.queueNumber !== undefined) {
      await ctx.editMessageText(alreadyInLineMessage(language, position.queueNumber, position.countAhead || 0), {
        reply_markup: checkPositionKeyboard(language),
      });
      await ctx.answerCallbackQuery();
      return;
    }

    const serviceId = ctx.callbackQuery.data.replace('service_', '');
    const service = (await getActiveServices()).find((item) => item.id === serviceId);
    if (!service) {
      await ctx.editMessageText(genericFailureMessage(language));
      await ctx.answerCallbackQuery();
      return;
    }

    ctx.session.selectedServiceId = service.id;
    ctx.session.selectedServiceName = language === 'am' ? service.name_am || service.name : service.name;
    ctx.session.step = 'awaiting_name';
    await ctx.editMessageText(t(language, 'ask_name'));
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('confirm_join', async (ctx) => {
    const language = await getLanguage(ctx) || 'en';
    const serviceId = ctx.session.selectedServiceId;
    const name = ctx.session.clientName;
    const phone = ctx.session.clientPhone;
    if (!serviceId || !name || !phone) {
      await ctx.editMessageText(genericFailureMessage(language));
      resetFlow(ctx.session);
      await ctx.answerCallbackQuery();
      return;
    }

    const result = await joinQueue(ctx.chat!.id, name, phone, serviceId);
    if (!result.success) {
      await ctx.editMessageText(result.errorCode === 'shop_closed' ? queueClosedMessage(language) : genericFailureMessage(language));
      resetFlow(ctx.session);
      await ctx.answerCallbackQuery();
      return;
    }

    resetFlow(ctx.session);
    await ctx.editMessageText(joinedMessage(language, result.queueNumber!, result.countAhead || 0), {
      reply_markup: checkPositionKeyboard(language),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cancel', async (ctx) => {
    const language = await getLanguage(ctx) || 'en';
    resetFlow(ctx.session);
    await ctx.editMessageText(t(language, 'choose_service'), {
      reply_markup: servicesKeyboard(await getActiveServices(), language),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('check_position', async (ctx) => {
    const language = await getLanguage(ctx) || 'en';
    const result = await checkPosition(ctx.chat!.id);
    if (!result.success || result.queueNumber === undefined) {
      await ctx.editMessageText(notInLineMessage(language));
    } else {
      await ctx.editMessageText(positionMessage(language, result.queueNumber, result.countAhead || 0), {
        reply_markup: checkPositionKeyboard(language),
      });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on('message:text', async (ctx) => {
    const language = await getLanguage(ctx);
    if (!language) {
      resetFlow(ctx.session);
      await showLanguagePrompt(ctx);
      return;
    }

    const position = await checkPosition(ctx.chat.id);
    if (position.success && position.queueNumber !== undefined) {
      await ctx.reply(positionMessage(language, position.queueNumber, position.countAhead || 0), {
        reply_markup: checkPositionKeyboard(language),
      });
      return;
    }

    if (ctx.session.step === 'awaiting_name') {
      const name = ctx.message.text.trim();
      if (name.length < 2) {
        await ctx.reply(t(language, 'invalid_name'));
        return;
      }
      ctx.session.clientName = name;
      ctx.session.step = 'awaiting_phone';
      await ctx.reply(t(language, 'ask_phone'));
      return;
    }

    if (ctx.session.step === 'awaiting_phone') {
      const phone = ctx.message.text.replace(/\D/g, '');
      if (phone.length < 10) {
        await ctx.reply(t(language, 'invalid_phone'));
        return;
      }
      ctx.session.clientPhone = phone;
      ctx.session.step = 'confirming_join';
      await ctx.reply(confirmServiceMessage(language, ctx.session.clientName!, ctx.session.selectedServiceName!), {
        reply_markup: confirmJoinKeyboard(language),
      });
      return;
    }

    await showServices(ctx, language);
  });

  return bot;
}

export function getWebhookCallback() {
  return webhookCallback(createBot(), 'std/http');
}
