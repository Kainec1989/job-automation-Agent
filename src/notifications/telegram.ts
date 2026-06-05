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
