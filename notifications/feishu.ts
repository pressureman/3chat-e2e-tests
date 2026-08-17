import crypto from 'node:crypto';

export interface SendFeishuTextInput {
  text: string;
}

function signedPayload(content: Record<string, unknown>): Record<string, unknown> {
  const secret = process.env.FEISHU_WEBHOOK_SECRET;
  if (!secret) return content;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = crypto
    .createHmac('sha256', `${timestamp}\n${secret}`)
    .update('')
    .digest('base64');

  return {
    timestamp,
    sign,
    ...content,
  };
}

export async function sendFeishuText(input: SendFeishuTextInput): Promise<void> {
  const webhook = process.env.FEISHU_WEBHOOK_URL || process.env.FEISHU_E2E_WEBHOOK;
  if (!webhook) return;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(signedPayload({
        msg_type: 'text',
        content: {
          text: input.text,
        },
      })),
    });

    if (!response.ok) {
      console.warn(`Feishu webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.warn('Feishu webhook failed:', error);
  }
}
