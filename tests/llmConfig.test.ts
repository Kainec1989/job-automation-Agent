import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getLlmAttemptChain } from '../src/config/env.js';

const savedEnv: Record<string, string | undefined> = {};

function saveEnv(keys: string[]): void {
  for (const key of keys) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv(keys: string[]): void {
  for (const key of keys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

const ENV_KEYS = [
  'LLM_ENABLED',
  'LLM_PROVIDER',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_FALLBACK_PROVIDER',
  'LLM_FALLBACK_API_KEY',
  'LLM_FALLBACK_BASE_URL',
  'LLM_FALLBACK_MODEL',
  'LLM_FALLBACK2_PROVIDER',
  'LLM_FALLBACK2_API_KEY',
  'LLM_FALLBACK2_BASE_URL',
  'LLM_FALLBACK2_MODEL',
];

function clearFallback2Env(): void {
  for (const key of [
    'LLM_FALLBACK2_PROVIDER',
    'LLM_FALLBACK2_API_KEY',
    'LLM_FALLBACK2_BASE_URL',
    'LLM_FALLBACK2_MODEL',
  ]) {
    delete process.env[key];
  }
}

before(() => saveEnv(ENV_KEYS));
after(() => restoreEnv(ENV_KEYS));

test('getLlmAttemptChain includes Gemini fallback model and Groq provider', async () => {
  process.env.LLM_ENABLED = 'true';
  process.env.LLM_PROVIDER = 'gemini';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'gemini-2.5-flash';
  process.env.LLM_FALLBACK_PROVIDER = 'openai';
  process.env.LLM_FALLBACK_API_KEY = 'groq-key';
  process.env.LLM_FALLBACK_BASE_URL = 'https://api.groq.com/openai/v1';
  process.env.LLM_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
  clearFallback2Env();

  const chain = getLlmAttemptChain();

  assert.equal(chain.length, 3);
  assert.equal(chain[0]?.label, 'gemini/gemini-2.5-flash');
  assert.equal(chain[1]?.label, 'gemini/gemini-2.0-flash');
  assert.equal(chain[2]?.label, 'openai/llama-3.3-70b-versatile');
  assert.equal(chain[2]?.baseUrl, 'https://api.groq.com/openai/v1');
});

test('getLlmAttemptChain appends OpenRouter as third external fallback', async () => {
  process.env.LLM_ENABLED = 'true';
  process.env.LLM_PROVIDER = 'gemini';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'gemini-2.5-flash';
  process.env.LLM_FALLBACK_PROVIDER = 'openai';
  process.env.LLM_FALLBACK_API_KEY = 'groq-key';
  process.env.LLM_FALLBACK_BASE_URL = 'https://api.groq.com/openai/v1';
  process.env.LLM_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
  process.env.LLM_FALLBACK2_PROVIDER = 'openai';
  process.env.LLM_FALLBACK2_API_KEY = 'or-key';
  process.env.LLM_FALLBACK2_BASE_URL = 'https://openrouter.ai/api/v1';
  process.env.LLM_FALLBACK2_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

  const chain = getLlmAttemptChain();

  assert.equal(chain.length, 4);
  assert.equal(chain[3]?.label, 'openai/meta-llama/llama-3.3-70b-instruct:free');
  assert.equal(chain[3]?.baseUrl, 'https://openrouter.ai/api/v1');
});
