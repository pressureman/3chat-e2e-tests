import type { RuntimeEnv } from '../configs/env.cn';
import { testAccounts, type LoginAccount } from '../configs/test-accounts';
import type { ScenarioExecutionOptions } from '../engine/runner';
import { loginWithEmail, type EmailLoginResult } from '../flows/login/email-login.flow';
import { loginWithPassword, type PasswordLoginResult } from '../flows/login/password-login.flow';
import { loginWithPhone, type PhoneLoginResult } from '../flows/login/phone-login.flow';
import type { RunMode, ScenarioResult, StepDefinition, StepResult, StepStatus, Version } from './types';

export const loginStepDefinitions: StepDefinition[] = [
  { id: 'openLoginPage', name: '打开登录页', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'selectLoginMethod', name: '选择登录方式', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'fillCredential', name: '填写登录凭证', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'requestVerificationCode', name: '请求验证码', type: 'action', defaultRiskLevel: 'P1', required: false },
  { id: 'receiveVerificationCode', name: '收到验证码', type: 'checkpoint', defaultRiskLevel: 'P0', required: false },
  { id: 'submitLogin', name: '提交登录', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'loginSuccess', name: '登录成功', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'enterAppHome', name: '进入应用首页', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
];

const stepDefinitionById = new Map(loginStepDefinitions.map((definition) => [definition.id, definition]));

function stepStatus(passed: boolean, skipped = false): StepStatus {
  if (skipped) return 'skipped';
  return passed ? 'passed' : 'failed';
}

function stepResult(
  stepId: string,
  status: StepStatus,
  options: {
    message?: string;
    url?: string;
    durationMs?: number;
    issueType?: string;
    metadata?: Record<string, unknown>;
  } = {},
): StepResult {
  const definition = stepDefinitionById.get(stepId);
  if (!definition) throw new Error(`Unknown login step: ${stepId}`);

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
    durationMs: options.durationMs || 0,
    metadata: options.metadata,
  };
}

type LoginMethod = 'password' | 'phone' | 'email';

type CommonLoginResult = {
  fromHome: boolean;
  foundLoginEntry: boolean;
  clickedLogin: boolean;
  success: boolean;
  afterLoginUrl: string;
  afterLoginContent: string;
  conclusion: '通过' | '失败' | '未确认' | '跳过';
  failureReason: string;
};

function loginMethod(env: RuntimeEnv): LoginMethod {
  const configured = (env as RuntimeEnv & { loginMethod?: string }).loginMethod
    || process.env.E2E_LOGIN_METHOD;
  if (configured === 'phone') return 'phone';
  if (configured === 'email') return 'email';
  return 'password';
}

function selectLoginAccount(account: LoginAccount, retryCount = 0): string {
  if (retryCount > 0 && account.retry) return account.retry;
  return account.primary;
}

export async function loginScenario(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<ScenarioResult> {
  if (!options.page) {
    throw new Error('loginScenario requires a Playwright page.');
  }

  const startedAt = Date.now();
  const selectedLoginMethod = loginMethod(options.env);
  const emailAccount = selectLoginAccount(testAccounts.emailLogin[options.env.version], options.retryCount);
  const phoneAccount = selectLoginAccount(testAccounts.phoneLogin[options.env.version], options.retryCount);
  const passwordAccount = testAccounts.passwordLogin[options.env.version];
  const loginResult: CommonLoginResult = selectedLoginMethod === 'phone'
    ? await loginWithPhone(options.page, options.env, phoneAccount)
    : selectedLoginMethod === 'email'
      ? await loginWithEmail(options.page, options.env, emailAccount)
      : await loginWithPassword(options.page, options.env, passwordAccount);
  const passwordResult = selectedLoginMethod === 'password'
    ? loginResult as PasswordLoginResult
    : undefined;
  const phoneResult = selectedLoginMethod === 'phone'
    ? loginResult as PhoneLoginResult
    : undefined;
  const emailResult = selectedLoginMethod === 'email'
    ? loginResult as EmailLoginResult
    : undefined;
  const durationMs = Date.now() - startedAt;
  const finalUrl = loginResult.afterLoginUrl || options.page.url() || '未确认';
  const skipped = loginResult.conclusion === '跳过';
  const metadata = selectedLoginMethod === 'phone'
    ? { loginMethod: 'phone', phone: phoneResult?.maskedPhone, loginWaitDiagnostics: phoneResult?.loginWaitDiagnostics }
    : selectedLoginMethod === 'email'
      ? { loginMethod: 'email', email: emailResult?.maskedEmail, loginWaitDiagnostics: emailResult?.loginWaitDiagnostics }
      : { loginMethod: 'password' };
  const selectedMethod = selectedLoginMethod === 'phone'
    ? Boolean(phoneResult?.switchedToPhoneLogin)
    : selectedLoginMethod === 'email'
      ? Boolean(emailResult?.switchedToEmailLogin)
      : Boolean(passwordResult?.switchedToPasswordLogin);
  const filledCredential = selectedLoginMethod === 'phone'
    ? Boolean(phoneResult?.inputPhone)
    : selectedLoginMethod === 'email'
      ? Boolean(emailResult?.inputEmail)
      : Boolean(passwordResult?.inputAccount && passwordResult?.inputPassword);
  const requestedCode = selectedLoginMethod === 'phone'
    ? Boolean(phoneResult?.sentPhoneCode)
    : selectedLoginMethod === 'email'
      ? Boolean(emailResult?.sentEmailCode)
      : false;
  const receivedCode = selectedLoginMethod === 'phone'
    ? Boolean(phoneResult?.receivedSms && phoneResult?.extractedCode)
    : selectedLoginMethod === 'email'
      ? Boolean(emailResult?.receivedEmail && emailResult?.extractedCode)
      : false;
  const submittedLogin = selectedLoginMethod === 'phone'
    ? Boolean(phoneResult?.inputPhoneCode || phoneResult?.success)
    : selectedLoginMethod === 'email'
      ? Boolean(emailResult?.inputEmailCode || emailResult?.success)
      : Boolean(passwordResult?.clickedLogin);

  const steps: StepResult[] = [
    stepResult('openLoginPage', stepStatus(loginResult.fromHome && loginResult.foundLoginEntry, skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs: 0,
      issueType: loginResult.foundLoginEntry ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('selectLoginMethod', stepStatus(selectedMethod, skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs: 0,
      issueType: selectedMethod ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('fillCredential', stepStatus(filledCredential, skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs: 0,
      issueType: filledCredential ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('requestVerificationCode', stepStatus(requestedCode, selectedLoginMethod === 'password' || skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs: 0,
      issueType: requestedCode || selectedLoginMethod === 'password' ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('receiveVerificationCode', stepStatus(receivedCode, selectedLoginMethod === 'password' || skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs: 0,
      issueType: receivedCode || selectedLoginMethod === 'password' ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('submitLogin', stepStatus(submittedLogin, skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs: 0,
      issueType: submittedLogin ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('loginSuccess', stepStatus(loginResult.success, skipped), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: finalUrl,
      durationMs,
      issueType: loginResult.success ? undefined : loginResult.conclusion,
      metadata,
    }),
    stepResult('enterAppHome', stepStatus(loginResult.success, skipped), {
      message: loginResult.afterLoginContent,
      url: finalUrl,
      durationMs,
      issueType: loginResult.success ? undefined : loginResult.conclusion,
      metadata,
    }),
  ];

  return {
    scenario: 'login',
    version: options.version as Version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    success: loginResult.success,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps,
  };
}
