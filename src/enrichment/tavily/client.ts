import { getTavilyConfig } from '../../config/env.js';
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

export async function tavilySearch(request: TavilySearchRequest): Promise<TavilySearchResponse> {
  const config = getTavilyConfig();

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      search_depth: config.searchDepth,
      max_results: request.max_results ?? config.maxResults,
      topic: 'general',
      country: 'germany',
      include_answer: false,
      include_raw_content: false,
      exclude_domains: [...EXCLUDE_SEARCH_DOMAINS],
      ...request,
    }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new TavilyApiError(
      `Tavily search failed (${response.status})`,
      response.status,
      bodyText,
    );
  }

  return JSON.parse(bodyText) as TavilySearchResponse;
}

export async function tavilyExtract(request: TavilyExtractRequest): Promise<TavilyExtractResponse> {
  const config = getTavilyConfig();

  if (request.urls.length === 0) {
    return { results: [] };
  }

  const response = await fetch(TAVILY_EXTRACT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      extract_depth: config.extractDepth,
      format: 'markdown',
      include_images: false,
      include_favicon: false,
      query: request.query,
      chunks_per_source: request.chunks_per_source ?? 5,
      timeout: request.timeout ?? (config.extractDepth === 'advanced' ? 30 : 15),
      ...request,
    }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new TavilyApiError(
      `Tavily extract failed (${response.status})`,
      response.status,
      bodyText,
    );
  }

  return JSON.parse(bodyText) as TavilyExtractResponse;
}
