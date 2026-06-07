import PDFDocument from 'pdfkit';

export interface AnschreibenPdfOptions {
  body: string;
  subject?: string;
  senderName?: string;
  senderContactLines?: string[];
  recipientCompany?: string;
  location?: string;
  date?: Date;
}

const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

function formatGermanDate(date: Date): string {
  return `${date.getDate()}. ${MONTHS_DE[date.getMonth()]} ${date.getFullYear()}`;
}

function normalizeOptions(input: string | AnschreibenPdfOptions): AnschreibenPdfOptions {
  return typeof input === 'string' ? { body: input } : input;
}

/**
 * Renders a German business letter (DIN 5008-inspired): sender line, recipient block,
 * right-aligned date, bold subject (Betreff), then the body text. Passing a plain string
 * keeps the previous behavior (body only).
 */
export function createAnschreibenPdf(input: string | AnschreibenPdfOptions): Promise<Buffer> {
  const options = normalizeOptions(input);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    const hasHeader =
      options.senderName ||
      options.recipientCompany ||
      options.subject ||
      (options.senderContactLines && options.senderContactLines.length > 0);

    if (hasHeader) {
      if (options.senderName) {
        doc.font('Helvetica-Bold').fontSize(11).text(options.senderName, { align: 'left' });
      }

      const contactLines = (options.senderContactLines ?? []).filter(Boolean);
      if (contactLines.length > 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#444444').text(contactLines.join('  ·  '));
        doc.fillColor('#000000');
      }

      doc.moveDown(1.5);

      if (options.recipientCompany) {
        doc.font('Helvetica').fontSize(11).text(options.recipientCompany, { align: 'left' });
      }

      const dateText = `${options.location ? `${options.location}, den ` : ''}${formatGermanDate(
        options.date ?? new Date(),
      )}`;
      doc.font('Helvetica').fontSize(10).text(dateText, { align: 'right' });

      doc.moveDown(1.5);

      if (options.subject) {
        doc.font('Helvetica-Bold').fontSize(12).text(options.subject, { align: 'left' });
        doc.moveDown(1);
      }
    }

    doc.font('Helvetica').fontSize(12).lineGap(4).text(options.body, { align: 'left' });
    doc.end();
  });
}
