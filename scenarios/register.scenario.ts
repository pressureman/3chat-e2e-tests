import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';
import type { RuntimeEnv } from '../configs/env.cn';
import type { ScenarioExecutionOptions } from '../engine/runner';
import {
  recoverTenantCleanupByPhoneLogin,
  type PhoneCleanFlowResult,
} from '../flows/login/phone-clean.flow';
import { type EmailRegisterFlowResult, runEmailRegisterFlow } from '../flows/register/email-register.flow';
import { type PhoneRegisterFlowResult, runPhoneRegisterFlow } from '../flows/register/phone-register.flow';
import { maskPhone } from '../helpers/aliyun-sms';
import { resolveRegisterPhone } from '../helpers/register-phone';
import { formatWorkspaceTimestamp } from '../helpers/report';
import {
  TenantCleanupTracker,
  type TenantCleanupResult,
  type TenantCleanupStatus,
} from '../helpers/tenant-cleanup';
import type { RunMode, ScenarioResult, StepDefinition, StepResult, StepStatus, Version } from './types';

export const registerStepDefinitions: StepDefinition[] = [
  { id: 'openRegisterPage', name: '打开注册页', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'submitAccount', name: '提交账号', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'receiveVerificationCode', name: '收到验证码', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'submitVerificationCode', name: '提交验证码', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'completeRegister', name: '完成注册', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'enterOnboarding', name: '进入 onboarding', type: 'checkpoint', defaultRiskLevel: 'P1', required: true },
  { id: 'reachBuilder', name: '进入搭建助手', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'cleanupTenant', name: '清理手机号注册测试租户', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
];

const stepDefinitionById = new Map(registerStepDefinitions.map((definition) => [definition.id, definition]));

function stepStatus(passed: boolean): StepStatus {
  return passed ? 'passed' : 'failed';
}

function stepResult(
  stepId: string,
  status: StepStatus,
  options: {
    message?: string;
    url?: string;
    screenshot?: string;
    durationMs?: number;
    issueType?: string;
    metadata?: Record<string, unknown>;
  } = {},
): StepResult {
  const definition = stepDefinitionById.get(stepId);
  if (!definition) throw new Error(`Unknown register step: ${stepId}`);

  return {
    stepId: definition.id,
    name: definition.name,
    type: definition.type,
    status,
    defaultRiskLevel: definition.defaultRiskLevel,
    finalRiskLevel: 'NONE',
    issueType: options.issueType,
    message: options.message,
    url: options.url,
    screenshot: options.screenshot,
    durationMs: options.durationMs || 0,
    metadata: options.metadata,
  };
}

type RegisterType = 'email' | 'phone';

function registerType(env: RuntimeEnv): RegisterType {
  const configured = (env as RuntimeEnv & { registerType?: string }).registerType
    || process.env.E2E_REGISTER_TYPE;
  return configured === 'phone' ? 'phone' : 'email';
}

type CommonRegisterFlowResult = {
  fromHome: boolean;
  enteredRegisterPage: boolean;
  extractedCode: boolean;
  passedCodeVerification: boolean;
  completedOnboarding: boolean;
  enteredOnboarding: boolean;
  enteredBuilderPage: boolean;
  finalUrl: string;
  finalVisibleContent: string;
  failureStep: string;
  failureMessage: string;
  success: boolean;
};

function phoneMetadata(flowResult: PhoneRegisterFlowResult): Record<string, unknown> {
  if (flowResult.success) {
    return {
      registerType: 'phone',
      phone: maskPhone(flowResult.phone),
    };
  }

  return {
    registerType: 'phone',
    attempts: flowResult.attempts,
    phones: flowResult.phones.map(maskPhone),
    reason: flowResult.reason || 'UNKNOWN',
  };
}

function tenantDisableUrl(env: RuntimeEnv): string {
  const configured = env.version === 'cn'
    ? process.env.E2E_TENANT_DISABLE_URL_CN
    : process.env.E2E_TENANT_DISABLE_URL_INTL;
  return configured?.trim()
    || `${env.appOrigin.replace(/\/$/, '')}/api-domain/user-center/combination/tenant/v1/disable`;
}

function tenantDisableReferer(env: RuntimeEnv): string {
  return `${env.appOrigin.replace(/\/$/, '')}/embedded-app/subapp?url=/butler/agent/builder`;
}

function cleanupIssueType(status: TenantCleanupStatus): string | undefined {
  if (status === 'missing-tenant-id') return 'TENANT_CLEANUP_TENANT_ID_MISSING';
  if (status === 'missing-cookie') return 'TENANT_CLEANUP_COOKIE_MISSING';
  if (status === 'login-recovery-failed') return 'TENANT_CLEANUP_LOGIN_RECOVERY_FAILED';
  if (status === 'api-failed') return 'TENANT_CLEANUP_API_FAILED';
  if (status === 'timeout') return 'TENANT_CLEANUP_TIMEOUT';
  if (status === 'skipped-scenario-timeout') return 'TENANT_CLEANUP_SKIPPED_SCENARIO_TIMEOUT';
  return undefined;
}

function cleanupRetryAllowed(cleanup: TenantCleanupResult, scenarioTimedOut = false): boolean {
  return !scenarioTimedOut
    && (cleanup.status === 'success' || cleanup.status === 'not-required');
}

function cleanupStepResult(
  cleanup: TenantCleanupResult,
  registrationBusinessSuccess: boolean,
  phone: string,
  durationMs: number,
  scenarioTimedOut = false,
): StepResult {
  const status: StepStatus = cleanup.status === 'success'
    ? 'passed'
    : cleanup.status === 'not-required'
      ? 'skipped'
      : 'failed';

  return stepResult('cleanupTenant', status, {
    message: cleanup.message || `Tenant cleanup ${cleanup.status}.`,
    durationMs,
    issueType: cleanupIssueType(cleanup.status),
    metadata: {
      cleanupStatus: cleanup.status,
      cleanupAttempted: cleanup.attempted,
      credentialSource: cleanup.credentialSource,
      directCaptureSucceeded: cleanup.directCaptureSucceeded,
      loginRecoveryAttempted: cleanup.loginRecoveryAttempted,
      loginRecoveryStatus: cleanup.loginRecoveryStatus,
      tenantIdFound: cleanup.tenantIdFound,
      cookieFound: cleanup.cookieFound,
      httpStatus: cleanup.httpStatus,
      retryAllowed: cleanupRetryAllowed(cleanup, scenarioTimedOut),
      registrationBusinessSuccess,
      phone: maskPhone(phone),
    },
  });
}

function cleanupResultWithoutRequest(
  tracker: TenantCleanupTracker,
  input: Pick<TenantCleanupResult, 'status' | 'attempted' | 'loginRecoveryAttempted'> & {
    loginRecoveryStatus?: TenantCleanupResult['loginRecoveryStatus'];
    message?: string;
  },
): TenantCleanupResult {
  return {
    ...input,
    ...tracker.getCredentialState(),
  };
}

export async function recoverAndCleanupPhoneTenant(options: {
  context?: BrowserContext;
  env: RuntimeEnv;
  phone: string;
  tracker: TenantCleanupTracker;
  disableUrl: string;
  referer: string;
  scenarioTimedOut: boolean;
  signal?: AbortSignal;
  recoverLogin?: typeof recoverTenantCleanupByPhoneLogin;
  directCaptureTimeoutMs?: number;
  recoveryCaptureTimeoutMs?: number;
}): Promise<TenantCleanupResult> {
  const cleanupOptions = {
    tenantCreated: true,
    disableUrl: options.disableUrl,
    referer: options.referer,
  };

  if (options.scenarioTimedOut || options.signal?.aborted) {
    if (options.tracker.hasCompleteCredentials()) {
      return options.tracker.cleanup(cleanupOptions);
    }
    return cleanupResultWithoutRequest(options.tracker, {
      status: 'skipped-scenario-timeout',
      attempted: false,
      loginRecoveryAttempted: false,
      message: 'Tenant cleanup login recovery skipped because the Scenario timed out.',
    });
  }

  if (!options.context) {
    return cleanupResultWithoutRequest(options.tracker, {
      status: 'login-recovery-failed',
      attempted: false,
      loginRecoveryAttempted: false,
      loginRecoveryStatus: 'failed',
      message: 'Tenant cleanup login recovery requires a BrowserContext.',
    });
  }

  await options.tracker.capture({
    context: options.context,
    disableUrl: options.disableUrl,
    source: 'current-context',
    timeoutMs: options.directCaptureTimeoutMs ?? 3_000,
    intervalMs: 300,
  });
  if (options.tracker.hasCompleteCredentials()) {
    return options.tracker.cleanup(cleanupOptions);
  }

  if (options.signal?.aborted) {
    return cleanupResultWithoutRequest(options.tracker, {
      status: 'skipped-scenario-timeout',
      attempted: false,
      loginRecoveryAttempted: false,
      message: 'Tenant cleanup login recovery skipped because the Scenario timed out.',
    });
  }

  const cleanupPage = await options.context.newPage();
  let phoneCleanResult: PhoneCleanFlowResult;
  try {
    phoneCleanResult = await (options.recoverLogin || recoverTenantCleanupByPhoneLogin)({
      page: cleanupPage,
      env: options.env,
      phone: options.phone,
      signal: options.signal,
    });

    if (
      phoneCleanResult.status === 'authenticated'
      || phoneCleanResult.status === 'onboarding'
    ) {
      await options.tracker.capture({
        context: options.context,
        disableUrl: options.disableUrl,
        source: 'phone-login',
        timeoutMs: options.recoveryCaptureTimeoutMs ?? 5_000,
        intervalMs: 300,
      });
    }
  } finally {
    await cleanupPage.close().catch(() => undefined);
  }

  if (options.signal?.aborted) {
    if (options.tracker.hasCompleteCredentials()) {
      return options.tracker.cleanup(cleanupOptions);
    }
    return cleanupResultWithoutRequest(options.tracker, {
      status: 'skipped-scenario-timeout',
      attempted: false,
      loginRecoveryAttempted: true,
      loginRecoveryStatus: phoneCleanResult!.status,
      message: 'Tenant cleanup did not finish before the Scenario timed out.',
    });
  }

  if (options.tracker.hasCompleteCredentials()) {
    return options.tracker.cleanup({
      ...cleanupOptions,
      loginRecoveryAttempted: true,
      loginRecoveryStatus: phoneCleanResult!.status,
    });
  }

  if (phoneCleanResult!.status === 'account-not-found') {
    return cleanupResultWithoutRequest(options.tracker, {
      status: 'not-required',
      attempted: false,
      loginRecoveryAttempted: true,
      loginRecoveryStatus: 'account-not-found',
      message: 'Phone login explicitly confirmed that the account does not exist.',
    });
  }

  if (
    phoneCleanResult!.status === 'authenticated'
    || phoneCleanResult!.status === 'onboarding'
  ) {
    return options.tracker.cleanup({
      ...cleanupOptions,
      loginRecoveryAttempted: true,
      loginRecoveryStatus: phoneCleanResult!.status,
    });
  }

  return cleanupResultWithoutRequest(options.tracker, {
    status: 'login-recovery-failed',
    attempted: false,
    loginRecoveryAttempted: true,
    loginRecoveryStatus: 'failed',
    message: phoneCleanResult!.failureReason || 'Phone login recovery failed.',
  });
}

function failedPhoneFlowResult(
  phone: string,
  error: unknown,
  finalUrl: string,
): PhoneRegisterFlowResult {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\b1\d{10}\b/g, (value) => maskPhone(value))
    .replace(/(?<!\*)\b\d{4,8}\b/g, '[code]');
  return {
    registerType: 'phone',
    phone,
    phones: [phone],
    attempts: 1,
    reason: 'UNKNOWN',
    fromHome: false,
    clickedRegisterEntry: false,
    enteredRegisterPage: false,
    enteredPhoneBranch: false,
    sentPhoneCode: false,
    receivedSms: false,
    extractedCode: false,
    inputPhoneCode: false,
    passedCodeVerification: false,
    enteredOnboarding: false,
    filledWorkspaceName: false,
    filledContactPhone: false,
    completedOnboarding: false,
    sawWelcomeModal: false,
    clickedStartExperience: false,
    enteredBuilderPage: false,
    finalUrl,
    finalVisibleContent: '未确认',
    failureStep: '手机号注册异常',
    failureMessage: message,
    success: false,
  };
}

function buildRegistrationSteps(input: {
  flowResult: CommonRegisterFlowResult;
  metadata: Record<string, unknown>;
  submittedAccount: boolean;
  receivedCode: boolean;
  inputCode: boolean;
  accountMessage: string;
  screenshot?: string;
  durationMs: number;
}): StepResult[] {
  const issueType = input.flowResult.success ? undefined : input.flowResult.failureStep;
  const message = input.flowResult.failureMessage || input.flowResult.finalVisibleContent;

  return [
    stepResult('openRegisterPage', stepStatus(input.flowResult.fromHome && input.flowResult.enteredRegisterPage), {
      message,
      url: input.flowResult.finalUrl,
      durationMs: 0,
      issueType: input.flowResult.enteredRegisterPage ? undefined : issueType,
      metadata: input.metadata,
    }),
    stepResult('submitAccount', stepStatus(input.submittedAccount), {
      message: input.accountMessage || message,
      url: input.flowResult.finalUrl,
      durationMs: 0,
      issueType: input.submittedAccount ? undefined : issueType,
      metadata: input.metadata,
    }),
    stepResult('receiveVerificationCode', stepStatus(input.receivedCode), {
      message,
      url: input.flowResult.finalUrl,
      durationMs: 0,
      issueType: input.receivedCode ? undefined : issueType,
      metadata: input.metadata,
    }),
    stepResult('submitVerificationCode', stepStatus(input.inputCode), {
      message,
      url: input.flowResult.finalUrl,
      durationMs: 0,
      issueType: input.inputCode ? undefined : issueType,
      metadata: input.metadata,
    }),
    stepResult('completeRegister', stepStatus(input.flowResult.completedOnboarding), {
      message,
      url: input.flowResult.finalUrl,
      durationMs: 0,
      issueType: input.flowResult.completedOnboarding ? undefined : issueType,
      metadata: input.metadata,
    }),
    stepResult('enterOnboarding', stepStatus(input.flowResult.enteredOnboarding), {
      message,
      url: input.flowResult.finalUrl,
      durationMs: 0,
      issueType: input.flowResult.enteredOnboarding ? undefined : issueType,
      metadata: input.metadata,
    }),
    stepResult('reachBuilder', stepStatus(input.flowResult.enteredBuilderPage), {
      message,
      url: input.flowResult.finalUrl,
      screenshot: input.screenshot,
      durationMs: input.durationMs,
      issueType: input.flowResult.enteredBuilderPage ? undefined : issueType,
      metadata: input.metadata,
    }),
  ];
}

async function saveScenarioScreenshot(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<string | undefined> {
  if (!options.page) return undefined;

  const reportKey = (options.env as RuntimeEnv & { reportKey?: string }).reportKey || 'register';
  const screenshotsDir = path.join(options.runDir, 'scenarios', reportKey, 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });
  const screenshotPath = path.join(screenshotsDir, 'register-result.png');
  await options.page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  return screenshotPath;
}

export async function registerScenario(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<ScenarioResult> {
  if (!options.page) {
    throw new Error('registerScenario requires a Playwright page.');
  }

  const startedAt = Date.now();
  const workspacePrefix = process.env.E2E_WORKSPACE_NAME || 'E2ETest';
  const selectedRegisterType = registerType(options.env);
  const commonFlowOptions = {
    env: options.env,
    baseUrl: options.env.homeUrl,
    appOrigin: options.env.appOrigin,
    password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
    workspaceName: `${workspacePrefix}_${formatWorkspaceTimestamp(new Date())}`,
    contactPhone: process.env.E2E_CONTACT_PHONE || '15000000001',
  };

  if (selectedRegisterType === 'phone') {
    const phone = resolveRegisterPhone(options.env.version, options.retryCount || 0);
    const cleanupTracker = new TenantCleanupTracker();
    const disableUrl = tenantDisableUrl(options.env);
    const disableReferer = tenantDisableReferer(options.env);
    let phoneFlowResult: PhoneRegisterFlowResult | undefined;
    let screenshot: string | undefined;
    let cleanup: TenantCleanupResult;
    let cleanupStartedAt = 0;

    try {
      try {
        phoneFlowResult = await runPhoneRegisterFlow(options.page, {
          ...commonFlowOptions,
          phone,
          cleanupTracker,
          cleanupDisableUrl: disableUrl,
          signal: options.scenarioTimeoutSignal,
        });
      } catch (error) {
        phoneFlowResult = failedPhoneFlowResult(phone, error, options.page.url() || '未确认');
      }
    } finally {
      try {
        screenshot = await saveScenarioScreenshot(options);
      } finally {
        cleanupStartedAt = Date.now();
        try {
          cleanup = await recoverAndCleanupPhoneTenant({
            context: options.context,
            env: options.env,
            phone,
            tracker: cleanupTracker,
            disableUrl,
            referer: disableReferer,
            scenarioTimedOut: Boolean(options.scenarioTimeoutSignal?.aborted),
            signal: options.scenarioTimeoutSignal,
          });
        } catch (error) {
          cleanup = cleanupResultWithoutRequest(cleanupTracker, {
            status: options.scenarioTimeoutSignal?.aborted
              ? 'skipped-scenario-timeout'
              : 'login-recovery-failed',
            attempted: false,
            loginRecoveryAttempted: !options.scenarioTimeoutSignal?.aborted,
            loginRecoveryStatus: options.scenarioTimeoutSignal?.aborted ? undefined : 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (!phoneFlowResult) {
      throw new Error('Phone register flow ended without a result.');
    }

    const durationMs = Date.now() - startedAt;
    const steps = buildRegistrationSteps({
      flowResult: phoneFlowResult,
      metadata: phoneMetadata(phoneFlowResult),
      submittedAccount: phoneFlowResult.enteredPhoneBranch && phoneFlowResult.sentPhoneCode,
      receivedCode: phoneFlowResult.receivedSms && phoneFlowResult.extractedCode,
      inputCode: phoneFlowResult.inputPhoneCode && phoneFlowResult.passedCodeVerification,
      accountMessage: maskPhone(phoneFlowResult.phone),
      screenshot,
      durationMs,
    });
    steps.push(cleanupStepResult(
      cleanup!,
      phoneFlowResult.success,
      phone,
      Date.now() - cleanupStartedAt,
      Boolean(options.scenarioTimeoutSignal?.aborted),
    ));

    const cleanupSucceeded = cleanup!.status === 'success'
      || cleanup!.status === 'not-required';

    return {
      scenario: 'register',
      version: options.version as Version,
      env: options.env.label,
      runMode: options.runMode as RunMode,
      success: phoneFlowResult.success && cleanupSucceeded,
      highestRiskLevel: 'NONE',
      shouldNotify: false,
      shouldBlockCI: false,
      steps,
    };
  }

  const emailFlowResult: EmailRegisterFlowResult = await runEmailRegisterFlow(
    options.page,
    commonFlowOptions,
  );
  const durationMs = Date.now() - startedAt;
  const screenshot = await saveScenarioScreenshot(options);
  const steps = buildRegistrationSteps({
    flowResult: emailFlowResult,
    metadata: { registerType: 'email', email: emailFlowResult.email },
    submittedAccount: emailFlowResult.enteredEmailBranch && emailFlowResult.sentEmailCode,
    receivedCode: emailFlowResult.receivedEmail && emailFlowResult.extractedCode,
    inputCode: emailFlowResult.inputEmailCode && emailFlowResult.passedCodeVerification,
    accountMessage: emailFlowResult.email,
    screenshot,
    durationMs,
  });

  return {
    scenario: 'register',
    version: options.version as Version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    success: emailFlowResult.success,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps,
  };
}
