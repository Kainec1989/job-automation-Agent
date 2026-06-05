import { createReadStream, existsSync } from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer/index.js';
import { env, getSmtpConfig } from '../config/env.js';
import type { Vacancy, VacancyType } from '../database/types.js';
import { buildApplicationAttachments } from './applicationAttachments.js';
import { buildAnschreiben, buildEmailBody, selectTemplateType } from './anschreibenTemplates.js';
import { createAnschreibenPdf } from './createAnschreibenPdf.js';

export interface EmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export class EmailService {
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor() {
    const smtp = getSmtpConfig();

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    this.fromAddress = smtp.from;
  }

  async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SMTP connection verification failed: ${message}`);
    }
  }

  private resolveAttachments(attachments: EmailAttachment[]): Attachment[] {
    return attachments.map((attachment) => {
      if (attachment.content) {
        return {
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType ?? 'application/pdf',
        };
      }

      if (!attachment.path || !existsSync(attachment.path)) {
        throw new Error(`Attachment file not found: ${attachment.path ?? attachment.filename}`);
      }

      return {
        filename: attachment.filename,
        content: createReadStream(attachment.path),
        contentType: attachment.contentType ?? 'application/pdf',
      };
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const attachments = options.attachments ? this.resolveAttachments(options.attachments) : undefined;

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments,
      });

      console.log(`Email sent. Message ID: ${info.messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send email: ${message}`);
    }
  }

  buildApplicationEmail(
    vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
  ): { subject: string; text: string } {
    const templateType = selectTemplateType(vacancy.type);
    return buildAnschreiben({ ...vacancy, type: templateType });
  }

  buildShortEmailBody(
    vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
  ): string {
    return buildEmailBody(vacancy);
  }

  async sendApplicationEmail(
    vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
    to: string,
    resumePath: string = env.testAttachmentPath,
  ): Promise<void> {
    if (!to.trim()) {
      throw new Error('Recipient email address is required');
    }

    const { subject, text: anschreibenText } = this.buildApplicationEmail(vacancy);

    console.log(`Generating Anschreiben PDF for ${vacancy.company} (${vacancy.type})...`);
    const pdfBuffer = await createAnschreibenPdf(anschreibenText);

    console.log(`Sending application email to ${to}...`);
    await this.sendEmail({
      to,
      subject,
      text: this.buildShortEmailBody(vacancy),
      attachments: buildApplicationAttachments(pdfBuffer, resumePath),
    });

    console.log(`Application email successfully sent to ${vacancy.company}`);
  }

  async sendTestEmail(): Promise<void> {
    if (!env.testEmailTo) {
      throw new Error('TEST_EMAIL_TO is not set in .env');
    }

    await this.verifyConnection();

    const testVacancy = {
      title: 'Junior Software Engineer — TypeScript & React (m/w/d)',
      company: 'Codewerk GmbH',
      type: 'junior' as VacancyType,
      description:
        'Wir suchen einen Junior Developer mit Node.js, TypeScript, React, Python, LLM und Testautomatisierung mit Playwright.',
    };

    const { subject, text: anschreibenText } = this.buildApplicationEmail(testVacancy);

    console.log(`Generating test Anschreiben PDF (${testVacancy.type})...`);
    const pdfBuffer = await createAnschreibenPdf(anschreibenText);

    const attachments = buildApplicationAttachments(pdfBuffer, env.testAttachmentPath);
    console.log(
      `Attachments: ${attachments.map((file) => file.filename).join(', ')}`,
    );

    await this.sendEmail({
      to: env.testEmailTo,
      subject: `[TEST] ${subject}`,
      text: this.buildShortEmailBody(testVacancy),
      attachments,
    });
  }
}

async function main(): Promise<void> {
  const service = new EmailService();

  try {
    console.log('Verifying SMTP connection...');
    await service.sendTestEmail();
    console.log(`Test email sent to: ${env.testEmailTo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Email service failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('emailService.ts')) {
  void main();
}
