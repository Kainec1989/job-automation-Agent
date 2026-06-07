import type { EmailAttachment } from './emailService.js';
import { env } from '../config/env.js';

export function buildApplicationAttachments(
  anschreibenPdf: Buffer,
  resumePath: string = env.resumePath,
): EmailAttachment[] {
  const attachments: EmailAttachment[] = [
    {
      filename: 'Anschreiben.pdf',
      content: anschreibenPdf,
      contentType: 'application/pdf',
    },
    {
      filename: 'Lebenslauf.pdf',
      path: resumePath,
      contentType: 'application/pdf',
    },
  ];

  if (env.dciCertificatePath) {
    attachments.push({
      filename: 'Zertifikat_DCI_Fullstack_Developer.pdf',
      path: env.dciCertificatePath,
      contentType: 'application/pdf',
    });
  }

  return attachments;
}

export function hasDciCertificate(): boolean {
  return env.dciCertificatePath !== null;
}
