import { createReadStream, existsSync } from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer/index.js';
import { env, getSmtpConfig } from '../config/env.js';
import type { Vacancy, VacancyType } from '../database/types.js';
import { buildApplicationAttachments } from './applicationAttachments.js';
import {
  buildAnschreiben,
  buildEmailBody,
  deriveContactNameFromEmail,
  selectTemplateType,
} from './anschreibenTemplates.js';
import { createAnschreibenPdf } from './createAnschreibenPdf.js';
import { generateAnschreiben } from './coverLetterGenerator.js';

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
    contactName?: string | null,
  ): { subject: string; text: string } {
    const templateType = selectTemplateType(vacancy.type);
    return buildAnschreiben({ ...vacancy, type: templateType }, contactName);
  }

  buildShortEmailBody(
    vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
    contactName?: string | null,
  ): string {
    return buildEmailBody(vacancy, contactName);
  }

  /**
   * Builds the subject, the full Anschreiben (for the PDF) and the short inbox
   * email body via LLM (if configured), falling back to the templates.
   */
  private async buildAnschreibenContent(
    vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
    contactName?: string | null,
  ): Promise<{ subject: string; anschreiben: string; emailBody: string }> {
    const llm = await generateAnschreiben({
      title: vacancy.title,
      company: vacancy.company,
      type: vacancy.type,
      description: vacancy.description ?? null,
      applicantName: env.applicantName,
      contactName,
    });

    if (llm) {
      console.log(`Using LLM-generated Anschreiben for ${vacancy.company}.`);
      return {
        subject: llm.subject,
        anschreiben: llm.body,
        emailBody: llm.emailBody || this.buildShortEmailBody(vacancy, contactName),
      };
    }

    const template = this.buildApplicationEmail(vacancy, contactName);
    return {
      subject: template.subject,
      anschreiben: template.text,
      emailBody: this.buildShortEmailBody(vacancy, contactName),
    };
  }

  async sendApplicationEmail(
    vacancy: Pick<Vacancy, 'title' | 'company' | 'type' | 'description'>,
    to: string,
    resumePath: string = env.resumePath,
  ): Promise<void> {
    if (!to.trim()) {
      throw new Error('Recipient email address is required');
    }

    const contactName = deriveContactNameFromEmail(to);
    const { subject, anschreiben, emailBody } = await this.buildAnschreibenContent(
      vacancy,
      contactName,
    );

    console.log(`Generating Anschreiben PDF for ${vacancy.company} (${vacancy.type})...`);
    const pdfBuffer = await createAnschreibenPdf({
      body: anschreiben,
      subject,
      senderName: env.applicantName,
      senderContactLines: [env.applicantEmail, env.applicantPhone].filter(Boolean),
      recipientCompany: vacancy.company,
      location: env.applicantLocation || undefined,
    });

    console.log(`Sending application email to ${to}...`);
    await this.sendEmail({
      to,
      subject,
      text: emailBody,
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

    const { subject, anschreiben, emailBody } = await this.buildAnschreibenContent(testVacancy);

    console.log(`Generating test Anschreiben PDF (${testVacancy.type})...`);
    const pdfBuffer = await createAnschreibenPdf({
      body: anschreiben,
      subject,
      senderName: env.applicantName,
      senderContactLines: [env.applicantEmail, env.applicantPhone].filter(Boolean),
      recipientCompany: testVacancy.company,
      location: env.applicantLocation || undefined,
    });

    const attachments = buildApplicationAttachments(pdfBuffer, env.testAttachmentPath);
    console.log(
      `Attachments: ${attachments.map((file) => file.filename).join(', ')}`,
    );

    await this.sendEmail({
      to: env.testEmailTo,
      subject: `[TEST] ${subject}`,
      text: emailBody,
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
