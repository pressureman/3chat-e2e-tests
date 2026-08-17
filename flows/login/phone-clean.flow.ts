import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { maskPhone } from '../../helpers/aliyun-sms';
import {
  recordRegisterPhoneSmsSent,
  waitForRegisterPhoneSmsCooldown,
} from '../../helpers/register-phone';
import { isOnboardingPage } from '../register/register-common';
import {
  firstVisible,
  getVisibleContentSummary,
  openLoginPage,
} from './login-common';
import {
  clickContinueLoginIfPrompt,
  isLoggedInPage,
} from './password-login.flow';
import {
  fillPhoneVerificationCode,
  getPhoneVerificationCode,
  sendPhoneCode,
  type SentPhoneCode,
} from './phone-code.flow';

export type PhoneCleanStatus =
  | 'authenticated'
  | 'onboarding'
  | 'account-not-found'
  | 'failed';

export type PhoneCleanFlowResult = {
  status: PhoneCleanStatus;
  sentPhoneCode: boolean;
  receivedSms: boolean;
  inputPhoneCode: boolean;
  finalUrl: string;
  failureReason?: string;
};

type PhoneCleanWaitResult = {
  status: PhoneCleanStatus;
  failureReason?: string;
};

export type PhoneCleanFlowDependencies = {
  openLoginPage: typeof openLoginPage;
  switchToPhoneLogin: (page: Page) => Promise<void>;
  waitForCooldown: typeof waitForRegisterPhoneSmsCooldown;
  sendPhoneCode: typeof sendPhoneCode;
  recordSmsSent: typeof recordRegisterPhoneSmsSent;
  getVerificationCode: typeof getPhoneVerificationCode;
  fillVerificationCode: typeof fillPhoneVerificationCode;
  clickContinuePrompt: typeof clickContinueLoginIfPrompt;
  waitForResult: (page: Page, signal?: AbortSignal) => Promise<PhoneCleanWaitResult>;
};

export type PhoneCleanFlowOptions = {
  page: Page;
  env: RuntimeEnv;
  phone: string;
  signal?: AbortSignal;
  dependencies?: Partial<PhoneCleanFlowDependencies>;
};

const ACCOUNT_NOT_FOUND_PATTERN = /账号不存在|用户不存在|账号(?:尚)?未注册|手机号(?:尚)?未注册|account does not exist|account is not registered|user not found|phone is not registered/i;
const LOGIN_FAILURE_PATTERN = /验证码.*(?:错误|无效|过期|不正确|失败)|verification code.*(?:invalid|wrong|expired|failed|incorrect)|网络.*(?:错误|失败)|network error|request failed|请求失败/i;

function sanitizeFailureReason(value: string): string {
  return value
    .replace(/\b1\d{10}\b/g, (phone) => maskPhone(phone))
    .replace(/(?<!\*)\b\d{4,8}\b/g, '[code]');
}

async function phoneLoginInputVisible(page: Page, timeout = 2_000): Promise<boolean> {
  return Boolean(await firstVisible([
    page.getByTestId('login-phone-input'),
    page.getByLabel(/手机号|手机|Phone/i),
    page.getByPlaceholder(/Enter Phone|Phone|手机号|手机/i),
    page.locator('input[type="tel"]'),
    page.locator('input[inputmode="numeric"]').first(),
  ], timeout).catch(() => null));
}

async function switchToPhoneLogin(page: Page): Promise<void> {
  if (await phoneLoginInputVisible(page)) return;

  const phonePattern = /手机|手机号|Phone|Phone Login|Login with phone|SMS|OTP|Use phone/i;
  const entry = await firstVisible([
    page.getByTestId('login-phone-tab'),
    page.getByRole('tab', { name: phonePattern }),
    page.getByRole('button', { name: phonePattern }),
    page.getByText(/手机号登录|手机验证码登录|手机号|手机|Phone Login|Login with phone|Use phone|Phone/i),
  ], 10_000);
  await entry.click();

  if (!(await phoneLoginInputVisible(page, 15_000))) {
    throw new Error('点击手机号登录入口后未进入手机号登录页面。');
  }
}

export function classifyPhoneCleanPageState(
  url: string,
  content: string,
): PhoneCleanWaitResult | undefined {
  if (ACCOUNT_NOT_FOUND_PATTERN.test(content)) {
    return { status: 'account-not-found' };
  }
  if (/app\.3chatai\.cn|app\.3chat\.ai/.test(url) && /\/butler\/on-boarding(?:[/?#]|$)/.test(url)) {
    return { status: 'onboarding' };
  }
  if (isLoggedInPage(url, content)) {
    return { status: 'authenticated' };
  }
  const failure = content.match(LOGIN_FAILURE_PATTERN)?.[0];
  if (failure) {
    return { status: 'failed', failureReason: failure };
  }
  return undefined;
}

async function waitForPhoneCleanResult(
  page: Page,
  signal?: AbortSignal,
  timeout = 75_000,
): Promise<PhoneCleanWaitResult> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return { status: 'failed', failureReason: 'SCENARIO_TIMEOUT: phone cleanup login aborted.' };
    }
    await clickContinueLoginIfPrompt(page, 500);
    const content = await getVisibleContentSummary(page, 1_500);
    const classified = classifyPhoneCleanPageState(page.url(), content);
    if (classified) return classified;
    if (isOnboardingPage(page)) return { status: 'onboarding' };
    await page.waitForTimeout(300);
  }

  return {
    status: 'failed',
    failureReason: '手机号清理登录未进入已登录或 onboarding 状态。',
  };
}

const defaultDependencies: PhoneCleanFlowDependencies = {
  openLoginPage,
  switchToPhoneLogin,
  waitForCooldown: waitForRegisterPhoneSmsCooldown,
  sendPhoneCode,
  recordSmsSent: recordRegisterPhoneSmsSent,
  getVerificationCode: getPhoneVerificationCode,
  fillVerificationCode: fillPhoneVerificationCode,
  clickContinuePrompt: clickContinueLoginIfPrompt,
  waitForResult: waitForPhoneCleanResult,
};

export async function recoverTenantCleanupByPhoneLogin(
  options: PhoneCleanFlowOptions,
): Promise<PhoneCleanFlowResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const result: PhoneCleanFlowResult = {
    status: 'failed',
    sentPhoneCode: false,
    receivedSms: false,
    inputPhoneCode: false,
    finalUrl: '',
  };

  try {
    if (options.signal?.aborted) {
      throw new Error('SCENARIO_TIMEOUT: phone cleanup login was skipped.');
    }

    await dependencies.openLoginPage(options.page, options.env);
    await dependencies.switchToPhoneLogin(options.page);
    await dependencies.waitForCooldown(options.phone, { signal: options.signal });

    const sendResult: SentPhoneCode = await dependencies.sendPhoneCode(options.page, options.phone);
    result.sentPhoneCode = true;
    await dependencies.recordSmsSent(options.phone, sendResult.sentAt);

    const code = await dependencies.getVerificationCode({
      ...sendResult,
      env: options.env,
    });
    result.receivedSms = true;

    await dependencies.fillVerificationCode(options.page, code);
    result.inputPhoneCode = true;
    await dependencies.clickContinuePrompt(options.page);

    const terminal = await dependencies.waitForResult(options.page, options.signal);
    result.status = terminal.status;
    result.failureReason = terminal.failureReason;
  } catch (error) {
    const content = await getVisibleContentSummary(options.page, 1_500).catch(() => '');
    const classified = classifyPhoneCleanPageState(options.page.url(), content);
    if (classified?.status === 'account-not-found') {
      result.status = 'account-not-found';
      result.failureReason = undefined;
    } else {
      result.status = 'failed';
      result.failureReason = sanitizeFailureReason(error instanceof Error ? error.message : String(error));
    }
  } finally {
    result.finalUrl = options.page.url() || '未确认';
  }

  return result;
}
