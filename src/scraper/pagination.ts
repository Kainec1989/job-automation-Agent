export type PageUrlBuilder = (baseUrl: string, pageIndex: number) => string;

export function buildLinkedInPageUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);
  const start = pageIndex * 25;
  if (start > 0) {
    url.searchParams.set('start', String(start));
  } else {
    url.searchParams.delete('start');
  }
  return url.toString();
}

export function buildIndeedPageUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);
  const start = pageIndex * 10;
  if (start > 0) {
    url.searchParams.set('start', String(start));
  } else {
    url.searchParams.delete('start');
  }
  return url.toString();
}

export function buildStepstonePageUrl(baseUrl: string, pageIndex: number): string {
  const url = new URL(baseUrl);
  const page = pageIndex + 1;
  if (page > 1) {
    url.searchParams.set('page', String(page));
  } else {
    url.searchParams.delete('page');
  }
  return url.toString();
}

export function buildPageUrls(
  baseUrl: string,
  maxPages: number,
  buildPageUrl: PageUrlBuilder,
): string[] {
  return Array.from({ length: maxPages }, (_, pageIndex) => buildPageUrl(baseUrl, pageIndex));
}
