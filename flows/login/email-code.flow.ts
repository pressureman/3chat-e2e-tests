import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { getEmailCode } from '../../helpers/aliyun-sms';
import { fillVerificationCode, waitForVerificationCodeInput } from '../register/register-common';
import { clickFirstVisible, firstVisible, typeLikeUser } from './login-common';

export type SentEmailCode = {
  email: string;
  sentAt: number;
};

export type EmailVerificationCodeOptions = SentEmailCode & {
  env: RuntimeEnv;
};

const SEND_CODE_BUTTON_NAMES = [
  '获取验证码',
  '发送验证码',
  '验证码',
  '继续',
  '下一步',
  'Send Code',
  'Get Code',
  'Send verification code',
  'Verification Code',
  'Continue',
  'Next',
];

async function hasEmailCodeInput(page: Page, timeout = 3_000): Promise<boolean> {
  return Boolean(await waitForVerificationCodeInput(page, timeout).catch(() => null));
}

export async function sendEmailCode(page: Page, email: string): Promise<SentEmailCode> {
  const emailInput = await firstVisible([
    page.getByTestId('login-email-input'),
    page.getByLabel(/邮箱|Email/i),
    page.getByRole('textbox', { name: /邮箱|Email|Enter email/i }),
    page.getByPlaceholder(/邮箱|Email|Enter email/i),
    page.locator('input[type="email"]'),
    page.locator('input').first(),
  ], 10_000);
  await typeLikeUser(page, emailInput, email);

  const sentAt = Date.now();
  const adjacentButton = emailInput.locator('xpath=ancestor::*[(self::form or self::div or self::section) and .//input][1]//button[not(@disabled)]').last();
  await clickFirstVisible([
    page.getByTestId('login-send-code-button'),
    page.getByTestId('login-email-send-code-button'),
    ...SEND_CODE_BUTTON_NAMES.map((name) => page.getByRole('button', { name, exact: true })),
    adjacentButton,
  ], 10_000);

  if (!await hasEmailCodeInput(page)) {
    await page.keyboard.press('Enter').catch(() => undefined);
  }
  if (!await hasEmailCodeInput(page)) {
    await adjacentButton.click({ force: true, timeout: 5_000 }).catch(() => undefined);
  }
  await waitForVerificationCodeInput(page, 5_000);

  return {
    email,
    sentAt,
  };
}

export async function getEmailVerificationCode(options: EmailVerificationCodeOptions): Promise<string> {
  return getEmailCode({
    email: options.email,
    sentAt: options.sentAt,
    logConfig: options.env.smsLog,
  });
}

export async function fillEmailVerificationCode(page: Page, code: string): Promise<void> {
  await fillVerificationCode(page, code);
}
