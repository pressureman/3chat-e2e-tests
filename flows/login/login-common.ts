import type { Locator, Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';

export async function firstVisible(locators: Locator[], timeout = 10_000): Promise<Locator> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await locator.first().isVisible().catch(() => false)) {
        return locator.first();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('No matching visible locator found.');
}

export async function clickFirstVisible(locators: Locator[], timeout?: number): Promise<void> {
  const locator = await firstVisible(locators, timeout);
  await locator.click();
}

export async function typeLikeUser(page: Page, locator: Locator, value: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  await locator.click({ force: true, timeout: 5_000 }).catch(async () => {
    await locator.evaluate((element) => (element as HTMLElement).focus());
  });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
}

export async function fillFirstVisibleLikeUser(
  page: Page,
  locators: Locator[],
  value: string,
  timeout?: number,
): Promise<void> {
  const locator = await firstVisible(locators, timeout);
  await typeLikeUser(page, locator, value);
}

export function loginPageUrl(env: RuntimeEnv): string {
  return `${env.appOrigin}/chat/login`;
}

export function isLoginPageUrl(url: string): boolean {
  return /\/chat\/login(?:[/?#]|$)|\/login(?:[/?#]|$)/.test(url);
}

export function isChromeErrorPage(page: Page): boolean {
  return page.url().startsWith('chrome-error://');
}

export async function ensureLoginPageLoaded(page: Page): Promise<void> {
  if (isChromeErrorPage(page)) {
    throw new Error(`PAGE_LOAD_ERROR: browser error page reached: ${page.url()}`);
  }

  if (!isLoginPageUrl(page.url())) {
    throw new Error(`PAGE_LOAD_ERROR: expected login page, got ${page.url()}`);
  }

  const bodyLoaded = await page.waitForFunction(() => {
    const body = document.body;
    if (!body) {
      return false;
    }
    const text = `${body.innerText || ''} ${body.textContent || ''}`.trim();
    return text.length > 0 || body.children.length > 0;
  }, undefined, { timeout: 10_000 }).then(() => true).catch(() => false);

  if (!bodyLoaded) {
    throw new Error('PAGE_LOAD_ERROR: login page body is empty.');
  }
}

export async function waitForLoginFormReady(page: Page, timeout = 20_000): Promise<void> {
  const ready = await firstVisible([
    page.getByRole('tab', { name: /Email|Phone|Password|邮箱|手机|手机号|密码/i }),
    page.getByRole('button', { name: /Email|Phone|Password|邮箱|手机|手机号|密码/i }),
    page.getByPlaceholder(/Enter Email|Enter Phone|Email|Phone|邮箱|手机号|手机|密码|Password/i),
    page.locator('input[type="email"]'),
    page.locator('input[type="password"]'),
    page.locator('input[type="tel"]'),
    page.locator('input').first(),
    page.getByRole('button', { name: /Continue|Next|Login|Log in|Sign in|继续|下一步|登录/i }),
  ], timeout).catch(() => null);

  if (!ready) {
    throw new Error('PAGE_LOAD_ERROR: login form was not ready.');
  }
}

async function waitForLoginPageReady(page: Page, timeout = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!isChromeErrorPage(page) && isLoginPageUrl(page.url())) {
      const formReady = await firstVisible([
        page.getByRole('tab', { name: /Email|Phone|Password|邮箱|手机|手机号|密码/i }),
        page.getByRole('button', { name: /Email|Phone|Password|邮箱|手机|手机号|密码/i }),
        page.getByPlaceholder(/Enter Email|Enter Phone|Email|Phone|邮箱|手机号|手机|密码|Password/i),
        page.locator('input[type="email"]'),
        page.locator('input[type="password"]'),
        page.locator('input[type="tel"]'),
        page.locator('input').first(),
        page.getByRole('button', { name: /Continue|Next|Login|Log in|Sign in|继续|下一步|登录/i }),
      ], 1_000).then(() => true).catch(() => false);

      if (formReady) {
        return true;
      }
    }
    await page.waitForTimeout(300);
  }

  return false;
}

async function visibleLoginEntries(page: Page): Promise<Locator[]> {
  const locators = [
    page.getByTestId('home-login-button'),
    page.getByRole('link', { name: /^Log in$|^Login$|^Sign in$|^登录$/i }),
    page.getByRole('button', { name: /^Log in$|^Login$|^Sign in$|^登录$/i }),
    page.locator('a,button,[role="button"]').filter({ hasText: /^Log in$|^Login$|^Sign in$|^登录$/i }),
    page.getByText(/^Log in$|^Login$|^Sign in$|^登录$/i),
  ];
  const entries: Locator[] = [];

  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 20); i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        entries.push(item);
      }
    }
  }

  return entries;
}

async function openLoginPageDirectly(page: Page, env: RuntimeEnv): Promise<void> {
  await page.goto(loginPageUrl(env), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);

  const failures: string[] = [];
  for (let reloadCount = 0; reloadCount <= 2; reloadCount += 1) {
    if (reloadCount > 0) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined);
    }

    const ready = await waitForLoginPageReady(page, 20_000);
    if (ready) return;

    failures.push([
      `reloadCount=${reloadCount}`,
      `currentUrl=${page.url() || 'unknown'}`,
      `visibleBody=${(await getVisibleContentSummary(page)).slice(0, 200)}`,
    ].join(' | '));
  }

  await ensureLoginPageLoaded(page);
  await waitForLoginFormReady(page, 20_000).catch((error) => {
    throw new Error([
      error instanceof Error ? error.message : String(error),
      'Login page did not become stable after reloading at most 2 times, 20s per attempt.',
      ...failures,
    ].join('\n'));
  });
}

export async function openLoginPage(page: Page, env: RuntimeEnv): Promise<void> {
  const failures: string[] = [];

  await page.goto(env.homeUrl, { waitUntil: 'domcontentloaded' }).catch((error) => {
    failures.push(`home-goto: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (await waitForLoginPageReady(page, 2_000)) {
    return;
  }

  const deadline = Date.now() + 15_000;
  const tried = new Set<string>();
  while (Date.now() < deadline) {
    const entries = await visibleLoginEntries(page);
    if (entries.length === 0) {
      await page.waitForTimeout(300);
      continue;
    }

    for (let i = 0; i < entries.length; i += 1) {
      const item = entries[i];
      const label = (await item.innerText().catch(() => ''))
        || (await item.getAttribute('aria-label').catch(() => ''))
        || `login-entry-${i}`;
      const key = `${label.replace(/\s+/g, ' ').trim()}#${i}`;
      if (tried.has(key)) {
        continue;
      }
      tried.add(key);

      await item.click({ timeout: 5_000 }).catch((error) => {
        failures.push(`entry-click: ${key}: ${error instanceof Error ? error.message : String(error)}`);
      });
      if (await waitForLoginPageReady(page)) {
        return;
      }

      failures.push(`entry-no-login-page: ${key}: ${page.url()}`);
      await page.goto(env.homeUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }
  }

  try {
    await openLoginPageDirectly(page, env);
  } catch (error) {
    throw new Error([
      `Failed to open login page from home or direct URL: ${error instanceof Error ? error.message : String(error)}`,
      ...failures.slice(-5),
    ].join('\n'));
  }
}

export async function getVisibleContentSummary(page: Page, limit = 500): Promise<string> {
  const content = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
  return content.replace(/\s+/g, ' ').trim().slice(0, limit) || '未确认';
}
