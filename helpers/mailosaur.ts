import MailosaurClient from 'mailosaur';

const CODE_PATTERN = /\b\d{4,8}\b/;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createTestEmail(_prefix = 'register'): string {
  const domain = requiredEnv('MAILOSAUR_SERVER_DOMAIN');
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = `${month}${day}`;
  const random = Math.random().toString(36).slice(2, 6);
  return `${date}${random}@${domain}`;
}

export async function getLatestEmailCode(email: string): Promise<string> {
  const apiKey = requiredEnv('MAILOSAUR_API_KEY');
  const serverId = requiredEnv('MAILOSAUR_SERVER_ID');
  const client = new MailosaurClient(apiKey);

  let message;
  try {
    message = await client.messages.get(
      serverId,
      { sentTo: email },
      { timeout: 60_000 }
    );
  } catch (error) {
    throw new Error(
      `Mailosaur did not receive an email sent to ${email} within 60 seconds. Original error: ${String(error)}`
    );
  }

  const body = [message.text?.body, message.html?.body].filter(Boolean).join('\n');
  const match = body.match(CODE_PATTERN);
  if (!match) {
    throw new Error(`Mailosaur received an email for ${email}, but no 4-8 digit code was found in the body.`);
  }

  return match[0];
}
