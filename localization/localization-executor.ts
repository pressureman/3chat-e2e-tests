import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  createLocalizationRunDir,
  createLocalizationRunId,
  writeLocalizationReport,
} from './report';
import { runLocalizationSuite, type RunLocalizationSuiteInput, type RunLocalizationSuiteResult } from './suite-runner';
import type { LocalizationPageResult } from './types';

export interface ExecuteLocalizationSuiteInput extends RunLocalizationSuiteInput {
  timeoutMs?: number;
}

const DEFAULT_LOCALIZATION_TIMEOUT_MS = 15 * 60_000;
const SCREENSHOT_TIMEOUT_MS = 5_000;
const ABORT_TIMEOUT_MS = 5_000;

class LocalizationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Localization suite timed out after ${timeoutMs}ms.`);
    this.name = 'LocalizationTimeoutError';
  }
}

function resolveLocalizationTimeoutMs(configured?: number): number {
  if (configured && Number.isFinite(configured) && configured > 0) return configured;

  const raw = process.env.E2E_LOCALIZATION_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_LOCALIZATION_TIMEOUT_MS;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCALIZATION_TIMEOUT_MS;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return [
      `${error.name}: ${error.message}`,
      error.stack,
    ].filter(Boolean).join('\n');
  }

  return String(error);
}

async function withTimeout<T>(action: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function safePageUrl(page: Page): Promise<string> {
  return page.url() || '未确认';
}

async function safeScreenshot(page: Page, runDir: string): Promise<string | undefined> {
  const screenshotPath = path.join(runDir, 'screenshots', 'error.png');
  try {
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    return await withTimeout(
      page.screenshot({ path: screenshotPath, fullPage: true, timeout: SCREENSHOT_TIMEOUT_MS })
        .then(() => screenshotPath),
      SCREENSHOT_TIMEOUT_MS + 1_000,
      undefined,
    );
  } catch {
    return undefined;
  }
}

async function abortLocalization(page: Page): Promise<void> {
  await withTimeout(
    page.close({ runBeforeUnload: false }).catch(() => undefined),
    ABORT_TIMEOUT_MS,
    undefined,
  );
}

async function writeFailedLocalizationReport(input: {
  page: Page;
  env: RunLocalizationSuiteInput['env'];
  runId: string;
  runDir: string;
  error: unknown;
  durationMs: number;
  timeout: boolean;
  timeoutMs: number;
}): Promise<RunLocalizationSuiteResult> {
  const screenshot = await safeScreenshot(input.page, input.runDir);
  const url = await safePageUrl(input.page);
  const message = [
    input.timeout
      ? `Localization suite timed out after ${input.timeoutMs}ms.`
      : 'Localization suite threw an exception.',
    errorMessage(input.error),
  ].join('\n');
  const result: LocalizationPageResult = {
    pageId: 'localization-setup',
    path: '-',
    url,
    expectedLocale: input.env.locale.expected,
    status: 'error',
    checkedTextCount: 0,
    issues: [],
    durationMs: input.durationMs,
    error: message,
  };

  if (screenshot) {
    result.issues = [{
      text: message,
      expectedLocale: input.env.locale.expected,
      pageId: result.pageId,
      url,
      trigger: { type: 'scan', target: 'localization setup' },
      screenshot,
    }];
  }

  const report = await writeLocalizationReport({
    env: input.env,
    results: [result],
    runDir: input.runDir,
    runId: input.runId,
  });

  return {
    runId: input.runId,
    runDir: input.runDir,
    report,
  };
}

export async function executeLocalizationSuite(
  input: ExecuteLocalizationSuiteInput,
): Promise<RunLocalizationSuiteResult> {
  const timeoutMs = resolveLocalizationTimeoutMs(input.timeoutMs);
  const startedAt = Date.now();
  const runId = input.runId || createLocalizationRunId(new Date(), input.env.version);
  const runDir = input.runDir || await createLocalizationRunDir(runId);
  let timer: NodeJS.Timeout | undefined;

  const suitePromise = runLocalizationSuite({
    ...input,
    runId,
    runDir,
  });
  suitePromise.catch(() => undefined);

  try {
    return await Promise.race([
      suitePromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LocalizationTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } catch (error) {
    const timeout = error instanceof LocalizationTimeoutError;
    const failure = await writeFailedLocalizationReport({
      page: input.page,
      env: input.env,
      runId,
      runDir,
      error,
      durationMs: Date.now() - startedAt,
      timeout,
      timeoutMs,
    });

    if (timeout) {
      await abortLocalization(input.page);
    }

    return failure;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
