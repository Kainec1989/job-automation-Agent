export type TavilySearchDepth = 'basic' | 'advanced' | 'fast' | 'ultra-fast';
export type TavilyExtractDepth = 'basic' | 'advanced';

export interface TavilySearchRequest {
  query: string;
  search_depth?: TavilySearchDepth;
  max_results?: number;
  topic?: 'general' | 'news' | 'finance';
  country?: string;
  include_answer?: boolean;
  include_raw_content?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string | null;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  response_time?: number;
}

export interface TavilyEmailLookupInput {
  company: string;
  title?: string | null;
  jobUrl?: string | null;
}

export interface TavilyExtractRequest {
  urls: string[];
  extract_depth?: TavilyExtractDepth;
  format?: 'markdown' | 'text';
  query?: string;
  chunks_per_source?: number;
  timeout?: number;
}

export interface TavilyExtractResultItem {
  url: string;
  raw_content?: string;
  rawContent?: string;
}

export interface TavilyExtractResponse {
  results: TavilyExtractResultItem[];
  failed_results?: Array<{ url: string; error: string }>;
  failedResults?: Array<{ url: string; error: string }>;
  response_time?: number;
}

export interface TavilyEmailLookupResult {
  email: string | null;
  query: string;
  strategy: string;
  queriesAttempted: string[];
  extractedUrls: string[];
  sourceUrl: string | null;
  candidates: string[];
  results: TavilySearchResult[];
}
