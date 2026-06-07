import { env, getTavilyConfig } from '../../config/env.js';
import { EXCLUDE_SEARCH_DOMAINS } from './constants.js';
import type {
  TavilyExtractRequest,
  TavilyExtractResponse,
  TavilySearchRequest,
  TavilySearchResponse,
} from './types.js';

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';

export class TavilyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'TavilyApiError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 800 * 2 ** (attempt - 1));
}

/**
 * POSTs to Tavily with retries on transient failures (5xx and network errors).
 * Client errors (4xx, including 401/429) are thrown immediately so callers can react.
 */
async function tavilyPost(url: string, payload: unknown, label: string): Promise<string> {
  const config = getTavilyConfig();
  const maxAttempts = Math.max(1, env.tavilyMaxRetries + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text();

      if (!response.ok) {
        const error = new TavilyApiError(`${label} failed (${response.status})`, response.status, bodyText);
        if (response.status >= 500 && attempt < maxAttempts) {
          console.warn(`[Tavily] ${label} ${response.status}, retry ${attempt}/${maxAttempts - 1}...`);
          lastError = error;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw error;
      }

      return bodyText;
    } catch (error) {
      if (error instanceof TavilyApiError) {
        throw error;
      }

      // Network/transport error — retry until attempts are exhausted.
      lastError = error;
      if (attempt < maxAttempts) {
        console.warn(`[Tavily] ${label} network error, retry ${attempt}/${maxAttempts - 1}...`);
        await sleep(backoffMs(attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export async function tavilySearch(request: TavilySearchRequest): Promise<TavilySearchResponse> {
  const config = getTavilyConfig();

  const bodyText = await tavilyPost(
    TAVILY_SEARCH_URL,
    {
      search_depth: config.searchDepth,
      max_results: request.max_results ?? config.maxResults,
      topic: 'general',
      country: 'germany',
      include_answer: false,
      include_raw_content: false,
      exclude_domains: [...EXCLUDE_SEARCH_DOMAINS],
      ...request,
    },
    'Tavily search',
  );

  return JSON.parse(bodyText) as TavilySearchResponse;
}

export async function tavilyExtract(request: TavilyExtractRequest): Promise<TavilyExtractResponse> {
  const config = getTavilyConfig();

  if (request.urls.length === 0) {
    return { results: [] };
  }

  const bodyText = await tavilyPost(
    TAVILY_EXTRACT_URL,
    {
      extract_depth: config.extractDepth,
      format: 'markdown',
      include_images: false,
      include_favicon: false,
      query: request.query,
      chunks_per_source: request.chunks_per_source ?? 5,
      timeout: request.timeout ?? (config.extractDepth === 'advanced' ? 30 : 15),
      ...request,
    },
    'Tavily extract',
  );

  return JSON.parse(bodyText) as TavilyExtractResponse;
}
