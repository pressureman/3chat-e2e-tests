import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../../configs/env.cn';
import { getEmailCode } from '../../helpers/aliyun-sms';
import { createTestEmail } from '../../helpers/test-email';
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
  waitForBuilder,
  waitForRegistrationOnboarding,
} from './register-common';

export type EmailRegisterFlowResult = {
  email: string;
  fromHome: boolean;
  clickedRegisterEntry: boolean;
  enteredRegisterPage: boolean;
  enteredEmailBranch: boolean;
  sentEmailCode: boolean;
  receivedEmail: boolean;
  extractedCode: boolean;
  inputEmailCode: boolean;
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

export type EmailRegisterFlowOptions = {
  env: RuntimeEnv;
  baseUrl: string;
  appOrigin?: string;
  password: string;
  workspaceName: string;
  contactPhone: string;
};

export async function runEmailRegisterFlow(
  page: Page,
  options: EmailRegisterFlowOptions,
): Promise<EmailRegisterFlowResult> {
  const result: EmailRegisterFlowResult = {
    email: '',
    fromHome: false,
    clickedRegisterEntry: false,
    enteredRegisterPage: false,
    enteredEmailBranch: false,
    sentEmailCode: false,
    receivedEmail: false,
    extractedCode: false,
    inputEmailCode: false,
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
    result.failureStep = '生成测试邮箱';
    result.email = createTestEmail();

    result.failureStep = '打开线上官网并点击注册入口';
    await openRegistrationFromHome(page, options.baseUrl, options.appOrigin);
    result.fromHome = true;
    result.clickedRegisterEntry = true;

    result.failureStep = '切换到注册模式';
    await ensureRegisterMode(page, options.appOrigin);
    result.enteredRegisterPage = true;

    result.failureStep = '选择邮箱注册';
    await clickFirstVisible([
      page.getByTestId('register-email-tab'),
      page.getByRole('tab', { name: /^(邮箱|Email)$/i }),
      page.getByText(/^(邮箱注册|邮箱|Email)$/i),
    ]);
    result.enteredEmailBranch = true;

    result.failureStep = '输入邮箱地址';
    await (await firstVisible([
      page.getByTestId('register-email-input'),
      page.getByLabel(/邮箱|Email/i),
      page.getByPlaceholder(/邮箱|Enter Email|Email address|Email/i),
      page.locator('input[type="email"]'),
    ])).fill(result.email);

    result.failureStep = '输入密码（如果页面需要）';
    await fillIfVisible(page.getByTestId('register-password-input'), options.password)
      || await fillIfVisible(page.getByLabel(/密码|Password/i), options.password)
      || await fillIfVisible(page.getByPlaceholder(/密码|Password/i), options.password)
      || await fillIfVisible(page.locator('input[type="password"]'), options.password);

    result.failureStep = '点击继续或获取验证码';
    const sentAt = Date.now();
    await clickFirstVisible([
      page.getByTestId('register-send-code-button'),
      page.getByTestId('register-continue-button'),
      page.getByRole('button', { name: /^(继续|获取验证码|发送验证码|下一步|Continue|Send code|Send verification code|Next)$/i }),
      page.getByText(/^(继续|获取验证码|发送验证码|下一步|Continue|Send code|Send verification code|Next)$/i),
    ]);
    result.sentEmailCode = true;

    result.failureStep = '等待并提取阿里云邮箱验证码';
    const code = await getEmailCode({
      email: result.email,
      sentAt,
      logConfig: options.env.smsLog,
    });
    result.receivedEmail = true;
    result.extractedCode = true;

    result.failureStep = '输入验证码';
    const verificationState = await completeRegisterCodeVerification(page, code);
    if (verificationState === 'failed') {
      throw new Error([
        '邮箱注册验证码提交后未进入 onboarding。',
        await verificationResultDiagnostic(page),
      ].join('\n'));
    }
    result.inputEmailCode = true;

    result.failureStep = '等待进入 onboarding';
    await waitForRegistrationOnboarding(page);
    result.passedCodeVerification = true;
    result.enteredOnboarding = true;

    result.failureStep = '完成动态 onboarding 字段';
    const onboarding = await completeRegistrationOnboarding(page, {
      contactName: 'E2ETest',
      workspaceName: options.workspaceName,
      phone: options.contactPhone,
    });
    result.filledWorkspaceName = onboarding.filledWorkspaceName;
    result.filledContactPhone = onboarding.filledPhone;

    result.failureStep = '点击完成';
    result.completedOnboarding = true;

    if (await waitForBuilder(page, 5_000)) {
      result.sawWelcomeModal = true;
      result.enteredBuilderPage = true;
      result.success = true;
      return result;
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
      result.success = true;
      return result;
    }

    result.failureStep = '点击立即体验 AI';
    await clickFirstVisible([
      page.getByTestId('welcome-start-experience-button'),
      page.getByTestId('welcome-start-build-button'),
      page.getByRole('button', { name: /立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build now|Get started|Experience|Continue/i }),
      page.getByText(/立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build now|Get started|Experience|Continue/i),
    ], 10_000);
    result.clickedStartExperience = true;

    result.failureStep = '确认进入搭建助手页面';
    result.enteredBuilderPage = await waitForBuilder(page, 60_000);
    if (!result.enteredBuilderPage) {
      throw new Error('Clicked start experience, but builder page was not reached.');
    }
    result.success = true;
  } catch (error) {
    result.failureMessage = error instanceof Error ? error.message : String(error);
  } finally {
    result.finalUrl = page.url() || '未确认';
    result.finalVisibleContent = await getVisibleContentSummary(page);
  }

  return result;
}
