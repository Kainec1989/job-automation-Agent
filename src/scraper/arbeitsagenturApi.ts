const API_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const API_KEY = 'jobboerse-jobsuche';

const BA_HEADERS = {
  'X-API-Key': API_KEY,
  Accept: 'application/json',
} as const;

export function encodeRefnr(refnr: string): string {
  return Buffer.from(refnr, 'utf8').toString('base64');
}

interface ArbeitsagenturJobDetails {
  stellenangebotsTitel?: string;
  stellenangebotsBeschreibung?: string;
  arbeitgeber?: string;
  stellenlokationen?: Array<{ ort?: string }>;
}

interface ArbeitsagenturBewerbung {
  bewerbung?: {
    email?: string;
    telefon?: string;
    link?: string;
  };
  kontakt?: {
    email?: string;
    telefon?: string;
  };
  email?: string;
}

async function baFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { headers: BA_HEADERS });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchArbeitsagenturJobDetails(refnr: string): Promise<{
  description: string | null;
  title: string | null;
}> {
  const encoded = encodeRefnr(refnr);
  const data = await baFetch<ArbeitsagenturJobDetails>(`/pc/v4/jobdetails/${encoded}`);

  if (!data) {
    return { description: null, title: null };
  }

  const description =
    data.stellenangebotsBeschreibung?.trim() ||
    data.stellenangebotsTitel?.trim() ||
    null;

  return {
    description,
    title: data.stellenangebotsTitel?.trim() ?? null,
  };
}

export async function fetchArbeitsagenturBewerbungEmail(refnr: string): Promise<string | null> {
  const encoded = encodeRefnr(refnr);
  const data = await baFetch<ArbeitsagenturBewerbung>(`/pc/v1/app/jobs/${encoded}/bewerbung`);

  if (!data) {
    return null;
  }

  const candidates = [
    data.bewerbung?.email,
    data.kontakt?.email,
    data.email,
  ].filter((value): value is string => Boolean(value?.trim()));

  return candidates[0]?.trim().toLowerCase() ?? null;
}
