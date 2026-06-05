import { existsSync } from 'node:fs';
import { google } from 'googleapis';
import { env } from '../config/env.js';

export function createSheetsClient() {
  if (!existsSync(env.googleCredentialsPath)) {
    throw new Error(`Google credentials file not found: ${env.googleCredentialsPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: env.googleCredentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}
