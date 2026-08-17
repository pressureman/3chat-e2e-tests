import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { maskEmail } from '../../helpers/aliyun-sms';
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
  fillEmailVerificationCode,
  getEmailVerificationCode,
  sendEmailCode,
} from './email-code.flow';

export type EmailLoginResult = {
  fromHome: boolean;
  foundLoginEntry: boolean;
  switchedToEmailLogin: boolean;
  inputEmail: boolean;
  sentEmailCode: boolean;
  receivedEmail: boolean;
  extractedCode: boolean;
  inputEmailCode: boolean;
  clickedLogin: boolean;
  success: boolean;
  afterLoginUrl: string;
  afterLoginContent: string;
  conclusion: '通过' | '失败' | '未确认' | '跳过';
  failureReason: string;
  maskedEmail: string;
  loginWaitDiagnostics?: LoginWaitDiagnostics;
};

function createEmptyEmailLoginResult(): EmailLoginResult {
  return {
    fromHome: false,
    foundLoginEntry: false,
    switchedToEmailLogin: false,
    inputEmail: false,
    sentEmailCode: false,
    receivedEmail: false,
    extractedCode: false,
    inputEmailCode: false,
    clickedLogin: false,
    success: false,
    afterLoginUrl: '',
    afterLoginContent: '',
    conclusion: '未确认',
    failureReason: '',
    maskedEmail: '',
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

async function isEmailLoginVisible(page: Page): Promise<boolean> {
  const emailInput = await firstVisible([
    page.getByTestId('login-email-input'),
    page.getByLabel(/邮箱|Email/i),
    page.getByRole('textbox', { name: /邮箱|Email|Enter email/i }),
    page.getByPlaceholder(/邮箱|Email|Enter email/i),
    page.locator('input[type="email"]'),
  ], 5_000).catch(() => null);
  if (!emailInput) return false;

  const passwordVisible = await firstVisible([
    page.getByLabel(/密码|Password/i),
    page.getByPlaceholder(/密码|Password/i),
    page.locator('input[type="password"]'),
  ], 500).catch(() => null);
  if (passwordVisible) return false;

  const sendCodeVisible = await firstVisible([
    page.getByTestId('login-send-code-button'),
    page.getByTestId('login-email-send-code-button'),
    page.getByRole('button', { name: /获取验证码|发送验证码|验证码|继续|下一步|Send Code|Get Code|Send verification code|Verification Code|Continue|Next/i }),
    page.getByText(/验证码|Verification Code|Send Code|Get Code/i),
  ], 2_000).catch(() => null);
  return Boolean(sendCodeVisible);
}

async function switchToEmailLogin(page: Page): Promise<boolean> {
  const emailPattern = /邮箱|邮箱登录|邮箱验证码|Email|Email Login|Login with email|Sign in with email|Email code|Email verification|Verification code/i;
  const locator = await firstVisible([
    page.getByTestId('login-email-tab'),
    page.getByRole('tab', { name: emailPattern }),
    page.getByRole('button', { name: emailPattern }),
    page.getByText(emailPattern),
  ], 10_000).catch(() => null);
  if (!locator) return false;

  await locator.click();
  return true;
}

export async function loginWithEmail(page: Page, env: RuntimeEnv, email: string): Promise<EmailLoginResult> {
  const result = createEmptyEmailLoginResult();

  try {
    await openLoginPage(page, env);
    result.fromHome = true;
    result.foundLoginEntry = true;

    result.switchedToEmailLogin = await isEmailLoginVisible(page);
    if (!result.switchedToEmailLogin) {
      const switched = await switchToEmailLogin(page);
      if (!switched) {
        throw new Error('未找到邮箱登录切换入口');
      }
      result.switchedToEmailLogin = await isEmailLoginVisible(page);
      if (!result.switchedToEmailLogin) {
        throw new Error('点击邮箱登录入口后未进入邮箱验证码登录页面');
      }
    }

    result.maskedEmail = maskEmail(email);
    const sent = await sendEmailCode(page, email);
    result.inputEmail = true;
    result.sentEmailCode = true;

    const code = await getEmailVerificationCode({ ...sent, env });
    result.receivedEmail = true;
    result.extractedCode = true;

    await fillEmailVerificationCode(page, code);
    result.inputEmailCode = true;
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
        `邮箱验证码登录后未进入 Builder 或明确登录后页面。currentUrl=${result.afterLoginUrl}`,
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
