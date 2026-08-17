import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { testAccounts, type PasswordLoginAccount } from '../../configs/test-accounts';
import { detectVersionFromUrl, type ProductVersion } from '../../helpers/url';
import {
  clickFirstVisible,
  fillFirstVisibleLikeUser,
  getVisibleContentSummary,
  openLoginPage,
} from './login-common';
import {
  clickFirstVisible as clickRegisterFirstVisible,
  completeRegistrationOnboarding,
  waitForBuilder,
} from '../register/register-common';

export { getVisibleContentSummary } from './login-common';

export type PasswordLoginResult = {
  fromHome: boolean;
  foundLoginEntry: boolean;
  switchedToPasswordLogin: boolean;
  inputAccount: boolean;
  inputPassword: boolean;
  clickedLogin: boolean;
  success: boolean;
  afterLoginUrl: string;
  afterLoginContent: string;
  version: ProductVersion;
  conclusion: '通过' | '失败' | '未确认' | '跳过';
  failureReason: string;
};

export function createEmptyLoginResult(): PasswordLoginResult {
  return {
    fromHome: false,
    foundLoginEntry: false,
    switchedToPasswordLogin: false,
    inputAccount: false,
    inputPassword: false,
    clickedLogin: false,
    success: false,
    afterLoginUrl: '',
    afterLoginContent: '',
    version: '未确认',
    conclusion: '未确认',
    failureReason: '',
  };
}

export async function clickContinueLoginIfPrompt(page: Page, promptTimeout = 8_000): Promise<boolean> {
  const prompt = page.getByText(/该用户已在其他.*WEB.*终端登录|是否继续登录|already.*logged/i);
  if (!(await prompt.first().isVisible({ timeout: promptTimeout }).catch(() => false))) {
    return false;
  }

  const modal = page.locator('.ant-modal:visible, [role="dialog"]:visible, [class*="modal"]:visible')
    .filter({ hasText: /该用户已在其他.*WEB.*终端登录|是否继续登录|already.*logged/i })
    .first();

  const modalConfirmButton = modal.locator('button').filter({ hasText: /^确认$|^确定$|Continue|Confirm/i }).last();
  if (await modalConfirmButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await modalConfirmButton.click({ force: true });
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    if (!(await prompt.first().isVisible().catch(() => false))) return true;
  }

  const primaryButton = page.locator('.ant-modal-confirm .ant-btn-primary, .ant-modal .ant-btn-primary').last();
  if (await primaryButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await primaryButton.click({ force: true });
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    if (!(await prompt.first().isVisible().catch(() => false))) return true;
  }

  const confirmText = page.getByText(/^确认$|^确定$|Continue|Confirm/i).last();
  const box = await confirmText.boundingBox({ timeout: 5_000 }).catch(() => null);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    if (!(await prompt.first().isVisible().catch(() => false))) return true;
  }

  const clickedByDom = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(element as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((element) => isVisible(element))
      .filter((element) => /^(确认|确定|Continue|Confirm)$/.test((element.textContent || '').trim()));
    const primary = Array.from(document.querySelectorAll('.ant-modal-confirm .ant-btn-primary, .ant-modal .ant-btn-primary'))
      .filter((element) => isVisible(element));
    const target = (primary[primary.length - 1] || buttons[buttons.length - 1]) as HTMLElement | undefined;
    if (!target) return false;
    target.click();
    return true;
  }).catch(() => false);
  if (clickedByDom) {
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    if (!(await prompt.first().isVisible().catch(() => false))) return true;
  }

  await page.keyboard.press('Enter').catch(() => undefined);
  await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  return !(await prompt.first().isVisible().catch(() => false));
}

export type LoginWaitDiagnostics = {
  status: 'logged-in' | 'onboarding' | 'timeout';
  finalUrl: string;
  finalContent: string;
  elapsedMs: number;
  continuePromptClicks: number;
  authErrorText?: string;
  loginStateSignal?: string;
};

export async function waitForLoggedInState(page: Page, timeout = 45_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await clickContinueLoginIfPrompt(page);
    const currentUrl = page.url();
    const currentContent = await getVisibleContentSummary(page, 1000);
    const loggedIn = isLoggedInPage(currentUrl, currentContent) || isOnboardingPage(currentUrl);
    if (loggedIn) break;
    await page.waitForTimeout(500);
  }
}

function visibleAuthError(content: string): string | undefined {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const match = normalized.match(
    /(?:验证码(?:错误|已过期|无效|超时|已超过[^。.!?]*)|当前手机号一天内验证码已超过[^。.!?]*|You have exceeded the daily email limit|verification code (?:is )?(?:invalid|expired)|too many verification|daily email limit|rate limit[^。.!?]*)/i,
  );
  return match?.[0];
}

async function loginStateSignal(page: Page): Promise<string | undefined> {
  const storageSignal = await page.evaluate(() => {
    const keyPattern = /token|auth|session|user|login/i;
    const valuePattern = /token|bearer|jwt|user|session/i;
    const storageAreas = [
      ['localStorage', window.localStorage],
      ['sessionStorage', window.sessionStorage],
    ] as const;

    for (const [storageName, storage] of storageAreas) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) || '';
        const value = storage.getItem(key) || '';
        if (keyPattern.test(key) || valuePattern.test(value)) {
          return `${storageName}:${key}`;
        }
      }
    }

    return undefined;
  }).catch(() => undefined);
  if (storageSignal) return storageSignal;

  const cookies = await page.context().cookies(page.url()).catch(() => []);
  const cookie = cookies.find((item) => /token|auth|session|user|login/i.test(item.name));
  return cookie ? `cookie:${cookie.name}` : undefined;
}

export async function waitForVerificationLoginState(page: Page, timeout = 75_000): Promise<LoginWaitDiagnostics> {
  const startedAt = Date.now();
  const deadline = startedAt + timeout;
  let continuePromptClicks = 0;
  let lastContent = '';
  let authErrorText: string | undefined;
  let signal: string | undefined;

  while (Date.now() < deadline) {
    if (await clickContinueLoginIfPrompt(page, 500)) {
      continuePromptClicks += 1;
    }

    const currentUrl = page.url();
    lastContent = await getVisibleContentSummary(page, 1000);
    authErrorText = visibleAuthError(lastContent) || authErrorText;
    signal = await loginStateSignal(page) || signal;

    if (isLoggedInPage(currentUrl, lastContent)) {
      return {
        status: 'logged-in',
        finalUrl: currentUrl,
        finalContent: lastContent,
        elapsedMs: Date.now() - startedAt,
        continuePromptClicks,
        authErrorText,
        loginStateSignal: signal,
      };
    }

    if (isOnboardingPage(currentUrl)) {
      return {
        status: 'onboarding',
        finalUrl: currentUrl,
        finalContent: lastContent,
        elapsedMs: Date.now() - startedAt,
        continuePromptClicks,
        authErrorText,
        loginStateSignal: signal,
      };
    }

    await page.waitForTimeout(500);
  }

  return {
    status: 'timeout',
    finalUrl: page.url(),
    finalContent: lastContent || await getVisibleContentSummary(page, 1000),
    elapsedMs: Date.now() - startedAt,
    continuePromptClicks,
    authErrorText,
    loginStateSignal: signal,
  };
}

export function isLoggedInPage(url: string, content: string): boolean {
  return (/app\.3chatai\.cn|app\.3chat\.ai/.test(url) && /\/butler\/agent\/builder(?:[/?#]|$)/.test(url))
    || /工作台|首页|侧边栏|搭建助手|Builder|Assistant|助手配置/.test(content);
}

function isOnboardingPage(url: string): boolean {
  return /app\.3chatai\.cn|app\.3chat\.ai/.test(url) && /\/butler\/on-boarding(?:[/?#]|$)/.test(url);
}

async function clickWelcomePrimaryAction(page: Page): Promise<void> {
  await clickRegisterFirstVisible([
    page.getByTestId('welcome-start-experience-button'),
    page.getByTestId('welcome-start-build-button'),
    page.getByRole('button', { name: /立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build now|Get started|Experience|Continue/i }),
    page.getByText(/立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build now|Get started|Experience|Continue/i),
  ], 5_000).catch(() => undefined);
}

export async function finishOnboardingAfterLoginIfNeeded(page: Page): Promise<void> {
  if (!isOnboardingPage(page.url())) {
    return;
  }

  await completeRegistrationOnboarding(page, {
    contactName: 'E2ETest',
    workspaceName: process.env.E2E_WORKSPACE_NAME || 'E2ETest',
    phone: process.env.E2E_CONTACT_PHONE || '15000000001',
  });
  await clickWelcomePrimaryAction(page);
  if (!await waitForBuilder(page, 60_000)) {
    throw new Error(`登录后 onboarding 已提交，但未进入 Builder。currentUrl=${page.url()}`);
  }
}

export async function loginWithPassword(
  page: Page,
  env: RuntimeEnv,
  account: PasswordLoginAccount = testAccounts.passwordLogin[env.version],
): Promise<PasswordLoginResult> {
  const result = createEmptyLoginResult();

  if (!account.email || !account.password) {
    result.conclusion = '跳过';
    result.failureReason = '跳过：缺少账号配置';
    return result;
  }

  try {
    await openLoginPage(page, env);
    result.fromHome = true;
    result.foundLoginEntry = true;

    await clickFirstVisible([
      page.getByRole('tab', { name: /账号密码|密码|Password/i }),
      page.getByRole('button', { name: /账号密码|密码|Password/i }),
      page.getByText(/账号密码登录|账号密码|密码登录|Password/i),
    ], 8_000).catch(() => undefined);
    result.switchedToPasswordLogin = true;

    await fillFirstVisibleLikeUser(page, [
      page.getByLabel(/邮箱|账号|Email|Account/i),
      page.getByPlaceholder(/邮箱|账号|Email|Account/i),
      page.locator('input[type="email"]'),
      page.locator('input').first(),
    ], account.email, 10_000);
    result.inputAccount = true;

    await fillFirstVisibleLikeUser(page, [
      page.getByLabel(/密码|Password/i),
      page.getByPlaceholder(/密码|Password/i),
      page.locator('input[type="password"]'),
      page.locator('input').filter({ hasNotText: /./ }).nth(1),
    ], account.password, 10_000);
    result.inputPassword = true;

    await clickFirstVisible([
      page.getByRole('button', { name: /^登录$|登录|Log in|Login|Sign in/i }),
      page.getByText(/^登录$|登录|Log in|Login|Sign in/i),
    ], 10_000);
    result.clickedLogin = true;

    await clickContinueLoginIfPrompt(page);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await waitForLoggedInState(page);
    await finishOnboardingAfterLoginIfNeeded(page);

    result.afterLoginUrl = page.url();
    result.afterLoginContent = await getVisibleContentSummary(page, 1000);
    result.version = detectVersionFromUrl(result.afterLoginUrl, result.afterLoginContent);
    result.success = isLoggedInPage(result.afterLoginUrl, result.afterLoginContent);
    result.conclusion = result.success ? '通过' : '失败';
    if (!result.success) {
      result.failureReason = `登录后未进入 Builder 或明确登录后页面。currentUrl=${result.afterLoginUrl}`;
    }
  } catch (error) {
    result.failureReason = error instanceof Error ? error.message : String(error);
    result.conclusion = '失败';
    result.afterLoginUrl = page.url() || '未确认';
    result.afterLoginContent = await getVisibleContentSummary(page, 1000);
    result.version = detectVersionFromUrl(result.afterLoginUrl, result.afterLoginContent);
  }

  return result;
}
