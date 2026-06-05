/** Убирает шум LinkedIn/Indeed: переносы, «with verification», дубли заголовка. */
export function sanitizeJobText(raw: string): string {
  let text = raw
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+with\s+verification\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  text = dedupeRepeatedPhrase(text);
  return text;
}

function dedupeRepeatedPhrase(text: string): string {
  const exact = text.match(/^(.+?)\s+\1$/i);
  if (exact) {
    return exact[1].trim();
  }

  const words = text.split(' ');
  const maxLen = Math.floor(words.length / 2);

  for (let len = maxLen; len >= 4; len--) {
    const first = words.slice(0, len).join(' ');
    const second = words.slice(len, len * 2).join(' ');
    if (first.length > 10 && first.toLowerCase() === second.toLowerCase()) {
      return first;
    }
  }

  return text;
}

export function sanitizeJobFields(title: string, company: string): { title: string; company: string } {
  return {
    title: sanitizeJobText(title),
    company: sanitizeJobText(company),
  };
}
