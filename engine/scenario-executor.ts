import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import type { ScenarioExecutionOptions, ScenarioFn } from './runner';
import type { RunMode, ScenarioResult, Version } from '../scenarios/types';
import { notifyFeishuTenantCleanupFailure } from '../helpers/feishu';
import { maskPhone } from '../helpers/aliyun-sms';
import { resolveRegisterPhone } from '../helpers/register-phone';

export interface ScenarioExecutorMetadata {
  id?: string;
  scenario?: string;
  reportKey?: string;
}

export interface ExecuteScenarioOptions<TEnv = unknown> extends ScenarioExecutionOptions<TEnv> {
  scenarioFn: ScenarioFn<TEnv>;
  timeoutMs?: number;
  metadata?: ScenarioExecutorMetadata;
}

export const DEFAULT_SCENARIO_TIMEOUT_MS = 8 * 60_000;
const SCREENSHOT_TIMEOUT_MS = 5_000;
const ABORT_TIMEOUT_MS = 5_000;
const SCENARIO_CLEANUP_GRACE_MS = 15_000;

class ScenarioTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Scenario timed out after ${timeoutMs}ms.`);
    this.name = 'ScenarioTimeoutError';
  }
}

function resolveEnvName(env: unknown): string {
  if (typeof env === 'string') return env;
  if (!env || typeof env !== 'object') return String(env);

  const record = env as Record<string, unknown>;
  if (typeof record.label === 'string') return record.label;
  if (typeof record.name === 'string') return record.name;
  if (typeof record.env === 'string') return record.env;
  if (typeof record.version === 'string') return record.version;

  return 'unknown';
}

function envVersion(env: unknown, fallback: Version): Version {
  if (env && typeof env === 'object') {
    const version = (env as Record<string, unknown>).version;
    if (version === 'cn' || version === 'intl' || version === 'all') return version;
  }

  return fallback;
}

function normalizeScenarioId(id?: string): string {
  return id || 'scenario';
}

function fallbackScenarioName(metadata: ScenarioExecutorMetadata | undefined, fallbackFn: ScenarioFn<unknown>): string {
  if (metadata?.scenario) return metadata.scenario;

  const id = normalizeScenarioId(metadata?.id);
  if (id.startsWith('login-')) return 'login';
  if (id.startsWith('register-')) return 'register';
  if (id === 'add-space') return 'add-space';
  if (id === 'subscription-payment') return 'subscription-payment';
  if (id === 'channel') return 'channel';

  return fallbackFn.name?.replace(/Scenario$/, '') || id;
}

function fallbackReportKey(metadata: ScenarioExecutorMetadata | undefined, version: Version, scenario: string): string {
  if (metadata?.reportKey) return metadata.reportKey;

  const id = normalizeScenarioId(metadata?.id);
  const [group, variant] = id.split('-', 2);
  if ((group === 'login' || group === 'register') && variant) {
    return `${group}-${version}-${variant}`;
  }

  return id === 'scenario' ? scenario : id;
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

async function currentUrl(page?: Page): Promise<string> {
  return page?.url() || '未确认';
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

async function safeScreenshot(page: Page | undefined, runDir: string, reportKey: string): Promise<string | undefined> {
  if (!page) return undefined;

  const screenshotsDir = path.join(runDir, 'scenarios', reportKey, 'screenshots');
  const screenshotPath = path.join(screenshotsDir, 'error.png');
  try {
    await fs.mkdir(screenshotsDir, { recursive: true });
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

async function abortScenario(page?: Page, context?: BrowserContext): Promise<void> {
  await withTimeout(
    page?.close({ runBeforeUnload: false }).catch(() => undefined) || Promise.resolve(undefined),
    ABORT_TIMEOUT_MS,
    undefined,
  );
  await withTimeout(
    context?.close().catch(() => undefined) || Promise.resolve(undefined),
    ABORT_TIMEOUT_MS,
    undefined,
  );
}

function buildFailureResult(input: {
  error: unknown;
  screenshot?: string;
  durationMs: number;
  env: string;
  version: Version;
  runMode: RunMode;
  scenario: string;
  reportKey: string;
  url: string;
  timeout: boolean;
  timeoutMs: number;
}): ScenarioResult {
  const issueType = input.timeout ? 'SCENARIO_TIMEOUT' : 'SCENARIO_EXCEPTION';
  const message = [
    input.timeout
      ? `Scenario timed out after ${input.timeoutMs}ms.`
      : 'Scenario threw an exception.',
    errorMessage(input.error),
  ].join('\n');

  return {
    scenario: input.scenario,
    reportKey: input.reportKey,
    version: input.version,
    env: input.env,
    runMode: input.runMode,
    success: false,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps: [
      {
        stepId: input.timeout ? 'scenario-timeout' : 'scenario-exception',
        name: input.timeout ? 'Scenario timeout' : 'Scenario exception',
        type: 'checkpoint',
        status: 'failed',
        defaultRiskLevel: 'P0',
        finalRiskLevel: 'NONE',
        issueType,
        message,
        url: input.url,
        screenshot: input.screenshot,
        durationMs: input.durationMs,
      },
    ],
  };
}

function cleanupFailureStep(result: ScenarioResult) {
  return result.steps.find(
    (step) => step.status === 'failed'
      && step.issueType?.startsWith('TENANT_CLEANUP_'),
  );
}

function isPhoneRegisterMetadata(metadata?: ScenarioExecutorMetadata): boolean {
  const value = `${metadata?.id || ''} ${metadata?.reportKey || ''}`;
  return value.includes('register') && value.includes('phone');
}

function skippedPhoneCleanupStep(version: Version, retryCount = 0): ScenarioResult['steps'][number] {
  let phone = '-';
  if (version === 'cn' || version === 'intl') {
    phone = maskPhone(resolveRegisterPhone(version, Math.min(1, retryCount)));
  }
  return {
    stepId: 'cleanupTenant',
    name: '清理手机号注册测试租户',
    type: 'checkpoint',
    status: 'failed',
    defaultRiskLevel: 'P0',
    finalRiskLevel: 'NONE',
    issueType: 'TENANT_CLEANUP_SKIPPED_SCENARIO_TIMEOUT',
    message: 'Tenant cleanup login recovery skipped because the Scenario timed out.',
    durationMs: 0,
    metadata: {
      phone,
      registrationBusinessSuccess: false,
      cleanupStatus: 'skipped-scenario-timeout',
      cleanupAttempted: false,
      credentialSource: 'none',
      directCaptureSucceeded: false,
      loginRecoveryAttempted: false,
      tenantIdFound: false,
      cookieFound: false,
      retryAllowed: false,
    },
  };
}

async function notifyTenantCleanupFailure(
  result: ScenarioResult,
  options: ExecuteScenarioOptions<unknown>,
): Promise<void> {
  const step = cleanupFailureStep(result);
  if (!step) return;

  const metadata = step.metadata || {};
  await notifyFeishuTenantCleanupFailure({
    envLabel: result.env || resolveEnvName(options.env),
    runMode: result.runMode || options.runMode,
    reportKey: result.reportKey || result.scenario,
    phone: typeof metadata.phone === 'string' ? metadata.phone : '-',
    registrationBusinessSuccess: metadata.registrationBusinessSuccess === true,
    cleanupStatus: typeof metadata.cleanupStatus === 'string' ? metadata.cleanupStatus : 'unknown',
    credentialSource: typeof metadata.credentialSource === 'string' ? metadata.credentialSource : 'none',
    directCaptureSucceeded: metadata.directCaptureSucceeded === true,
    loginRecoveryAttempted: metadata.loginRecoveryAttempted === true,
    loginRecoveryStatus: typeof metadata.loginRecoveryStatus === 'string'
      ? metadata.loginRecoveryStatus
      : undefined,
    retryAllowed: metadata.retryAllowed === true,
    issueType: step.issueType || 'TENANT_CLEANUP_UNKNOWN',
    httpStatus: typeof metadata.httpStatus === 'number' ? metadata.httpStatus : undefined,
    tenantIdFound: metadata.tenantIdFound === true,
    cookieFound: metadata.cookieFound === true,
    retryCount: options.retryCount || 0,
    reportPath: path.join(
      options.runDir,
      'scenarios',
      result.reportKey || result.scenario,
      'report.md',
    ),
  });
}

export async function executeScenario<TEnv>(
  options: ExecuteScenarioOptions<TEnv>,
): Promise<ScenarioResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCENARIO_TIMEOUT_MS;
  const startedAt = Date.now();
  const version = envVersion(options.env, options.version);
  const scenario = fallbackScenarioName(options.metadata, options.scenarioFn as ScenarioFn<unknown>);
  const reportKey = fallbackReportKey(options.metadata, version, scenario);
  let timer: NodeJS.Timeout | undefined;
  const timeoutController = new AbortController();
  const scenarioPromise = Promise.resolve().then(() => options.scenarioFn({
    ...options,
    scenarioTimeoutSignal: timeoutController.signal,
  }));
  scenarioPromise.catch(() => undefined);

  try {
    const result = await Promise.race([
      scenarioPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ScenarioTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
    await notifyTenantCleanupFailure(result, options as ExecuteScenarioOptions<unknown>);
    return result;
  } catch (error) {
    const timeout = error instanceof ScenarioTimeoutError;
    if (timeout) timeoutController.abort();
    const durationMs = Date.now() - startedAt;
    const screenshot = await safeScreenshot(options.page, options.runDir, reportKey);
    const url = await currentUrl(options.page);

    let cleanupStep: ScenarioResult['steps'][number] | undefined;
    if (timeout) {
      await abortScenario(options.page, options.context);
      const settledResult = await withTimeout<ScenarioResult | undefined>(
        scenarioPromise,
        SCENARIO_CLEANUP_GRACE_MS,
        undefined,
      );
      cleanupStep = settledResult?.steps.find((step) => step.stepId === 'cleanupTenant');
      if (!cleanupStep && isPhoneRegisterMetadata(options.metadata)) {
        cleanupStep = skippedPhoneCleanupStep(version, options.retryCount || 0);
      }
    }

    const failureResult = buildFailureResult({
      error,
      screenshot,
      durationMs,
      env: resolveEnvName(options.env),
      version,
      runMode: options.runMode,
      scenario,
      reportKey,
      url,
      timeout,
      timeoutMs,
    });
    if (cleanupStep) {
      failureResult.steps.push(cleanupStep);
    }
    await notifyTenantCleanupFailure(
      failureResult,
      options as ExecuteScenarioOptions<unknown>,
    );
    return failureResult;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
