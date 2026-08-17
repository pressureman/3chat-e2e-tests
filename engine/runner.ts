import { test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { ProgressEvent } from '../tests/_progress';
import fs from 'node:fs/promises';
import path from 'node:path';
import { notifyFeishuE2eResult } from '../helpers/feishu';
import type { RunMode, RunResult, ScenarioResult, Version } from '../scenarios/types';
import { createRunReportDir, prepareArtifactsDirs, writeRunSummary, writeScenarioReport } from './report-engine';
import { evaluateStepRisk, summarizeRunRisk, summarizeScenarioRisk } from './risk-engine';
import { executeScenario, type ScenarioExecutorMetadata } from './scenario-executor';

export interface ScenarioExecutionOptions<TEnv = unknown> {
  page?: Page;
  context?: BrowserContext;
  browser?: Browser;
  env: TEnv;
  version: Version;
  runMode: RunMode;
  runDir: string;
  retryCount?: number;
  scenarioTimeoutSignal?: AbortSignal;
}

export type ScenarioFn<TEnv = unknown> = (
  options: ScenarioExecutionOptions<TEnv>,
) => Promise<ScenarioResult>;

export interface ScenarioSuiteEntry<TEnv = unknown> extends ScenarioExecutorMetadata {
  run: ScenarioFn<TEnv>;
}

export type ScenarioSuiteInput<TEnv = unknown> = ScenarioFn<TEnv> | ScenarioSuiteEntry<TEnv>;

export interface RunScenarioOptions<TEnv = unknown> extends ScenarioExecutionOptions<TEnv> {
  notifyScenarioResults?: boolean;
  scenarioTimeoutMs?: number;
  metadata?: ScenarioExecutorMetadata;
}

export interface RunScenarioSuiteOptions<TEnv = unknown> {
  scenarios: ScenarioSuiteInput<TEnv>[];
  page?: Page;
  context?: BrowserContext;
  browser?: Browser;
  env: TEnv;
  version: Version;
  runMode: RunMode;
  timestamp?: string;
  baseDir?: string;
  onProgress?: (event: ProgressEvent) => void;
  isolateScenarios?: boolean;
  notifyScenarioResults?: boolean;
  scenarioTimeoutMs?: number;
  scenarioRetries?: number;
}

function formatRunTimestamp(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
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

const riskRank: Record<string, number> = {
  NONE: 0,
  P3: 1,
  P2: 2,
  P1: 3,
  P0: 4,
};

function scenarioDurationMs(result: ScenarioResult): number {
  return result.steps.reduce((total, step) => total + step.durationMs, 0);
}

function failedStepsForFeishu(result: ScenarioResult) {
  return result.steps
    .filter((step) => step.status === 'failed')
    .sort((left, right) => {
      const leftRisk = riskRank[left.finalRiskLevel] || riskRank[left.defaultRiskLevel] || 0;
      const rightRisk = riskRank[right.finalRiskLevel] || riskRank[right.defaultRiskLevel] || 0;
      return rightRisk - leftRisk;
    })
    .slice(0, 5)
    .map((step) => ({
      stepId: step.stepId,
      stepName: step.name,
      riskLevel: step.finalRiskLevel === 'NONE' ? step.defaultRiskLevel : step.finalRiskLevel,
      message: step.message || step.issueType,
      url: step.url,
    }));
}

function stringMetadataValue(result: ScenarioResult, key: string): string | undefined {
  for (const step of result.steps) {
    const value = step.metadata?.[key];
    if (typeof value === 'string' && value) return value;
  }

  return undefined;
}

function scenarioMethodForFeishu(result: ScenarioResult): {
  method?: string;
  loginMethod?: string;
  registerType?: string;
} {
  const loginMethod = stringMetadataValue(result, 'loginMethod');
  const registerType = stringMetadataValue(result, 'registerType');

  return {
    method: loginMethod || registerType,
    loginMethod,
    registerType,
  };
}

function scenarioReportKey(result: ScenarioResult): string {
  return result.reportKey || result.scenario;
}

function resolveScenarioTimeoutMs(configured?: number): number | undefined {
  if (configured && Number.isFinite(configured) && configured > 0) return configured;

  const raw = process.env.E2E_SCENARIO_TIMEOUT_MS?.trim();
  if (!raw) return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveScenarioRetries(configured?: number): number {
  if (configured !== undefined && Number.isFinite(configured) && configured >= 0) {
    return Math.floor(configured);
  }

  const raw = process.env.E2E_SCENARIO_RETRIES?.trim();
  if (!raw) return 1;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 1;
}

export function hasTenantCleanupFailure(result: ScenarioResult): boolean {
  return result.steps.some(
    (step) => step.status === 'failed'
      && step.issueType?.startsWith('TENANT_CLEANUP_'),
  );
}

export function isPhoneRegisterScenarioTimeout(result: ScenarioResult): boolean {
  const reportKey = result.reportKey || '';
  return reportKey.includes('register')
    && reportKey.includes('phone')
    && result.steps.some((step) => step.issueType === 'SCENARIO_TIMEOUT');
}

async function closeContextSafely(context?: BrowserContext): Promise<void> {
  if (!context) return;

  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    context.close().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 5_000);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

type RetryFailureRecord = {
  message: string;
  runDir: string;
  retry: number;
  cleanupMetadata?: Record<string, unknown>;
};

const RETRY_CLEANUP_METADATA_KEYS = [
  'phone',
  'registrationBusinessSuccess',
  'cleanupStatus',
  'cleanupAttempted',
  'credentialSource',
  'directCaptureSucceeded',
  'loginRecoveryAttempted',
  'loginRecoveryStatus',
  'tenantIdFound',
  'cookieFound',
  'httpStatus',
  'retryAllowed',
] as const;

function retryCleanupMetadata(result: ScenarioResult): Record<string, unknown> | undefined {
  const metadata = result.steps.find((step) => step.stepId === 'cleanupTenant')?.metadata;
  if (!metadata) return undefined;

  return Object.fromEntries(
    RETRY_CLEANUP_METADATA_KEYS
      .filter((key) => metadata[key] !== undefined)
      .map((key) => [key, metadata[key]]),
  );
}

function attachFirstAttemptCleanup(
  result: ScenarioResult,
  record?: RetryFailureRecord,
): ScenarioResult {
  if (!record?.cleanupMetadata) return result;

  return {
    ...result,
    steps: result.steps.map((step) => step.stepId === 'cleanupTenant'
      ? {
        ...step,
        metadata: {
          ...step.metadata,
          firstAttemptCleanup: record.cleanupMetadata,
        },
      }
      : step),
  };
}

function currentPlaywrightRetry(): number {
  try {
    return test.info().retry || 0;
  } catch {
    return 0;
  }
}

function currentPlaywrightTestId(): string | undefined {
  try {
    return test.info().testId;
  } catch {
    return undefined;
  }
}

function safeRetryKey(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 180);
}

function retryRecordPath(result: ScenarioResult, options: RunScenarioOptions<unknown>): string {
  const keyParts = [
    currentPlaywrightTestId(),
    result.scenario,
    result.reportKey,
    result.version || options.version,
    result.env || resolveEnvName(options.env),
    result.runMode || options.runMode,
  ].filter(Boolean);

  return path.join(
    process.cwd(),
    '.data',
    'flaky-retries',
    `${safeRetryKey(keyParts.join('__'))}.json`,
  );
}

function firstFailureMessage(result: ScenarioResult): string {
  const failedStep = result.steps.find((step) => step.status === 'failed');
  if (!failedStep) return 'Scenario failed before a failed step was recorded.';

  return [
    failedStep.message || failedStep.issueType || 'Step failed.',
    failedStep.url ? `URL: ${failedStep.url}` : undefined,
    `stepId: ${failedStep.stepId}`,
  ].filter(Boolean).join('\n');
}

async function writeRetryFailureRecord(
  result: ScenarioResult,
  options: RunScenarioOptions<unknown>,
  retry: number,
): Promise<void> {
  const recordPath = retryRecordPath(result, options);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, JSON.stringify({
    message: firstFailureMessage(result),
    runDir: options.runDir,
    retry,
    cleanupMetadata: retryCleanupMetadata(result),
  }, null, 2), 'utf8');
}

async function readRetryFailureRecord(
  result: ScenarioResult,
  options: RunScenarioOptions<unknown>,
): Promise<RetryFailureRecord | undefined> {
  const recordPath = retryRecordPath(result, options);
  try {
    return JSON.parse(await fs.readFile(recordPath, 'utf8')) as RetryFailureRecord;
  } catch {
    return undefined;
  }
}

async function clearRetryFailureRecord(
  result: ScenarioResult,
  options: RunScenarioOptions<unknown>,
): Promise<void> {
  await fs.unlink(retryRecordPath(result, options)).catch(() => undefined);
}

async function notifyScenarioResult(result: ScenarioResult, options: RunScenarioOptions<unknown>, scenarioStartedAt: Date): Promise<void> {
  const scenarioMethod = scenarioMethodForFeishu(result);
  await notifyFeishuE2eResult({
    scenario: scenarioReportKey(result),
    version: result.version,
    envLabel: result.env,
    runMode: result.runMode,
    status: result.success ? 'passed' : 'failed',
    executedAt: scenarioStartedAt.toISOString(),
    method: scenarioMethod.method,
    loginMethod: scenarioMethod.loginMethod,
    registerType: scenarioMethod.registerType,
    durationMs: scenarioDurationMs(result),
    reportPath: path.join(options.runDir, 'scenarios', scenarioReportKey(result), 'report.md'),
    failedSteps: failedStepsForFeishu(result),
  });
}

export async function runScenario<TEnv>(
  scenarioFn: ScenarioFn<TEnv>,
  options: RunScenarioOptions<TEnv>,
): Promise<ScenarioResult> {
  const scenarioStartedAt = new Date();
  const retryCount = options.retryCount ?? currentPlaywrightRetry();
  const rawResult = await executeScenario({
    ...options,
    scenarioFn,
    retryCount,
    timeoutMs: resolveScenarioTimeoutMs(options.scenarioTimeoutMs),
    metadata: options.metadata,
  });
  const envName = rawResult.env || resolveEnvName(options.env);
  const runMode = rawResult.runMode || options.runMode;

  const steps = rawResult.steps.map((step) => {
    const finalRiskLevel = step.status === 'failed'
      ? evaluateStepRisk({
        scenario: rawResult.scenario,
        stepId: step.stepId,
        stepType: step.type,
        defaultRiskLevel: step.defaultRiskLevel,
        issueType: step.issueType,
        env: envName,
        runMode,
        retryPassed: (step as typeof step & { retryPassed?: boolean }).retryPassed,
      })
      : 'NONE';

    return {
      ...step,
      finalRiskLevel,
    };
  });

  const resultWithStepRisk: ScenarioResult = {
    ...rawResult,
    env: envName,
    version: rawResult.version || options.version,
    runMode,
    steps,
  };
  const riskSummary = summarizeScenarioRisk(resultWithStepRisk);
  let result: ScenarioResult = {
    ...resultWithStepRisk,
    ...riskSummary,
    retryCount,
  };
  if (!result.success) {
    if (retryCount === 0) {
      await writeRetryFailureRecord(result, options, retryCount);
    } else {
      const firstFailure = await readRetryFailureRecord(result, options);
      if (firstFailure) {
        result = attachFirstAttemptCleanup({
          ...result,
          firstFailureMessage: firstFailure.message,
        }, firstFailure);
      }
      await clearRetryFailureRecord(result, options);
    }
  } else if (retryCount > 0) {
    const firstFailure = await readRetryFailureRecord(result, options);
    if (firstFailure) {
      result = attachFirstAttemptCleanup({
        ...result,
        flaky: true,
        retryCount,
        firstFailureMessage: firstFailure.message,
        steps: result.steps.map((step) => ({
          ...step,
          retryPassed: true,
        })),
      }, firstFailure);
      await clearRetryFailureRecord(result, options);
    }
  }

  await writeScenarioReport(result, { runDir: options.runDir });
  if (options.notifyScenarioResults !== false) {
    await notifyScenarioResult(result, options, scenarioStartedAt);
  }

  return result;
}

async function createScenarioAttemptResources<TEnv>(
  options: RunScenarioSuiteOptions<TEnv>,
  retryCount: number,
): Promise<{
  page?: Page;
  context?: BrowserContext;
  closeContext: boolean;
}> {
  if (options.isolateScenarios || retryCount > 0) {
    if (!options.browser) {
      throw new Error('runScenarioSuite isolateScenarios=true or scenario retry requires browser.');
    }

    const context = await options.browser.newContext();
    return {
      context,
      page: await context.newPage(),
      closeContext: true,
    };
  }

  return {
    context: options.context,
    page: options.page,
    closeContext: false,
  };
}

function normalizeScenarioInput<TEnv>(scenario: ScenarioSuiteInput<TEnv>): ScenarioSuiteEntry<TEnv> {
  if (typeof scenario === 'function') {
    return {
      id: scenario.name || 'scenario',
      run: scenario,
    };
  }

  return scenario;
}

export async function runScenarioSuite<TEnv>(
  options: RunScenarioSuiteOptions<TEnv>,
): Promise<RunResult> {
  const startedAt = new Date();
  const envName = resolveEnvName(options.env);
  const { runId, runDir } = await createRunReportDir({
    timestamp: options.timestamp || formatRunTimestamp(startedAt),
    runMode: options.runMode,
    version: options.version,
    env: envName,
    baseDir: options.baseDir,
  });

  await prepareArtifactsDirs(runDir);

  const scenarios: ScenarioResult[] = [];
  const scenarioRetries = resolveScenarioRetries(options.scenarioRetries);
  if (
    scenarioRetries > 1
    && options.scenarios.some((scenario) => normalizeScenarioInput(scenario).id === 'register-phone')
  ) {
    throw new Error(`REGISTER_PHONE_RETRY_UNSUPPORTED: retryCount=${scenarioRetries}`);
  }
  for (const scenarioInput of options.scenarios) {
    const scenarioEntry = normalizeScenarioInput(scenarioInput);
    const scenarioFn = scenarioEntry.run;
    const scenarioStartedAt = Date.now();
    const scenarioName = scenarioEntry.id || scenarioFn.name || 'scenario';
    options.onProgress?.({
      kind: 'scenario:start',
      scenario: scenarioName,
      version: options.version,
      env: envName,
    });

    let finalResult: ScenarioResult | undefined;
    for (let retryCount = 0; retryCount <= scenarioRetries; retryCount += 1) {
      const shouldNotifyAttempt = (options.notifyScenarioResults ?? true)
        && (retryCount === scenarioRetries || retryCount > 0);
      const resources = await createScenarioAttemptResources(options, retryCount);

      try {
        finalResult = await runScenario(scenarioFn, {
          page: resources.page,
          context: resources.context,
          browser: options.browser,
          env: options.env,
          version: options.version,
          runMode: options.runMode,
          runDir,
          retryCount,
          notifyScenarioResults: shouldNotifyAttempt,
          scenarioTimeoutMs: options.scenarioTimeoutMs,
          metadata: {
            id: scenarioEntry.id,
            scenario: scenarioEntry.scenario,
            reportKey: scenarioEntry.reportKey,
          },
        });
      } finally {
        if (resources.closeContext) {
          await closeContextSafely(resources.context);
        }
      }

      if (
        finalResult.success
        || hasTenantCleanupFailure(finalResult)
        || isPhoneRegisterScenarioTimeout(finalResult)
        || retryCount === scenarioRetries
      ) {
        break;
      }
    }

    if (!finalResult) {
      throw new Error(`Scenario ${scenarioName} did not return a result.`);
    }

    scenarios.push(finalResult);
    options.onProgress?.({
      kind: 'scenario:end',
      scenario: finalResult.scenario,
      version: options.version,
      env: envName,
      success: finalResult.success,
      durationMs: Date.now() - scenarioStartedAt,
      runDir,
    });
  }

  const finishedAt = new Date();
  const runResultBeforeRisk: RunResult = {
    runId,
    runDir,
    runMode: options.runMode,
    version: options.version,
    env: envName,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    success: scenarios.every((scenario) => scenario.success),
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    scenarios,
  };
  const riskSummary = summarizeRunRisk(runResultBeforeRisk);
  const runResult: RunResult = {
    ...runResultBeforeRisk,
    ...riskSummary,
    flaky: scenarios.some((scenario) => scenario.flaky),
    retryCount: Math.max(0, ...scenarios.map((scenario) => scenario.retryCount || 0)),
  };

  await writeRunSummary(runResult);

  return runResult;
}
