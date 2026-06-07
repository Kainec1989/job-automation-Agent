import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLlmConfig, isLlmConfigured, type LlmConfig } from '../config/env.js';
import type { VacancyType } from '../database/types.js';
import {
  coverLetterCacheKey,
  getCoverLetterCache,
  setCoverLetterCache,
  type CachedCoverLetter,
} from './coverLetterCache.js';

export interface CoverLetterInput {
  title: string;
  company: string;
  type: VacancyType;
  description: string | null;
  applicantName: string;
  contactName?: string | null;
}

const CV_PATH = resolve('./Lebenslauf.md');
let cachedCv: string | null = null;

function loadCandidateProfile(): string {
  if (cachedCv !== null) {
    return cachedCv;
  }

  try {
    cachedCv = existsSync(CV_PATH) ? readFileSync(CV_PATH, 'utf8').slice(0, 6000) : '';
  } catch {
    cachedCv = '';
  }

  return cachedCv;
}

function buildPrompt(input: CoverLetterInput): string {
  const salutationHint = input.contactName
    ? `Use the salutation addressing this contact person: ${input.contactName}.`
    : 'Use the salutation "Sehr geehrte Damen und Herren," (no named contact is known).';

  return [
    'Du schreibst ein professionelles deutsches Bewerbungsanschreiben (Anschreiben).',
    '',
    `Bewerber: ${input.applicantName}`,
    'Lebenslauf des Bewerbers (Markdown):',
    '"""',
    loadCandidateProfile(),
    '"""',
    '',
    'Stellenanzeige:',
    `- Titel: ${input.title}`,
    `- Unternehmen: ${input.company}`,
    `- Art: ${input.type === 'praktikum' ? 'Praktikum' : 'Festanstellung (Junior)'}`,
    `- Beschreibung: ${(input.description ?? '').slice(0, 2500) || '(keine Beschreibung verfügbar)'}`,
    '',
    'Anforderungen an das vollständige Anschreiben (Feld "body", kommt als PDF-Anhang):',
    '- Sprache: Deutsch, professionell, natürlich, nicht generisch.',
    '- Maximal ca. 250 Wörter, 3–4 kurze Absätze.',
    `- ${salutationHint}`,
    '- Beziehe dich konkret auf die Stelle und passende Skills aus dem Lebenslauf.',
    '- Schließe mit "Mit freundlichen Grüßen" und dem Namen des Bewerbers.',
    '- Keine Platzhalter, keine eckigen Klammern, keine erfundenen Fakten.',
    '- Es handelt sich um eine ausgeschriebene Stelle, KEINE Initiativbewerbung. Verwende daher NICHT die Wörter "initiativ" oder "Initiativbewerbung".',
    '',
    'Anforderungen an den kurzen E-Mail-Text (Feld "emailBody", steht im Posteingang):',
    '- Sehr kurz: 4–6 Sätze, KEINE Aufzählungen/Bulletpoints.',
    '- Natürlich und menschlich, wie eine echte kurze Begleitnachricht — nicht das Anschreiben wiederholen.',
    `- ${salutationHint}`,
    '- Nenne in einem Satz, warum die Stelle passt, und verweise auf Lebenslauf und Anschreiben im Anhang.',
    '- Es handelt sich um eine ausgeschriebene Stelle, KEINE Initiativbewerbung. Verwende daher NICHT die Wörter "initiativ" oder "Initiativbewerbung".',
    '- Schließe mit "Mit freundlichen Grüßen" und dem Namen des Bewerbers.',
    '',
    'Antworte AUSSCHLIESSLICH als JSON-Objekt mit den Feldern "subject", "body" und "emailBody".',
    '"subject" = Betreffzeile, "body" = vollständiger Anschreiben-Text (PDF), "emailBody" = kurzer E-Mail-Text. Alle mit Zeilenumbrüchen wo nötig.',
  ].join('\n');
}

async function callOpenAi(config: LlmConfig, prompt: string): Promise<string> {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are an expert German career coach who writes concise, tailored cover letters.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(config: LlmConfig, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      temperature: 0.6,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nGib nur das JSON-Objekt zurück, ohne zusätzlichen Text.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };

  return data.content?.[0]?.text ?? '';
}

async function callGemini(config: LlmConfig, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model,
  )}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

function parseResponse(raw: string): CachedCoverLetter | null {
  if (!raw.trim()) {
    return null;
  }

  // Tolerate code fences or surrounding prose by extracting the first JSON object.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]) as {
      subject?: unknown;
      body?: unknown;
      emailBody?: unknown;
    };
    const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    const emailBody = typeof parsed.emailBody === 'string' ? parsed.emailBody.trim() : '';

    if (!subject || !body) {
      return null;
    }

    // emailBody is optional; the caller falls back to the template body when empty.
    return { subject, body, emailBody };
  } catch {
    return null;
  }
}

/**
 * Generates a tailored Anschreiben via LLM, with per-vacancy caching.
 * Returns null when the LLM is disabled or generation fails (caller falls back to the template).
 */
export async function generateAnschreiben(
  input: CoverLetterInput,
): Promise<CachedCoverLetter | null> {
  if (!isLlmConfigured()) {
    return null;
  }

  const cacheKey = coverLetterCacheKey(input);
  const cached = getCoverLetterCache(cacheKey);
  if (cached) {
    return cached;
  }

  const config = getLlmConfig();

  try {
    const prompt = buildPrompt(input);
    let raw: string;
    if (config.provider === 'gemini') {
      raw = await callGemini(config, prompt);
    } else if (config.provider === 'anthropic') {
      raw = await callAnthropic(config, prompt);
    } else {
      raw = await callOpenAi(config, prompt);
    }

    const result = parseResponse(raw);
    if (!result) {
      console.warn('[CoverLetter] LLM returned unusable output — falling back to template.');
      return null;
    }

    setCoverLetterCache(cacheKey, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[CoverLetter] LLM generation failed (${message}) — falling back to template.`);
    return null;
  }
}
