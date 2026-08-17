import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { RuntimeEnv } from '../configs/env.cn';
import { checkLocalization } from './checker';
import { collectVisibleText, diffCandidates } from './text-collector';
import type {
  ExpectedLocale,
  LocalizationCheckDefinition,
  LocalizationCheckResult,
  LocalizationIssue,
  LocalizationPageResult,
} from './types';

export interface RunLocalizationCheckInput {
  page: Page;
  check: LocalizationCheckDefinition;
  expectedLocale: ExpectedLocale;
  pageId: string;
  runDir: string;
}

export async function runLocalizationCheck(input: RunLocalizationCheckInput): Promise<LocalizationCheckResult> {
  switch (input.check.type) {
    case 'scan':
      return runScanCheck(input);
    case 'hover':
      return runHoverCheck(input);
    case 'click':
      return runClickCheck(input);
    case 'scroll':
      return runScrollCheck(input);
  }
}

export async function checkHomeAvatarMenuLocalization(input: {
  page: Page;
  env: RuntimeEnv;
  runDir: string;
}): Promise<LocalizationPageResult> {
  const startedAt = Date.now();
  const pageId = 'home-avatar-menu';
  const path = '/';

  try {
    await waitForUiStable(input.page);
    const before = await collectVisibleText(input.page);
    const avatar = await findTopRightAvatar(input.page);
    await avatar.hover({ timeout: 5_000 });
    await waitForAvatarMenu(input.page, 8_000);
    await waitForUiStable(input.page);

    const after = await collectVisibleText(input.page);
    const checkResult = await checkAndScreenshot({
      page: input.page,
      check: { type: 'hover', target: pageId },
      expectedLocale: input.env.locale.expected,
      pageId,
      runDir: input.runDir,
      candidates: diffCandidates(after, before),
      trigger: { type: 'hover', target: pageId },
    });

    await closeFloatingMenu(input.page);

    return {
      pageId,
      path,
      url: input.page.url(),
      expectedLocale: input.env.locale.expected,
      status: checkResult.issues.length ? 'failed' : 'passed',
      checkedTextCount: checkResult.checkedTextCount,
      issues: checkResult.issues,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    await closeFloatingMenu(input.page);

    return {
      pageId,
      path,
      url: input.page.url(),
      expectedLocale: input.env.locale.expected,
      status: 'error',
      checkedTextCount: 0,
      issues: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runScanCheck(input: RunLocalizationCheckInput): Promise<LocalizationCheckResult> {
  const candidates = await collectVisibleText(input.page);
  return checkAndScreenshot({
    ...input,
    candidates,
    trigger: { type: 'scan' },
  });
}

async function findTopRightAvatar(page: Page): Promise<Locator> {
  return firstVisible([
    page.getByTestId('user-avatar'),
    page.getByTestId('header-user-avatar'),
    page.getByTestId('account-menu-button'),
    page
      .getByRole('navigation')
      .filter({ has: page.getByRole('button', { name: /订阅提醒|Subscription/i }) })
      .last()
      .getByRole('button')
      .last(),
    page.getByRole('button', { name: /账号|头像|个人|Profile|Account|User/i }),
  ], 15_000);
}

async function waitForAvatarMenu(page: Page, timeout: number): Promise<void> {
  await firstVisible([
    page
      .getByRole('menu')
      .getByText(/切换空间|个人中心|操作日志|隐私协议|退出登录|Switch workspace|Personal|Log out/i),
    page.getByText(/切换空间|个人中心|操作日志|隐私协议|退出登录|Switch workspace|Personal|Log out/i),
  ], timeout);
}

async function firstVisible(locators: Locator[], timeout: number): Promise<Locator> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    for (const locator of locators) {
      try {
        const count = await locator.count();
        for (let index = 0; index < count; index += 1) {
          const candidate = locator.nth(index);
          if (await candidate.isVisible({ timeout: 300 }).catch(() => false)) {
            return candidate;
          }
        }
      } catch (error) {
        lastError = error;
      }
    }

    await locators[0]?.page().waitForTimeout(250);
  }

  const message = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`No visible avatar menu locator matched within ${timeout}ms.${message}`);
}

async function closeFloatingMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.mouse.move(0, 0).catch(() => undefined);
}

async function runHoverCheck(input: RunLocalizationCheckInput): Promise<LocalizationCheckResult> {
  if (input.check.type !== 'hover') throw new Error('Invalid hover check input.');

  const before = await collectVisibleText(input.page);
  await input.page.locator(input.check.target).first().hover({ timeout: 10_000 });
  await waitForUiStable(input.page);
  const after = await collectVisibleText(input.page);

  return checkAndScreenshot({
    ...input,
    candidates: diffCandidates(after, before),
    trigger: { type: 'hover', target: input.check.target },
  });
}

async function runClickCheck(input: RunLocalizationCheckInput): Promise<LocalizationCheckResult> {
  if (input.check.type !== 'click') throw new Error('Invalid click check input.');

  const before = await collectVisibleText(input.page);
  await input.page.locator(input.check.target).first().click({ timeout: 10_000 });
  await waitForUiStable(input.page);
  const after = await collectVisibleText(input.page);

  return checkAndScreenshot({
    ...input,
    candidates: diffCandidates(after, before),
    trigger: { type: 'click', target: input.check.target },
  });
}

async function runScrollCheck(input: RunLocalizationCheckInput): Promise<LocalizationCheckResult> {
  if (input.check.type !== 'scroll') throw new Error('Invalid scroll check input.');

  let previous = await collectVisibleText(input.page);
  let checkedTextCount = 0;
  const issues: LocalizationIssue[] = [];

  for (const position of input.check.positions) {
    await input.page.evaluate((scrollPosition) => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: maxScroll * scrollPosition, behavior: 'auto' });
    }, position);
    await waitForUiStable(input.page);

    const current = await collectVisibleText(input.page);
    const result = await checkAndScreenshot({
      ...input,
      candidates: diffCandidates(current, previous),
      trigger: { type: 'scroll', target: String(position) },
    });

    checkedTextCount += result.checkedTextCount;
    issues.push(...result.issues);
    previous = current;
  }

  return { checkedTextCount, issues };
}

async function checkAndScreenshot(input: RunLocalizationCheckInput & {
  candidates: Awaited<ReturnType<typeof collectVisibleText>>;
  trigger: LocalizationIssue['trigger'];
}): Promise<LocalizationCheckResult> {
  const result = checkLocalization({
    candidates: input.candidates,
    expectedLocale: input.expectedLocale,
    pageId: input.pageId,
    url: input.page.url(),
    trigger: input.trigger,
  });

  if (!result.issues.length) return result;

  const screenshot = await saveCheckScreenshot(input.page, input.runDir, input.pageId, input.trigger);
  return {
    ...result,
    issues: result.issues.map((issue) => ({ ...issue, screenshot })),
  };
}

async function saveCheckScreenshot(
  page: Page,
  runDir: string,
  pageId: string,
  trigger: LocalizationIssue['trigger'],
): Promise<string> {
  const screenshotsDir = path.join(runDir, 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });

  const target = trigger.target ? `-${slugify(trigger.target)}` : '';
  const screenshotPath = path.join(screenshotsDir, `${slugify(pageId)}-${trigger.type}${target}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

function slugify(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

async function waitForUiStable(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}
