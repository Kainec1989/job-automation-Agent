import assert from 'node:assert/strict';
import { test } from 'node:test';

test('getLlmAttemptChain includes Gemini fallback model and secondary provider', async () => {
  process.env.LLM_ENABLED = 'true';
  process.env.LLM_PROVIDER = 'gemini';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'gemini-2.5-flash';
  process.env.LLM_FALLBACK_PROVIDER = 'openai';
  process.env.LLM_FALLBACK_API_KEY = 'fallback-key';
  process.env.LLM_FALLBACK_BASE_URL = 'https://api.groq.com/openai/v1';
  process.env.LLM_FALLBACK_MODEL = 'llama-3.3-70b-versatile';

  const { getLlmAttemptChain } = await import('../src/config/env.js');
  const chain = getLlmAttemptChain();

  assert.equal(chain.length, 3);
  assert.equal(chain[0]?.label, 'gemini/gemini-2.5-flash');
  assert.equal(chain[1]?.label, 'gemini/gemini-2.0-flash');
  assert.equal(chain[2]?.label, 'openai/llama-3.3-70b-versatile');
  assert.equal(chain[2]?.baseUrl, 'https://api.groq.com/openai/v1');
});
