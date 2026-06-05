import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { launchBrowser } from '../scraper/browser.js';
import { buildCvDocument } from './markdownCvToHtml.js';

const mdPath = resolve(process.argv[2] ?? './Lebenslauf.md');
const outPath = resolve(process.argv[3] ?? './assets/Lebenslauf.pdf');

async function main(): Promise<void> {
  const markdown = readFileSync(mdPath, 'utf-8');
  const html = buildCvDocument(markdown);

  mkdirSync(dirname(outPath), { recursive: true });

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' },
    });
  } finally {
    await browser.close();
  }

  console.log(`PDF saved: ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
