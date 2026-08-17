import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../configs/env.cn';
import { runLocalizationCheck } from './interactions';
import type { LocalizationPageDefinition, LocalizationPageResult } from './types';

export interface RunLocalizationPageInput {
  page: Page;
  definition: LocalizationPageDefinition;
  env: RuntimeEnv;
  runDir: string;
}

export async function runLocalizationPage(input: RunLocalizationPageInput): Promise<LocalizationPageResult> {
  const startedAt = Date.now();
  const issues: LocalizationPageResult['issues'] = [];
  let checkedTextCount = 0;
  let finalUrl = '';

  try {
    const url = new URL(input.definition.path, input.env.appOrigin).toString();

    await input.page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForPageStable(input.page);
    finalUrl = input.page.url();
    await assertExpectedPageLoaded(input.page, url, input.definition.requiredText);

    for (const check of input.definition.checks) {
      const result = await runLocalizationCheck({
        page: input.page,
        check,
        expectedLocale: input.env.locale.expected,
        pageId: input.definition.id,
        runDir: input.runDir,
      });

      checkedTextCount += result.checkedTextCount;
      issues.push(...result.issues);

      if (check.type === 'click' && check.reloadAfter) {
        await input.page.goto(url, { waitUntil: 'domcontentloaded' });
        await waitForPageStable(input.page);
        finalUrl = input.page.url();
        await assertExpectedPageLoaded(input.page, url, input.definition.requiredText);
      }
    }

    return {
      pageId: input.definition.id,
      path: input.definition.path,
      url: finalUrl || input.page.url(),
      expectedLocale: input.env.locale.expected,
      status: issues.length ? 'failed' : 'passed',
      checkedTextCount,
      issues,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      pageId: input.definition.id,
      path: input.definition.path,
      url: finalUrl || input.page.url(),
      expectedLocale: input.env.locale.expected,
      status: 'error',
      checkedTextCount,
      issues,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function waitForPageStable(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function assertExpectedPageLoaded(
  page: Page,
  expectedUrl: string,
  requiredText: Array<string | RegExp> = [],
): Promise<void> {
  const expected = new URL(expectedUrl);
  const actual = new URL(page.url());
  const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';

  if (actual.origin !== expected.origin || normalizePath(actual.pathname) !== normalizePath(expected.pathname)) {
    throw new Error(`页面未停留在目标地址：expected=${expected.toString()}, actual=${actual.toString()}`);
  }

  if (!requiredText.length) return;

  const text = await collectPageText(page);
  const matched = requiredText.some((matcher) => (
    typeof matcher === 'string'
      ? text.includes(matcher)
      : matcher.test(text)
  ));

  if (!matched) {
    const sample = text || '[empty visible text]';
    throw new Error(`页面未出现预期关键文案，可能白屏或未进入目标页面。sample=${sample.slice(0, 300)}`);
  }
}

async function collectPageText(page: Page): Promise<string> {
  const texts = [await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')];
  for (const frame of page.frames().filter((frame) => frame !== page.mainFrame())) {
    texts.push(await frame.locator('body').innerText({ timeout: 1_000 }).catch(() => ''));
  }

  return texts.join(' ').replace(/\s+/g, ' ').trim();
}
