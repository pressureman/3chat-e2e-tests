import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { maskPhone } from '../../helpers/aliyun-sms';
import {
  firstVisible,
  getVisibleContentSummary,
  openLoginPage,
} from './login-common';
import {
  clickContinueLoginIfPrompt,
  finishOnboardingAfterLoginIfNeeded,
  isLoggedInPage,
  type LoginWaitDiagnostics,
  waitForVerificationLoginState,
} from './password-login.flow';
import {
  fillPhoneVerificationCode,
  getPhoneVerificationCode,
  sendPhoneCode,
} from './phone-code.flow';

export type PhoneLoginResult = {
  fromHome: boolean;
  foundLoginEntry: boolean;
  switchedToPhoneLogin: boolean;
  inputPhone: boolean;
  sentPhoneCode: boolean;
  receivedSms: boolean;
  extractedCode: boolean;
  inputPhoneCode: boolean;
  clickedLogin: boolean;
  success: boolean;
  afterLoginUrl: string;
  afterLoginContent: string;
  conclusion: '通过' | '失败' | '未确认' | '跳过';
  failureReason: string;
  maskedPhone: string;
  loginWaitDiagnostics?: LoginWaitDiagnostics;
};

const PHONE_LOGIN_METHOD_NAMES = [
  '手机号登录',
  '手机验证码登录',
  '手机号',
  '手机',
  'Phone',
  'Phone Login',
  'Login with phone',
  'SMS',
  'OTP',
  'Use phone',
];

function createEmptyPhoneLoginResult(): PhoneLoginResult {
  return {
    fromHome: false,
    foundLoginEntry: false,
    switchedToPhoneLogin: false,
    inputPhone: false,
    sentPhoneCode: false,
    receivedSms: false,
    extractedCode: false,
    inputPhoneCode: false,
    clickedLogin: false,
    success: false,
    afterLoginUrl: '',
    afterLoginContent: '',
    conclusion: '未确认',
    failureReason: '',
    maskedPhone: '',
  };
}

function formatLoginWaitDiagnostics(diagnostics?: LoginWaitDiagnostics): string {
  if (!diagnostics) return '';

  return [
    `waitStatus=${diagnostics.status}`,
    `elapsedMs=${diagnostics.elapsedMs}`,
    `continuePromptClicks=${diagnostics.continuePromptClicks}`,
    diagnostics.authErrorText ? `authError=${diagnostics.authErrorText}` : undefined,
    diagnostics.loginStateSignal ? `loginStateSignal=${diagnostics.loginStateSignal}` : undefined,
    `finalUrl=${diagnostics.finalUrl}`,
  ].filter(Boolean).join('; ');
}

async function isPhoneLoginVisible(page: Page): Promise<boolean> {
  const explicitPhoneInputCandidates = [
    page.getByTestId('login-phone-input'),
    page.getByTestId('register-phone-input'),
    page.getByLabel(/手机号|手机|Phone/i),
    page.getByRole('textbox', { name: /请输入手机号|手机号|手机|Phone|Enter Phone/i }),
    page.getByPlaceholder(/Enter Phone|Phone|手机号|手机/i),
    page.locator('input[type="tel"]'),
    page.locator('input[inputmode="numeric"]').first(),
  ];

  const phoneInput = await firstVisible(explicitPhoneInputCandidates, 5_000).catch(() => null);
  if (phoneInput) {
    return true;
  }

  const countryCodeVisible = await page.getByText(/\+86/).first().isVisible({ timeout: 2_000 }).catch(() => false);
  if (countryCodeVisible) {
    const numericInputVisible = await page.locator('input[inputmode="numeric"]').first().isVisible().catch(() => false);
    const textboxVisible = await page.getByRole('textbox').first().isVisible().catch(() => false);
    if (numericInputVisible || textboxVisible) return true;
  }

  const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
  if (/手机号|手机/.test(bodyText) && /\+86/.test(bodyText)) {
    return Boolean(await firstVisible([
      page.locator('input[type="tel"]'),
      page.locator('input[inputmode="numeric"]').first(),
      page.getByRole('textbox').first(),
      page.locator('input').first(),
    ], 1_000).catch(() => null));
  }

  return false;
}

async function switchToPhoneLogin(page: Page): Promise<boolean> {
  const phonePattern = /手机|手机号|Phone|Phone Login|Login with phone|SMS|OTP|Use phone/i;
  const locator = await firstVisible([
    page.getByTestId('login-phone-tab'),
    page.getByRole('tab', { name: phonePattern }),
    page.getByRole('button', { name: phonePattern }),
    page.getByText(/手机号登录|手机验证码登录|手机号|手机|Phone Login|Login with phone|Use phone|Phone/i),
  ], 10_000).catch(() => null);
  if (!locator) return false;

  await locator.click();
  return true;
}

export async function loginWithPhone(page: Page, env: RuntimeEnv, phone: string): Promise<PhoneLoginResult> {
  const result = createEmptyPhoneLoginResult();

  try {
    await openLoginPage(page, env);
    result.fromHome = true;
    result.foundLoginEntry = true;

    result.switchedToPhoneLogin = await isPhoneLoginVisible(page);
    if (!result.switchedToPhoneLogin) {
      const switched = await switchToPhoneLogin(page);
      if (!switched) {
        throw new Error('未找到手机号登录切换入口');
      }
      await page.waitForFunction(() => {
        const phoneInput = document.querySelector('[data-testid="login-phone-input"], input[type="tel"], input[placeholder*="Phone" i], input[placeholder*="手机号"], input[placeholder*="手机"]');
        return Boolean(phoneInput);
      }, undefined, { timeout: 15_000 }).catch(() => undefined);
      result.switchedToPhoneLogin = await isPhoneLoginVisible(page);
      if (!result.switchedToPhoneLogin) {
        throw new Error('点击手机号登录入口后未进入手机号登录页面');
      }
    }

    result.maskedPhone = maskPhone(phone);
    const sent = await sendPhoneCode(page, phone);
    result.inputPhone = true;
    result.sentPhoneCode = true;

    const code = await getPhoneVerificationCode({ ...sent, env });
    result.receivedSms = true;
    result.extractedCode = true;

    await fillPhoneVerificationCode(page, code);
    result.inputPhoneCode = true;
    result.clickedLogin = true;
    await clickContinueLoginIfPrompt(page);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    result.loginWaitDiagnostics = await waitForVerificationLoginState(page);
    await finishOnboardingAfterLoginIfNeeded(page);

    result.afterLoginUrl = page.url();
    result.afterLoginContent = await getVisibleContentSummary(page, 1000);
    result.success = isLoggedInPage(result.afterLoginUrl, result.afterLoginContent);
    result.conclusion = result.success ? '通过' : '失败';
    if (!result.success) {
      result.failureReason = [
        `手机号验证码登录后未进入 Builder 或明确登录后页面。currentUrl=${result.afterLoginUrl}`,
        formatLoginWaitDiagnostics(result.loginWaitDiagnostics),
      ].filter(Boolean).join('\n');
    }
  } catch (error) {
    result.failureReason = error instanceof Error ? error.message : String(error);
    result.conclusion = '失败';
    result.afterLoginUrl = page.url() || '未确认';
    result.afterLoginContent = await getVisibleContentSummary(page, 1000);
  }

  return result;
}
