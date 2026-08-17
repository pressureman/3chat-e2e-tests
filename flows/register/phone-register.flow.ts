import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { getSmsCode, maskPhone } from '../../helpers/aliyun-sms';
import {
  recordRegisterPhoneSmsSent,
  waitForRegisterPhoneSmsCooldown,
} from '../../helpers/register-phone';
import type { TenantCleanupTracker } from '../../helpers/tenant-cleanup';
import { typeLikeUser } from '../login/login-common';
import {
  clickFirstVisible,
  completeRegisterCodeVerification,
  completeRegistrationOnboarding,
  fillIfVisible,
  firstVisible,
  getVisibleContentSummary,
  ensureRegisterMode,
  openRegistrationFromHome,
  verificationResultDiagnostic,
  waitForRegistrationOnboarding,
  waitForBuilder,
} from './register-common';

export type RegisterFailureReason =
  | 'PHONE_ALREADY_EXISTS'
  | 'CODE_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type PhoneRegisterFlowResult = {
  registerType: 'phone';
  phone: string;
  phones: string[];
  attempts: number;
  reason?: RegisterFailureReason;
  fromHome: boolean;
  clickedRegisterEntry: boolean;
  enteredRegisterPage: boolean;
  enteredPhoneBranch: boolean;
  sentPhoneCode: boolean;
  receivedSms: boolean;
  extractedCode: boolean;
  inputPhoneCode: boolean;
  passedCodeVerification: boolean;
  enteredOnboarding: boolean;
  filledWorkspaceName: boolean;
  filledContactPhone: boolean;
  completedOnboarding: boolean;
  sawWelcomeModal: boolean;
  clickedStartExperience: boolean;
  enteredBuilderPage: boolean;
  finalUrl: string;
  finalVisibleContent: string;
  failureStep: string;
  failureMessage: string;
  success: boolean;
};

export type PhoneRegisterFlowOptions = {
  env: RuntimeEnv;
  baseUrl: string;
  appOrigin?: string;
  password: string;
  workspaceName: string;
  contactPhone: string;
  phone: string;
  cleanupTracker: TenantCleanupTracker;
  cleanupDisableUrl: string;
  signal?: AbortSignal;
};

function sanitizeSensitive(value: string): string {
  return value
    .replace(/(?<!\*)\b\d{4,8}\b/g, '[code]')
    .replace(/\b1\d{10}\b/g, (phone) => maskPhone(phone));
}

async function visibleText(page: Page): Promise<string> {
  return (await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')).replace(/\s+/g, ' ');
}

async function detectRegisterFailure(page: Page): Promise<RegisterFailureReason | undefined> {
  const text = await visibleText(page);
  if (/已注册|已存在|账号存在|手机号.*占用|phone.*exist/i.test(text)) return 'PHONE_ALREADY_EXISTS';
  if (/验证码.*(错误|无效|过期|不正确)|code.*(invalid|wrong|expired)/i.test(text)) return 'CODE_ERROR';
  if (/网络|超时|请求失败|network|timeout|failed/i.test(text)) return 'NETWORK_ERROR';
  return undefined;
}

function classifyError(error: unknown, pageReason?: RegisterFailureReason): RegisterFailureReason {
  if (pageReason) return pageReason;
  const message = error instanceof Error ? error.message : String(error);
  if (/已注册|已存在|exist/i.test(message)) return 'PHONE_ALREADY_EXISTS';
  if (/验证码|code/i.test(message)) return 'CODE_ERROR';
  if (/network|fetch|timeout|timed out|请求|网络/i.test(message)) return 'NETWORK_ERROR';
  return 'UNKNOWN';
}

async function selectPhoneRegister(page: Page): Promise<void> {
  await clickFirstVisible([
    page.getByTestId('register-phone-tab'),
    page.getByRole('tab', { name: /手机|手机号|Phone/i }),
    page.getByText(/手机号注册|手机注册|手机号|Phone/i),
  ]);
}

async function fillPhone(page: Page, phone: string): Promise<void> {
  const input = await firstVisible([
    page.getByTestId('register-phone-input'),
    page.getByLabel(/手机号|手机|Phone/i),
    page.getByPlaceholder(/手机号|手机|Phone/i),
    page.locator('input[type="tel"]'),
  ]);
  await input.fill('');
  await typeLikeUser(page, input, phone);
}

async function submitOnboarding(page: Page, options: PhoneRegisterFlowOptions, result: PhoneRegisterFlowResult): Promise<void> {
  result.failureStep = '完成动态 onboarding 字段';
  const onboarding = await completeRegistrationOnboarding(page, {
    contactName: 'E2ETest',
    workspaceName: options.workspaceName,
    phone: result.phone,
  });
  result.filledWorkspaceName = onboarding.filledWorkspaceName;
  result.filledContactPhone = onboarding.filledPhone;

  result.failureStep = '点击完成';
  result.completedOnboarding = true;

  if (await waitForBuilder(page, 5_000)) {
    result.sawWelcomeModal = true;
    result.enteredBuilderPage = true;
    return;
  }

  result.failureStep = '等待进入系统并验证欢迎弹窗或首页';
  await firstVisible([
    page.getByTestId('welcome-modal'),
    page.getByRole('dialog', { name: /欢迎|恭喜|Welcome/i }),
    page.getByText(/欢迎|恭喜|首页|工作台|Dashboard|Workspace/i),
  ], 60_000);
  result.sawWelcomeModal = true;

  if (await waitForBuilder(page, 3_000)) {
    result.enteredBuilderPage = true;
    return;
  }

  result.failureStep = '点击立即体验 AI';
  await clickFirstVisible([
    page.getByTestId('welcome-start-experience-button'),
    page.getByTestId('welcome-start-build-button'),
    page.getByRole('button', { name: /立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build|Experience|Continue/i }),
    page.getByText(/立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build|Experience|Continue/i),
  ], 10_000);
  result.clickedStartExperience = true;

  result.failureStep = '确认进入搭建助手页面';
  result.enteredBuilderPage = await waitForBuilder(page, 60_000);
  if (!result.enteredBuilderPage) {
    throw new Error('Clicked start experience, but builder page was not reached.');
  }
}

async function runPhoneAttempt(
  page: Page,
  options: PhoneRegisterFlowOptions,
  result: PhoneRegisterFlowResult,
): Promise<RegisterFailureReason | undefined> {
  result.failureStep = '打开线上官网并点击注册入口';
  await openRegistrationFromHome(page, options.baseUrl, options.appOrigin);
  result.fromHome = true;
  result.clickedRegisterEntry = true;

  result.failureStep = '切换到注册模式';
  await ensureRegisterMode(page, options.appOrigin);
  result.enteredRegisterPage = true;

  result.failureStep = '选择手机号注册';
  await selectPhoneRegister(page);
  result.enteredPhoneBranch = true;

  const phone = options.phone;

  result.failureStep = '输入手机号';
  await fillPhone(page, phone);

  result.failureStep = '输入密码（如果页面需要）';
  await fillIfVisible(page.getByTestId('register-password-input'), options.password)
    || await fillIfVisible(page.getByLabel(/密码|Password/i), options.password)
    || await fillIfVisible(page.getByPlaceholder(/密码|Password/i), options.password)
    || await fillIfVisible(page.locator('input[type="password"]'), options.password);

  result.failureStep = '点击发送验证码';
  await waitForRegisterPhoneSmsCooldown(phone, { signal: options.signal });
  const sentAt = Date.now();
  await clickFirstVisible([
    page.getByTestId('register-send-code-button'),
    page.getByTestId('register-continue-button'),
    page.getByRole('button', { name: /^(?!Continue with\b).*(继续|获取验证码|发送验证码|下一步|Continue|Send Code|Get Code|Next).*$/i }),
  ]);
  await recordRegisterPhoneSmsSent(phone, sentAt);
  result.sentPhoneCode = true;

  const sendFailure = await detectRegisterFailure(page);
  if (sendFailure) return sendFailure;

  result.failureStep = '等待并提取阿里云短信验证码';
  const code = await getSmsCode({
    phone,
    sentAt,
    logConfig: options.env.smsLog,
  });
  result.receivedSms = true;
  result.extractedCode = true;

  result.failureStep = '输入验证码';
  const verificationState = await completeRegisterCodeVerification(page, code);
  if (verificationState === 'failed') {
    throw new Error([
      '手机号注册验证码提交后未进入 onboarding。',
      await verificationResultDiagnostic(page),
    ].join('\n'));
  }
  result.inputPhoneCode = true;

  const verificationFailure = await detectRegisterFailure(page);
  if (verificationFailure) return verificationFailure;

  result.failureStep = '等待进入 onboarding';
  await waitForRegistrationOnboarding(page);
  result.passedCodeVerification = true;
  result.enteredOnboarding = true;

  await options.cleanupTracker.captureRequiredCredentials(
    page.context(),
    {
      disableUrl: options.cleanupDisableUrl,
      source: 'onboarding',
      timeoutMs: 10_000,
      intervalMs: 300,
    },
  );

  await submitOnboarding(page, options, result);
  return undefined;
}

export async function runPhoneRegisterFlow(
  page: Page,
  options: PhoneRegisterFlowOptions,
): Promise<PhoneRegisterFlowResult> {
  const result: PhoneRegisterFlowResult = {
    registerType: 'phone',
    phone: options.phone,
    phones: [options.phone],
    attempts: 1,
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
    finalUrl: '',
    finalVisibleContent: '',
    failureStep: '',
    failureMessage: '',
    success: false,
  };

  try {
    try {
      result.reason = await runPhoneAttempt(page, options, result);
      if (!result.reason) {
        result.failureMessage = '';
        result.success = true;
        return result;
      }
    } catch (error) {
      result.reason = classifyError(error, await detectRegisterFailure(page));
      result.failureMessage = sanitizeSensitive(error instanceof Error ? error.message : String(error));
    }

    result.failureMessage ||= `手机号注册失败：${result.reason || 'UNKNOWN'}`;
  } catch (error) {
    result.reason = classifyError(error);
    result.failureMessage = sanitizeSensitive(error instanceof Error ? error.message : String(error));
  } finally {
    result.finalUrl = page.url() || '未确认';
    result.finalVisibleContent = sanitizeSensitive(await getVisibleContentSummary(page));
  }

  return result;
}
