import type { Locator, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeEnv } from '../../configs/env.cn';
import { testAccounts } from '../../configs/test-accounts';
import { formatWorkspaceTimestamp, yesNo } from '../../helpers/report';
import { currentDomain, detectVersionFromUrl, isBuilderUrl, type ProductVersion } from '../../helpers/url';
import {
  firstVisible,
  getVisibleContentSummary,
  typeLikeUser,
} from '../login/login-common';
import {
  type PasswordLoginResult,
} from '../login/password-login.flow';
import { completeSpaceOnboarding, type SpaceOnboardingResult } from './space-onboarding.flow';

export type AddSpaceConclusion = '通过' | '失败' | '部分通过' | '未确认' | '跳过';

const spaceSwitcherEntryPattern = /切换空间|切換空間|空间切换|空間切換|空间管理|空間管理|Switch workspace|Switch space|space switch/i;

export type AddSpaceStep = {
  step: string;
  status: string;
  url: string;
  note: string;
};

export type AddSpaceFlowOperationResult = {
  success: boolean;
  visible: boolean;
  clicked: boolean;
  url: string;
  message?: string;
};

export type AddSpaceResult = {
  startedAt: Date;
  finishedAt?: Date;
  reportName: string;
  reportDir: string;
  env: RuntimeEnv;
  loginResult: PasswordLoginResult;
  version: ProductVersion;
  domain: string;
  versionRule: ProductVersion;
  workspaceName: string;
  contactPhone: string;
  openedAvatarMenu: boolean;
  openedSpaceSwitcher: boolean;
  clickedAddSpace: boolean;
  filledWorkspaceName: boolean;
  clickedContinue: boolean;
  createdSpace: boolean;
  onboarding: SpaceOnboardingResult;
  sawWelcomeModal: boolean;
  foundConsultButton: boolean;
  clickedBuildNow: boolean;
  reachedBuilderPage: boolean;
  finalUrl: string;
  finalVisibleContent: string;
  screenshotPath: string;
  exceptionType: string;
  failureStep: string;
  issue: string;
  suggestion: string;
  conclusion: AddSpaceConclusion;
  success: boolean;
  unstableLocators: string[];
  steps: AddSpaceStep[];
};

export type RunAddSpaceFlowOptions = {
  screenshotDir: string;
};

function pushStep(result: AddSpaceResult, step: string, status: string, page: Page, note = ''): void {
  result.steps.push({ step, status, url: page.url() || '未确认', note });
}

async function safeScreenshot(page: Page, fileName: string, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${fileName.replace(/[^a-zA-Z0-9_-]/g, '-')}.png`);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => undefined);
  return filePath;
}

export async function openAvatarMenu(page: Page): Promise<AddSpaceFlowOperationResult> {
  const avatar = await findTopRightAvatar(page);
  await avatar.hover({ timeout: 5_000 });
  await waitForAvatarMenu(page, 8_000);
  return {
    success: true,
    visible: true,
    clicked: false,
    url: page.url() || '未确认',
  };
}

async function findTopRightAvatar(page: Page): Promise<Locator> {
  const candidates = [
    page.getByTestId('user-avatar'),
    page.getByTestId('header-user-avatar'),
    page.getByTestId('account-menu-button'),
    page.getByRole('navigation')
      .filter({ has: page.getByRole('button', { name: /订阅提醒|Subscription/i }) })
      .last()
      .getByRole('button')
      .last(),
    page.getByRole('button', { name: /账号|头像|个人|Profile|Account|User/i }),
  ];

  return firstVisible(candidates, 15_000);
}

async function waitForAvatarMenu(page: Page, timeout: number): Promise<void> {
  await firstVisible([
    page.getByRole('menu').getByText(/切换空间|个人中心|操作日志|隐私协议|退出登录|Switch workspace|Personal|Log out/i),
    page.getByText(/切换空间|个人中心|操作日志|隐私协议|退出登录|Switch workspace|Personal|Log out/i),
  ], timeout);
}

export async function openSpaceSwitcher(page: Page): Promise<AddSpaceFlowOperationResult> {
  await ensureSpaceSwitchMenuOpen(page, 10_000);
  return {
    success: true,
    visible: true,
    clicked: false,
    url: page.url() || '未确认',
  };
}

async function findSpaceSwitcherEntry(page: Page, timeout: number): Promise<Locator> {
  return firstVisible([
    page.getByTestId('space-switcher'),
    page.getByTestId('workspace-switcher'),
    page.getByRole('menuitem', { name: spaceSwitcherEntryPattern }),
    page.getByRole('button', { name: spaceSwitcherEntryPattern }),
    page.getByText(spaceSwitcherEntryPattern),
  ], timeout);
}

async function ensureSpaceSwitchMenuOpen(page: Page, timeout: number): Promise<Locator> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await openAvatarMenu(page);
      const switcher = await findSpaceSwitcherEntry(page, Math.min(2_000, Math.max(500, deadline - Date.now())));
      await switcher.hover({ timeout: 3_000 });
      await page.waitForTimeout(300);

      const addSpaceEntry = await findAddSpaceEntry(page, 1_500);
      if (addSpaceEntry) return addSpaceEntry;

      await switcher.click({ force: true, timeout: 3_000 }).catch((error) => {
        lastError = error;
      });
      await page.waitForTimeout(300);

      const addSpaceEntryAfterClick = await findAddSpaceEntry(page, 1_500);
      if (addSpaceEntryAfterClick) return addSpaceEntryAfterClick;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'Space switch submenu not visible');
}

async function waitForSpaceSwitchMenu(page: Page, timeout: number): Promise<void> {
  await firstVisible([
    page.getByTestId('add-space-button'),
    page.getByTestId('add-workspace-button'),
    page.getByRole('button', { name: /添加空间|新增空间|创建空间|Add workspace|Add space|Create workspace/i }),
    page.getByRole('menuitem', { name: /添加空间|新增空间|创建空间|Add workspace|Add space|Create workspace/i }),
    page.getByText(/添加空间|新增空间|创建空间|Add workspace|Add space|Create workspace/i),
  ], timeout);
}

export async function clickAddSpace(page: Page): Promise<AddSpaceFlowOperationResult> {
  await waitForSpaceSwitchMenu(page, 10_000).catch(() => undefined);
  const addSpaceEntry = await findAddSpaceEntry(page, 2_000) || await ensureSpaceSwitchMenuOpen(page, 10_000);
  if (addSpaceEntry) {
    await addSpaceEntry.click({ force: true });
    await page.waitForTimeout(800);
    return {
      success: true,
      visible: true,
      clicked: true,
      url: page.url() || '未确认',
    };
  }

  throw new Error('Add space entry not visible');
}

async function findAddSpaceEntry(page: Page, timeout = 2_000): Promise<Locator | null> {
  return firstVisible([
    page.getByTestId('add-space-button'),
    page.getByTestId('add-workspace-button'),
    page.getByRole('button', { name: /添加空间|新增空间|创建空间|Add workspace|Add space|Create workspace/i }),
    page.getByRole('menuitem', { name: /添加空间|新增空间|创建空间|Add workspace|Add space|Create workspace/i }),
    page.getByText(/添加空间|新增空间|创建空间|Add workspace|Add space|Create workspace/i),
  ], timeout).catch(() => null);
}

export async function submitSpaceName(page: Page, name: string): Promise<AddSpaceFlowOperationResult> {
  const input = await firstVisible([
    page.getByTestId('add-space-name-input'),
    page.getByTestId('workspace-name-input'),
    page.getByRole('textbox', { name: /空间名称|工作空间|Workspace name|Space name|Name the new space/i }),
    page.getByLabel(/空间名称|工作空间|Workspace name|Space name|Name the new space/i),
    page.getByPlaceholder(/空间名称|工作空间|Workspace name|Space name|Name the new space|Please enter the space name/i),
    page.getByRole('textbox'),
  ], 15_000);
  await typeLikeUser(page, input, name);

  const submit = await firstVisible([
    page.getByTestId('add-space-continue-button'),
    page.getByTestId('workspace-create-submit-button'),
    page.getByRole('button', { name: /继续|创建|确认|下一步|Continue|Create|Next|Confirm/i }),
    page.getByText(/继续|创建|确认|下一步|Continue|Create|Next|Confirm/i),
    page.getByRole('button').last(),
  ], 15_000);
  await submit.click({ force: true });

  await waitForAfterSpaceNameConfirm(page);

  return {
    success: true,
    visible: true,
    clicked: true,
    url: page.url() || '未确认',
  };
}

async function waitForAfterSpaceNameConfirm(page: Page): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const url = page.url();
    const stillOnCreateAccount = /\/butler\/create-account/i.test(url);

    if (!stillOnCreateAccount
      || /onboarding|builder|assistant|embedded-app|subapp/i.test(url)) {
      return;
    }

    await page.waitForTimeout(750);
  }

  throw new Error('Space name confirmed but next state was not visible');
}

async function waitForBuilder(page: Page): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (isBuilderUrl(url)) return true;
    const body = await getVisibleContentSummary(page, 1500);
    if (/飞书|会议预约|404|无权限|白屏|登录/i.test(body) && !/搭建助手|Builder|Assistant/i.test(body)) return false;
    await page.waitForTimeout(750);
  }
  return false;
}

export async function runAddSpaceFlow(
  page: Page,
  env: RuntimeEnv,
  loginResult: PasswordLoginResult,
  options: RunAddSpaceFlowOptions,
): Promise<AddSpaceResult> {
  const startedAt = new Date();
  const workspacePrefix = process.env.E2E_WORKSPACE_NAME || 'E2ETest';
  const workspaceName = `${workspacePrefix}_${formatWorkspaceTimestamp(startedAt)}`;
  const contactPhone = process.env.E2E_CONTACT_PHONE || '15000000001';
  const reportName = 'add-space';
  const { screenshotDir } = options;
  const result: AddSpaceResult = {
    startedAt,
    reportName,
    reportDir: screenshotDir,
    env,
    loginResult,
    version: '未确认',
    domain: '未确认',
    versionRule: '未确认',
    workspaceName,
    contactPhone,
    openedAvatarMenu: false,
    openedSpaceSwitcher: false,
    clickedAddSpace: false,
    filledWorkspaceName: false,
    clickedContinue: false,
    createdSpace: false,
    onboarding: {
      enteredOnboarding: false,
      filledName: false,
      filledPhone: false,
      clickedFinish: false,
      enteredSystem: false,
      requiredFieldChanged: false,
      issue: '',
    },
    sawWelcomeModal: false,
    foundConsultButton: false,
    clickedBuildNow: false,
    reachedBuilderPage: false,
    finalUrl: '',
    finalVisibleContent: '',
    screenshotPath: '',
    exceptionType: '',
    failureStep: '',
    issue: '',
    suggestion: '',
    conclusion: '未确认',
    success: false,
    unstableLocators: [],
    steps: [],
  };

  try {
    if (!loginResult.success) {
      result.conclusion = loginResult.conclusion === '跳过' ? '跳过' : '失败';
      result.exceptionType = loginResult.conclusion === '跳过' ? '跳过：缺少账号配置' : '登录失败';
      result.failureStep = '账号密码登录';
      result.issue = loginResult.failureReason || '登录失败，后续添加空间场景跳过。';
      result.suggestion = '确认测试账号、密码和被测环境登录入口后重跑。';
      pushStep(result, '账号密码登录', result.conclusion, page, result.issue);
      return result;
    }

    result.version = detectVersionFromUrl(page.url(), await getVisibleContentSummary(page, 1000));
    result.domain = currentDomain(page.url());
    result.versionRule = result.version;
    pushStep(result, '判断当前版本', result.version === '未确认' ? '未确认' : '通过', page, result.version);
    if (result.version === '未确认') {
      result.conclusion = '未确认';
      result.exceptionType = '当前版本未确认';
      result.failureStep = '判断当前登录版本';
      result.issue = '无法根据 URL 或页面内容判断国内版/国际版。';
      result.suggestion = '补充稳定的环境域名或页面版本标识。';
      return result;
    }

    result.failureStep = '打开头像菜单';
    result.openedAvatarMenu = (await openAvatarMenu(page)).success;
    pushStep(result, '悬停/打开头像菜单', '通过', page);
    result.failureStep = '打开切换空间入口';
    result.openedSpaceSwitcher = (await openSpaceSwitcher(page)).success;
    pushStep(result, '打开切换空间入口', '通过', page);
    result.failureStep = '点击添加空间';
    result.clickedAddSpace = (await clickAddSpace(page)).clicked;
    pushStep(result, '点击添加空间', '通过', page);

    result.failureStep = '输入空间名称并继续';
    const submitSpaceNameResult = await submitSpaceName(page, workspaceName);
    result.filledWorkspaceName = submitSpaceNameResult.success;
    result.clickedContinue = submitSpaceNameResult.clicked;
    result.createdSpace = submitSpaceNameResult.success;
    pushStep(result, '输入空间名称并继续', '通过', page, workspaceName);

    result.onboarding = await completeSpaceOnboarding(page, workspaceName, contactPhone);
    pushStep(
      result,
      '完成 onboarding / 问卷',
      result.onboarding.enteredSystem ? '通过' : '失败',
      page,
      result.onboarding.issue,
    );
    if (!result.onboarding.enteredSystem) {
      result.conclusion = '失败';
      result.exceptionType = result.onboarding.enteredOnboarding ? '下发账单后未进入系统' : '未进入 onboarding';
      result.failureStep = 'onboarding / 问卷';
      result.issue = result.onboarding.issue || '未完成问卷或未进入系统。';
      result.suggestion = '确认新增空间后的问卷字段、完成按钮和账单下发状态。';
      return result;
    }

    result.reachedBuilderPage = await waitForBuilder(page);
    pushStep(
      result,
      '欢迎弹窗点击主动作',
      result.reachedBuilderPage ? '跳过' : '失败',
      page,
      result.reachedBuilderPage ? '已通过 /butler/agent/builder URL 判断成功，不再依赖欢迎弹窗。' : '未进入搭建助手 URL。',
    );

    pushStep(result, '验证进入搭建助手', result.reachedBuilderPage ? '通过' : '失败', page);
    result.success = result.reachedBuilderPage;

    if (result.reachedBuilderPage) {
      result.conclusion = '通过';
      result.issue = '无';
      result.suggestion = '保持当前回归覆盖。';
    } else {
      result.conclusion = '失败';
      result.exceptionType = '未进入搭建助手页';
      result.failureStep = '进入搭建助手';
      result.issue = '新增空间后未进入 /butler/agent/builder。';
      result.suggestion = '检查新增空间后的路由、权限和初始化状态。';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.conclusion = '失败';
    result.failureStep = result.failureStep || result.steps[result.steps.length - 1]?.step || '未确认';
    result.issue = message;
    result.exceptionType = classifyException(message, result);
    result.suggestion = suggestFix(result.exceptionType);
    result.unstableLocators = [
      'user-avatar/header-user-avatar',
      'space-switcher/workspace-switcher',
      'add-space-button/add-workspace-button',
      'add-space-name-input/workspace-name-input',
    ];
    pushStep(result, result.failureStep, '失败', page, message);
  } finally {
    result.finishedAt = new Date();
    result.finalUrl = page.url() || '未确认';
    result.finalVisibleContent = await getVisibleContentSummary(page, 800);
    result.screenshotPath = await safeScreenshot(page, 'add-space-result', screenshotDir);
  }

  return result;
}

function classifyException(message: string, result: AddSpaceResult): string {
  if (/No matching visible locator/.test(message)) {
    if (!result.openedAvatarMenu) return '头像入口未找到';
    if (!result.openedSpaceSwitcher) return '切换空间入口未找到';
    if (!result.clickedAddSpace) return '添加空间按钮未找到';
    if (!result.filledWorkspaceName) return '空间名称输入失败';
    if (!result.onboarding.enteredOnboarding) return '未进入 onboarding';
    if (!result.clickedBuildNow) return '欢迎弹窗缺少主动作按钮';
    return 'locator 不稳定';
  }
  if (/404/.test(message)) return '页面 404';
  if (/权限|permission/i.test(message)) return '权限异常';
  return '未确认';
}

function suggestFix(exceptionType: string): string {
  if (/locator|入口|按钮|输入/.test(exceptionType)) {
    return '建议前端补充稳定 data-testid，并避免依赖 hover 菜单的瞬时状态。';
  }
  if (exceptionType === '登录失败') return '确认账号密码、登录入口和登录态冲突弹窗。';
  if (exceptionType === '未进入搭建助手页') return '检查欢迎弹窗主动作按钮路由、权限和新增空间初始化状态。';
  return '根据失败步骤、截图和页面可见内容定位产品流程或等待条件变化。';
}

export function buildAddSpaceReport(result: AddSpaceResult): string {
  const stepRows = result.steps.length
    ? result.steps.map((step) => `| ${step.step} | ${step.status} | ${step.url} | ${step.note || '无'} |`).join('\n')
    : '| 未执行 | 未确认 | 未确认 | 无 |';

  const overall = result.loginResult.conclusion === '失败'
    ? '失败'
    : result.version === '未确认'
      ? '未确认'
      : result.conclusion;

  return [
    '# 3Chat 添加空间测试报告',
    '',
    `执行时间：${result.finishedAt ? result.finishedAt.toLocaleString() : result.startedAt.toLocaleString()}`,
    '',
    '## 一）登录结果',
    '',
    `是否从官网进入：${yesNo(result.loginResult.fromHome)}`,
    `是否找到登录入口：${yesNo(result.loginResult.foundLoginEntry)}`,
    '登录方式：账号密码登录',
    `登录账号：${testAccounts.passwordLogin[result.env.version].email || '未配置'}`,
    `是否成功输入账号：${yesNo(result.loginResult.inputAccount)}`,
    `是否成功输入密码：${yesNo(result.loginResult.inputPassword)}`,
    `是否点击登录：${yesNo(result.loginResult.clickedLogin)}`,
    `是否登录成功：${yesNo(result.loginResult.success)}`,
    `登录后 URL：${result.loginResult.afterLoginUrl || '未确认'}`,
    `本阶段结论：${result.loginResult.conclusion}`,
    '',
    '## 二）当前版本判断结果',
    '',
    `当前登录版本：${result.version}`,
    `当前系统域名：${result.domain}`,
    `使用判断标准：${result.versionRule}`,
    '',
    '## 三）添加空间测试结果',
    '',
    '测试入口：头像菜单 / 切换空间 / 添加空间',
    `是否成功打开头像菜单：${yesNo(result.openedAvatarMenu)}`,
    `是否成功进入切换空间：${yesNo(result.openedSpaceSwitcher)}`,
    `是否成功点击添加空间：${yesNo(result.clickedAddSpace)}`,
    `本次空间名称：${result.workspaceName}`,
    `是否成功创建空间：${yesNo(result.createdSpace)}`,
    `是否进入 onboarding：${yesNo(result.onboarding.enteredOnboarding)}`,
    `是否填写名称：${yesNo(result.onboarding.filledName)}`,
    `是否填写手机号：${yesNo(result.onboarding.filledPhone)}`,
    `是否点击完成：${yesNo(result.onboarding.clickedFinish)}`,
    `是否成功进入系统：${yesNo(result.onboarding.enteredSystem)}`,
    `是否出现欢迎弹窗：${yesNo(result.sawWelcomeModal)}`,
    `欢迎弹窗是否存在咨询/预约按钮：${yesNo(result.foundConsultButton)}`,
    `是否点击欢迎弹窗主动作：${yesNo(result.clickedBuildNow)}`,
    `是否成功进入搭建助手：${yesNo(result.reachedBuilderPage)}`,
    `最终 URL：${result.finalUrl}`,
    `本场景结论：${result.conclusion}`,
    '',
    '## 四）步骤明细',
    '',
    '| 步骤 | 状态 | URL | 说明 |',
    '| --- | --- | --- | --- |',
    stepRows,
    '',
    '## 五）异常信息',
    '',
    result.conclusion === '通过'
      ? '异常信息：无'
      : [
          `异常类型：${result.exceptionType || '未确认'}`,
          `失败步骤：${result.failureStep || '未确认'}`,
          `当前 URL：${result.finalUrl}`,
          `页面可见内容：${result.finalVisibleContent}`,
          `截图位置：${result.screenshotPath || '未确认'}`,
          `初步判断：${result.issue || '未确认'}`,
          `建议修复：${result.suggestion || '未确认'}`,
        ].join('\n'),
    '',
    '## 六）整体结论',
    '',
    `登录结果：${result.loginResult.conclusion}`,
    `当前版本：${result.version}`,
    `添加空间测试结果：${result.conclusion}`,
    `整体结论：${overall}`,
    `下一步建议：${result.suggestion || '无'}`,
    '',
    '## 七）可测试性建议',
    '',
    `是否有不稳定 locator：${result.unstableLocators.length ? '是' : '未发现'}`,
    `是否建议前端补 data-testid：${result.unstableLocators.length ? '是' : '否'}`,
    result.unstableLocators.length ? `建议补充：${result.unstableLocators.join(', ')}` : '建议补充：无',
    '',
  ].join('\n');
}
