import fs from 'node:fs/promises';
import path from 'node:path';

export interface SendReportEmailOptions {
  recipients: string[];
  subject: string;
  content: string;
  attachmentPath: string;
}

function normalizeRecipients(recipients: string[]): string[] {
  return recipients.map((recipient) => recipient.trim()).filter(Boolean);
}

async function assertAttachmentExists(attachmentPath: string): Promise<string> {
  const absoluteAttachmentPath = path.resolve(attachmentPath);
  const stat = await fs.stat(absoluteAttachmentPath).catch(() => undefined);
  if (!stat) {
    throw new Error(`Email attachment does not exist: ${absoluteAttachmentPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Email attachment is not a file: ${absoluteAttachmentPath}`);
  }

  return absoluteAttachmentPath;
}

function parseJsonResponse(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`Email API returned non-JSON response: ${body.slice(0, 500)}`);
  }
}

export async function sendReportEmail(options: SendReportEmailOptions): Promise<void> {
  const apiUrl = 'https://app.3chatai.cn/api/ai/integration/common/email/send';
  if (!apiUrl) {
    throw new Error('E2E_EMAIL_API_URL is required when E2E report email is enabled.');
  }

  const recipients = normalizeRecipients(options.recipients);
  if (!recipients.length) {
    throw new Error('E2E_REPORT_EMAIL_TO must contain at least one recipient.');
  }

  const attachmentPath = await assertAttachmentExists(options.attachmentPath);
  const attachment = await fs.readFile(attachmentPath);
  const formData = new FormData();

  formData.append('to', recipients.join(','));
  formData.append('subject', options.subject);
  formData.append('content', options.content);
  formData.append(
    'files',
    new Blob([attachment as BlobPart], { type: 'application/zip' }),
    path.basename(attachmentPath),
  );

  const response = await fetch(apiUrl, {
    method: 'POST',
    body: formData,
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Email API HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = parseJsonResponse(body);
  if (payload.code !== '200') {
    throw new Error(`Email API business failure: ${body.slice(0, 500)}`);
  }
}
