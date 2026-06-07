import { env } from '../config/env.js';

export interface TelegramChat {
  chatId: string;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
    };
  };
}

export function isTelegramConfigured(): boolean {
  return Boolean(env.telegramBotToken && env.telegramChatId);
}

export async function fetchTelegramUpdates(token: string): Promise<TelegramChat[]> {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = (await response.json()) as TelegramApiResponse<TelegramUpdate[]>;

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram getUpdates failed (${response.status})`);
  }

  const chats = new Map<string, TelegramChat>();

  for (const update of data.result ?? []) {
    const chat = update.message?.chat;
    if (!chat) {
      continue;
    }

    const chatId = String(chat.id);
    chats.set(chatId, {
      chatId,
      type: chat.type,
      title: chat.title,
      username: chat.username,
      firstName: chat.first_name,
    });
  }

  return [...chats.values()];
}

async function getMaxUpdateId(token: string): Promise<number> {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1`);
  const data = (await response.json()) as TelegramApiResponse<TelegramUpdate[]>;

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram getUpdates failed (${response.status})`);
  }

  const updates = data.result ?? [];
  return updates.length > 0 ? updates[updates.length - 1].update_id : 0;
}

/**
 * Waits for the next text message from the configured chat using long polling.
 * Ignores messages received before this call. Returns the trimmed text, or null on timeout.
 */
export async function waitForTelegramReply(options: {
  token?: string;
  chatId?: string;
  timeoutMs: number;
}): Promise<string | null> {
  const token = options.token ?? env.telegramBotToken;
  const chatId = options.chatId ?? env.telegramChatId;

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  }

  const deadline = Date.now() + options.timeoutMs;
  let offset = (await getMaxUpdateId(token)) + 1;

  while (Date.now() < deadline) {
    const remainingSec = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    const longPollSec = Math.min(30, remainingSec);

    const response = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${longPollSec}`,
    );
    const data = (await response.json()) as TelegramApiResponse<TelegramUpdate[]>;

    if (!response.ok || !data.ok) {
      throw new Error(data.description ?? `Telegram getUpdates failed (${response.status})`);
    }

    for (const update of data.result ?? []) {
      offset = update.update_id + 1;
      const message = update.message;
      if (message && String(message.chat.id) === chatId && typeof message.text === 'string') {
        return message.text.trim();
      }
    }
  }

  return null;
}

export async function sendTelegramMessage(
  text: string,
  options?: { token?: string; chatId?: string },
): Promise<void> {
  const token = options?.token ?? env.telegramBotToken;
  const chatId = options?.chatId ?? env.telegramChatId;

  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = (await response.json()) as TelegramApiResponse<unknown>;

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram sendMessage failed (${response.status})`);
  }
}
