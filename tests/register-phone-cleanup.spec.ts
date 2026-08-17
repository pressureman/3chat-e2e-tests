import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { cnEnv } from '../configs/env.cn';
import { DEFAULT_SCENARIO_TIMEOUT_MS, executeScenario } from '../engine/scenario-executor';
import { writeRunSummary } from '../engine/report-engine';
import {
  hasTenantCleanupFailure,
  isPhoneRegisterScenarioTimeout,
  runScenarioSuite,
} from '../engine/runner';
import {
  classifyPhoneCleanPageState,
  recoverTenantCleanupByPhoneLogin,
} from '../flows/login/phone-clean.flow';
import {
  resolveRegisterPhone,
  resolveRegisterPhoneSmsCooldownMs,
} from '../helpers/register-phone';
import {
  recoverAndCleanupPhoneTenant,
} from '../scenarios/register.scenario';
import {
  TenantCleanupTracker,
  type TenantCleanupStatus,
} from '../helpers/tenant-cleanup';
import type { RunResult, ScenarioResult, StepResult, StepStatus } from '../scenarios/types';

function cleanupIssueType(status: TenantCleanupStatus): string | undefined {
  const values: Partial<Record<TenantCleanupStatus, string>> = {
    'missing-tenant-id': 'TENANT_CLEANUP_TENANT_ID_MISSING',
    'missing-cookie': 'TENANT_CLEANUP_COOKIE_MISSING',
    'login-recovery-failed': 'TENANT_CLEANUP_LOGIN_RECOVERY_FAILED',
    'api-failed': 'TENANT_CLEANUP_API_FAILED',
    timeout: 'TENANT_CLEANUP_TIMEOUT',
    'skipped-scenario-timeout': 'TENANT_CLEANUP_SKIPPED_SCENARIO_TIMEOUT',
  };
  return values[status];
}

function cleanupStep(
  status: StepStatus,
  cleanupStatus: TenantCleanupStatus = 'success',
  metadata: Record<string, unknown> = {},
): StepResult {
  return {
    stepId: 'cleanupTenant',
    name: '清理手机号注册测试租户',
    type: 'checkpoint',
    status,
    defaultRiskLevel: 'P0',
    finalRiskLevel: 'NONE',
    issueType: cleanupIssueType(cleanupStatus),
    message: `Tenant cleanup ${cleanupStatus}.`,
    durationMs: 1,
    metadata: {
      cleanupStatus,
      cleanupAttempted: status !== 'skipped',
      credentialSource: cleanupStatus === 'success' ? 'phone-login' : 'none',
      directCaptureSucceeded: false,
      loginRecoveryAttempted: true,
      loginRecoveryStatus: cleanupStatus === 'success' ? 'authenticated' : 'failed',
      tenantIdFound: status === 'passed',
      cookieFound: status === 'passed',
      httpStatus: status === 'passed' ? 200 : 500,
      retryAllowed: cleanupStatus === 'success' || cleanupStatus === 'not-required',
      registrationBusinessSuccess: true,
      phone: '150****0160',
      ...metadata,
    },
  };
}

function scenarioResult(step: StepResult, success: boolean): ScenarioResult {
  return {
    scenario: 'register',
    reportKey: 'register-cn-phone',
    version: 'cn',
    env: '国内版',
    runMode: 'manual',
    success,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps: [step],
  };
}

function fakePage(url = 'https://app.3chatai.cn/chat/login'): Page {
  return {
    url: () => url,
    close: async () => undefined,
  } as unknown as Page;
}

function mutableContext(initialCookies: Array<{ name: string; value: string }> = []) {
  let cookies = initialCookies;
  const page = fakePage();
  const context = {
    cookies: async () => cookies,
    newPage: async () => page,
  } as unknown as BrowserContext;
  return {
    context,
    page,
    setCookies(next: Array<{ name: string; value: string }>) {
      cookies = next;
    },
  };
}

function successDisableResponse(): Response {
  return new Response(JSON.stringify({ code: 200 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('resolves the only supported phone for each version and attempt', () => {
  expect(resolveRegisterPhone('cn', 0)).toBe('15000000160');
  expect(resolveRegisterPhone('cn', 1)).toBe('15000000161');
  expect(resolveRegisterPhone('intl', 0)).toBe('15000000162');
  expect(resolveRegisterPhone('intl', 1)).toBe('15000000163');
  expect(() => resolveRegisterPhone('cn', 2)).toThrow('REGISTER_PHONE_RETRY_UNSUPPORTED');
  expect(() => resolveRegisterPhone('all', 0)).toThrow('REGISTER_PHONE_VERSION_UNSUPPORTED');
});

test('rejects more than one Scenario retry for phone registration', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'register-phone-retries-'));
  try {
    await expect(runScenarioSuite({
      scenarios: [{
        id: 'register-phone',
        run: async () => scenarioResult(cleanupStep('passed'), true),
      }],
      env: { version: 'cn', label: '国内版' },
      version: 'cn',
      runMode: 'manual',
      baseDir,
      scenarioRetries: 2,
    })).rejects.toThrow('REGISTER_PHONE_RETRY_UNSUPPORTED: retryCount=2');
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test('preserves first-attempt phone-login cleanup evidence after retry', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'register-phone-first-cleanup-'));
  let attempts = 0;
  const retryContext = {
    newPage: async () => fakePage(),
    close: async () => undefined,
  } as unknown as BrowserContext;
  const browser = {
    newContext: async () => retryContext,
  } as unknown as Browser;

  try {
    const run = await runScenarioSuite({
      scenarios: [{
        id: 'register-phone',
        reportKey: 'register-cn-phone',
        run: async () => {
          const retryCount = attempts;
          attempts += 1;
          if (retryCount === 0) {
            return scenarioResult(cleanupStep('passed', 'success', {
              phone: '150****0160',
              registrationBusinessSuccess: false,
              credentialSource: 'phone-login',
              loginRecoveryAttempted: true,
              loginRecoveryStatus: 'authenticated',
              retryAllowed: true,
            }), false);
          }
          return scenarioResult(cleanupStep('passed', 'success', {
            phone: '150****0161',
            credentialSource: 'onboarding',
            loginRecoveryAttempted: false,
            loginRecoveryStatus: undefined,
            retryAllowed: true,
          }), true);
        },
      }],
      browser,
      env: { version: 'cn', label: '国内版' },
      version: 'cn',
      runMode: 'manual',
      baseDir,
      scenarioRetries: 1,
      notifyScenarioResults: false,
    });

    const scenario = run.scenarios[0];
    const finalCleanup = scenario.steps.find((step) => step.stepId === 'cleanupTenant');
    expect(attempts).toBe(2);
    expect(scenario.flaky).toBe(true);
    expect(finalCleanup?.metadata?.firstAttemptCleanup).toMatchObject({
      phone: '150****0160',
      credentialSource: 'phone-login',
      loginRecoveryAttempted: true,
      loginRecoveryStatus: 'authenticated',
      cleanupStatus: 'success',
      retryAllowed: true,
    });

    const markdown = await fs.readFile(path.join(run.runDir, 'summary.md'), 'utf8');
    expect(markdown).toContain('register-cn-phone (first attempt)');
    expect(markdown).toContain('| phone-login | false | true | authenticated |');
    expect(markdown).toContain('| register-cn-phone | 150****0161 | passed | success |');
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test('captures credentials from the current Context and cleans directly', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ headers: Headers; body: string }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push({ headers: new Headers(init?.headers), body: String(init?.body || '') });
    return successDisableResponse();
  };

  try {
    const state = mutableContext([
      { name: 'session', value: 'secret-session' },
      { name: 'TENANT_ID', value: 'tenant-secret' },
    ]);
    let recoveryCalls = 0;
    const result = await recoverAndCleanupPhoneTenant({
      context: state.context,
      env: cnEnv,
      phone: '15000000160',
      tracker: new TenantCleanupTracker(),
      disableUrl: 'https://app.3chatai.cn/disable',
      referer: 'https://app.3chatai.cn/builder',
      scenarioTimedOut: false,
      directCaptureTimeoutMs: 0,
      recoverLogin: async () => {
        recoveryCalls += 1;
        return {
          status: 'failed',
          sentPhoneCode: false,
          receivedSms: false,
          inputPhoneCode: false,
          finalUrl: '',
        };
      },
    });

    expect(result.status).toBe('success');
    expect(result.credentialSource).toBe('current-context');
    expect(result.directCaptureSucceeded).toBe(true);
    expect(result.loginRecoveryAttempted).toBe(false);
    expect(recoveryCalls).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('cookie')).toContain('session=secret-session');
    expect(JSON.parse(requests[0].body)).toEqual({ body: 'tenant-secret' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const recoveredStatus of ['onboarding', 'authenticated'] as const) {
  test(`cleans after phone login recovery reaches ${recoveredStatus}`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => successDisableResponse();
    try {
      const state = mutableContext();
      const result = await recoverAndCleanupPhoneTenant({
        context: state.context,
        env: cnEnv,
        phone: '15000000160',
        tracker: new TenantCleanupTracker(),
        disableUrl: 'https://app.3chatai.cn/disable',
        referer: 'https://app.3chatai.cn/builder',
        scenarioTimedOut: false,
        directCaptureTimeoutMs: 0,
        recoveryCaptureTimeoutMs: 0,
        recoverLogin: async () => {
          state.setCookies([
            { name: 'session', value: 'secret-session' },
            { name: 'TENANT_ID', value: 'tenant-secret' },
          ]);
          return {
            status: recoveredStatus,
            sentPhoneCode: true,
            receivedSms: true,
            inputPhoneCode: true,
            finalUrl: 'https://app.3chatai.cn/recovered',
          };
        },
      });

      expect(result.status).toBe('success');
      expect(result.credentialSource).toBe('phone-login');
      expect(result.loginRecoveryAttempted).toBe(true);
      expect(result.loginRecoveryStatus).toBe(recoveredStatus);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test('returns not-required only for an explicit account-not-found recovery result', async () => {
  const state = mutableContext();
  const result = await recoverAndCleanupPhoneTenant({
    context: state.context,
    env: cnEnv,
    phone: '15000000160',
    tracker: new TenantCleanupTracker(),
    disableUrl: 'https://app.3chatai.cn/disable',
    referer: 'https://app.3chatai.cn/builder',
    scenarioTimedOut: false,
    directCaptureTimeoutMs: 0,
    recoverLogin: async () => ({
      status: 'account-not-found',
      sentPhoneCode: true,
      receivedSms: true,
      inputPhoneCode: true,
      finalUrl: 'https://app.3chatai.cn/chat/login',
    }),
  });

  expect(result.status).toBe('not-required');
  expect(result.attempted).toBe(false);
  expect(result.loginRecoveryStatus).toBe('account-not-found');
  expect(classifyPhoneCleanPageState('', '该手机号尚未注册')?.status).toBe('account-not-found');
  expect(classifyPhoneCleanPageState(
    'https://app.3chatai.cn/butler/on-boarding',
    '工作台',
  )?.status).toBe('onboarding');
  expect(classifyPhoneCleanPageState('', '登录没有完成')).toBeUndefined();
});

test('maps an ambiguous recovery failure to login-recovery-failed', async () => {
  const state = mutableContext();
  const result = await recoverAndCleanupPhoneTenant({
    context: state.context,
    env: cnEnv,
    phone: '15000000160',
    tracker: new TenantCleanupTracker(),
    disableUrl: 'https://app.3chatai.cn/disable',
    referer: 'https://app.3chatai.cn/builder',
    scenarioTimedOut: false,
    directCaptureTimeoutMs: 0,
    recoverLogin: async () => ({
      status: 'failed',
      sentPhoneCode: true,
      receivedSms: false,
      inputPhoneCode: false,
      finalUrl: 'chrome-error://chromewebdata/',
      failureReason: '页面加载失败',
    }),
  });

  expect(result.status).toBe('login-recovery-failed');
  expect(result.loginRecoveryAttempted).toBe(true);
  expect(result.loginRecoveryStatus).toBe('failed');
});

test('phone cleanup login waits for cooldown and records the actual send time', async () => {
  const calls: string[] = [];
  const sentAt = 123456;
  const originalCooldown = process.env.E2E_REGISTER_PHONE_SMS_COOLDOWN_MS;
  delete process.env.E2E_REGISTER_PHONE_SMS_COOLDOWN_MS;
  try {
    expect(resolveRegisterPhoneSmsCooldownMs()).toBe(65_000);
    const result = await recoverTenantCleanupByPhoneLogin({
      page: fakePage(),
      env: cnEnv,
      phone: '15000000160',
      dependencies: {
        openLoginPage: async () => { calls.push('open'); },
        switchToPhoneLogin: async () => { calls.push('switch'); },
        waitForCooldown: async () => { calls.push('cooldown'); },
        sendPhoneCode: async (_page, phone) => {
          calls.push('send');
          return { phone, sentAt };
        },
        recordSmsSent: async (phone, value) => {
          expect(phone).toBe('15000000160');
          expect(value).toBe(sentAt);
          calls.push('record');
        },
        getVerificationCode: async () => {
          calls.push('receive');
          return '123456';
        },
        fillVerificationCode: async () => { calls.push('input'); },
        clickContinuePrompt: async () => false,
        waitForResult: async () => ({ status: 'authenticated' }),
      },
    });

    expect(result.status).toBe('authenticated');
    expect(calls).toEqual(['open', 'switch', 'cooldown', 'send', 'record', 'receive', 'input']);
  } finally {
    if (originalCooldown === undefined) delete process.env.E2E_REGISTER_PHONE_SMS_COOLDOWN_MS;
    else process.env.E2E_REGISTER_PHONE_SMS_COOLDOWN_MS = originalCooldown;
  }
});

test('does not allow retry when phone login succeeds without TENANT_ID', async () => {
  const state = mutableContext();
  const result = await recoverAndCleanupPhoneTenant({
    context: state.context,
    env: cnEnv,
    phone: '15000000160',
    tracker: new TenantCleanupTracker(),
    disableUrl: 'https://app.3chatai.cn/disable',
    referer: 'https://app.3chatai.cn/builder',
    scenarioTimedOut: false,
    directCaptureTimeoutMs: 0,
    recoveryCaptureTimeoutMs: 0,
    recoverLogin: async () => {
      state.setCookies([{ name: 'session', value: 'secret-session' }]);
      return {
        status: 'authenticated',
        sentPhoneCode: true,
        receivedSms: true,
        inputPhoneCode: true,
        finalUrl: 'https://app.3chatai.cn/builder',
      };
    },
  });

  expect(result.status).toBe('missing-tenant-id');
  expect(hasTenantCleanupFailure(scenarioResult(cleanupStep('failed', result.status), false))).toBe(true);
});

test('does not allow retry when the disable API fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('failed', { status: 500 });
  try {
    const state = mutableContext([
      { name: 'session', value: 'secret-session' },
      { name: 'TENANT_ID', value: 'tenant-secret' },
    ]);
    const result = await recoverAndCleanupPhoneTenant({
      context: state.context,
      env: cnEnv,
      phone: '15000000160',
      tracker: new TenantCleanupTracker(),
      disableUrl: 'https://app.3chatai.cn/disable',
      referer: 'https://app.3chatai.cn/builder',
      scenarioTimedOut: false,
      directCaptureTimeoutMs: 0,
    });
    expect(result.status).toBe('api-failed');
    expect(hasTenantCleanupFailure(scenarioResult(cleanupStep('failed', result.status), false))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('phone registration timeout skips login recovery and does not retry', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'register-phone-timeout-'));
  let attempts = 0;
  let loginRecoveryCalls = 0;
  try {
    const run = await runScenarioSuite({
      scenarios: [{
        id: 'register-phone',
        reportKey: 'register-cn-phone',
        run: async (options) => {
          attempts += 1;
          await new Promise<void>((resolve) => {
            if (options.scenarioTimeoutSignal?.aborted) return resolve();
            options.scenarioTimeoutSignal?.addEventListener('abort', () => resolve(), { once: true });
          });
          if (!options.scenarioTimeoutSignal?.aborted) loginRecoveryCalls += 1;
          return scenarioResult(cleanupStep('failed', 'skipped-scenario-timeout', {
            cleanupAttempted: false,
            loginRecoveryAttempted: false,
            retryAllowed: false,
          }), false);
        },
      }],
      env: { version: 'cn', label: '国内版' },
      version: 'cn',
      runMode: 'manual',
      baseDir,
      scenarioRetries: 1,
      scenarioTimeoutMs: 5,
      notifyScenarioResults: false,
    });

    const result = run.scenarios[0];
    expect(attempts).toBe(1);
    expect(loginRecoveryCalls).toBe(0);
    expect(isPhoneRegisterScenarioTimeout(result)).toBe(true);
    expect(result.steps[0].issueType).toBe('SCENARIO_TIMEOUT');
    expect(result.steps.find((step) => step.stepId === 'cleanupTenant')?.issueType)
      .toBe('TENANT_CLEANUP_SKIPPED_SCENARIO_TIMEOUT');
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test('uses one 480000ms default timeout for every Scenario', () => {
  expect(DEFAULT_SCENARIO_TIMEOUT_MS).toBe(480_000);
});

test('writes recovery fields into the existing Tenant Cleanup summary', async () => {
  const scenario = scenarioResult(cleanupStep('failed', 'login-recovery-failed', {
    credentialSource: 'none',
    directCaptureSucceeded: false,
    loginRecoveryAttempted: true,
    loginRecoveryStatus: 'failed',
    retryAllowed: false,
  }), false);
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'register-cleanup-report-'));
  const runResult: RunResult = {
    runId: 'unit-test',
    runDir,
    runMode: 'manual',
    version: 'cn',
    env: '国内版',
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    success: false,
    highestRiskLevel: 'P0',
    shouldNotify: true,
    shouldBlockCI: true,
    scenarios: [scenario],
  };

  try {
    await writeRunSummary(runResult);
    const markdown = await fs.readFile(path.join(runDir, 'summary.md'), 'utf8');
    expect(markdown).toContain('credentialSource');
    expect(markdown).toContain('loginRecoveryStatus');
    expect(markdown).toContain('| register-cn-phone | 150****0160 | passed | login-recovery-failed |');
    expect(markdown).toContain('| none | false | true | failed |');
    expect(markdown).not.toContain('tenant-secret');
    expect(markdown).not.toContain('secret-session');
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
  }
});

test('includes recovery method and retryAllowed in the dedicated Feishu alert without secrets', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnabled = process.env.E2E_TENANT_CLEANUP_FEISHU_NOTIFY;
  const originalWebhook = process.env.FEISHU_WEBHOOK_URL;
  const requestBodies: string[] = [];
  process.env.E2E_TENANT_CLEANUP_FEISHU_NOTIFY = 'true';
  process.env.FEISHU_WEBHOOK_URL = 'https://example.invalid/feishu-webhook';
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(String(init?.body || ''));
    return new Response(JSON.stringify({ code: 0 }), { status: 200 });
  };

  try {
    await executeScenario({
      env: { version: 'cn', label: '国内版' },
      version: 'cn',
      runMode: 'manual',
      runDir: os.tmpdir(),
      retryCount: 1,
      metadata: { id: 'register-phone', reportKey: 'register-cn-phone' },
      scenarioFn: async () => scenarioResult(cleanupStep('failed', 'login-recovery-failed', {
        credentialSource: 'none',
        directCaptureSucceeded: false,
        loginRecoveryAttempted: true,
        loginRecoveryStatus: 'failed',
        retryAllowed: false,
      }), false),
    });

    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toContain('凭证来源：none');
    expect(requestBodies[0]).toContain('登录恢复状态：failed');
    expect(requestBodies[0]).toContain('允许重试：false');
    expect(requestBodies[0]).toContain('150****0160');
    expect(requestBodies[0]).not.toContain('15000000160');
    expect(requestBodies[0]).not.toContain('tenant-secret');
    expect(requestBodies[0]).not.toContain('secret-session');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.E2E_TENANT_CLEANUP_FEISHU_NOTIFY;
    else process.env.E2E_TENANT_CLEANUP_FEISHU_NOTIFY = originalEnabled;
    if (originalWebhook === undefined) delete process.env.FEISHU_WEBHOOK_URL;
    else process.env.FEISHU_WEBHOOK_URL = originalWebhook;
  }
});

test('cleanup results and reports never serialize Cookie or full TENANT_ID values', async () => {
  const tracker = new TenantCleanupTracker();
  const state = mutableContext([
    { name: 'session', value: 'secret-session' },
    { name: 'TENANT_ID', value: 'tenant-secret' },
  ]);
  await tracker.capture({
    context: state.context,
    disableUrl: 'https://app.3chatai.cn/disable',
    source: 'current-context',
    timeoutMs: 0,
  });
  const serializedState = JSON.stringify(tracker.getCredentialState());
  expect(serializedState).not.toContain('secret-session');
  expect(serializedState).not.toContain('tenant-secret');
});
