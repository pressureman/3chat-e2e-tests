import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { getSmsCode } from '../../helpers/aliyun-sms';
import { fillVerificationCode, waitForVerificationCodeInput } from '../register/register-common';
import { clickFirstVisible, fillFirstVisibleLikeUser } from './login-common';

const PHONE_PREFIX = '150';
const COUNTER_FILE = path.resolve(process.cwd(), '.data', 'test-phone-counter.json');

type CounterState = {
  current: number;
};

export type SentPhoneCode = {
  phone: string;
  sentAt: number;
};

export type PhoneVerificationCodeOptions = SentPhoneCode & {
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
  'Continue',
  'Next',
];

async function readCounter(): Promise<CounterState> {
  try {
    const raw = await fs.readFile(COUNTER_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CounterState>;
    return { current: Number(parsed.current) || 0 };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new Error('No latest test phone found.');
    }
    throw error;
  }
}

function phoneFromCounter(counter: number): string {
  return `${PHONE_PREFIX}${String(counter).padStart(8, '0')}`;
}

export async function getLatestTestPhone(): Promise<string> {
  const state = await readCounter();
  if (!state.current || state.current < 1) {
    throw new Error('No latest test phone found.');
  }
  return phoneFromCounter(state.current);
}

export async function sendPhoneCode(page: Page, phone: string): Promise<SentPhoneCode> {
  await fillFirstVisibleLikeUser(page, [
    page.getByTestId('login-phone-input'),
    page.getByTestId('register-phone-input'),
    page.getByLabel(/手机号|手机|Phone/i),
    page.getByPlaceholder(/Enter Phone|Phone|手机号|手机/i),
    page.locator('input[type="tel"]'),
    page.locator('input[inputmode="numeric"]').first(),
    page.locator('input').first(),
  ], phone, 10_000);

  const sentAt = Date.now();
  await clickFirstVisible([
    page.getByTestId('login-send-code-button'),
    page.getByTestId('register-send-code-button'),
    ...SEND_CODE_BUTTON_NAMES.map((name) => page.getByRole('button', { name, exact: true })),
  ], 10_000);
  await waitForVerificationCodeInput(page, 5_000);

  return {
    phone,
    sentAt,
  };
}

export async function getPhoneVerificationCode(options: PhoneVerificationCodeOptions): Promise<string> {
  return getSmsCode({
    phone: options.phone,
    sentAt: options.sentAt,
    logConfig: options.env.smsLog,
  });
}

export async function fillPhoneVerificationCode(page: Page, code: string): Promise<void> {
  await fillVerificationCode(page, code);
}
