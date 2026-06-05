import PDFDocument from 'pdfkit';

export function createAnschreibenPdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    doc.font('Helvetica').fontSize(12).lineGap(4).text(text, { align: 'left' });
    doc.end();
  });
}
