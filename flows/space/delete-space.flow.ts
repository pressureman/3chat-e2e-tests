import type { Frame, Locator, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeEnv } from '../../configs/env.cn';
import { getVisibleContentSummary, firstVisible } from '../login/login-common';
import { openAvatarMenu } from './add-space.flow';

const DEFAULT_PROTECTED_WORKSPACE_NAMES: Record<RuntimeEnv['version'], string> = {
  cn: '测试请忽略空间1的空间',
  intl: "TestIgnored001's Workspace",
};
const DEFAULT_MAX_DELETES = 50;
const WORKSPACE_LIST_LOAD_TIMEOUT = 10_000;
const WORKSPACE_LIST_STABLE_DURATION = 1_500;
const WORKSPACE_LIST_POLL_INTERVAL = 250;
const personalCenterPattern = /^(?:个人中心|Personal Center|Personal)$/i;
const workspaceManagementPattern = /^(?:空间管理|Workspace Management)$/i;
const deletePattern = /^(?:删除|Delete)$/i;

export type WorkspaceRow = {
  name: string;
  row: Locator;
};

export type DeleteSpaceResult = {
  success: boolean;
  protectedWorkspaceName: string;
  openedAvatarMenu: boolean;
  usedDirectProfileFallback: boolean;
  enteredPersonalCenter: boolean;
  openedWorkspaceManagement: boolean;
  protectedWorkspaceFound: boolean;
  initialWorkspaceNames: string[];
  deletedWorkspaceNames: string[];
  remainingWorkspaceNames: string[];
  deleteAttempts: number;
  finalUrl: string;
  finalVisibleContent: string;
  screenshotPath: string;
  failureStep: string;
  issue: string;
  exceptionType: string;
  suggestion: string;
};

type DeleteWorkspaceRowResult = {
  quotedText: string;
};

export type RunDeleteSpaceFlowOptions = {
  screenshotDir: string;
  protectedWorkspaceName?: string;
  maxDeletes?: number;
  initialPageStabilityWaitMs?: number;
};

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function configuredMaxDeletes(override?: number): number {
  if (Number.isInteger(override) && (override as number) >= 0) return override as number;
  const raw = process.env.E2E_DELETE_SPACE_MAX?.trim();
  if (!raw) return DEFAULT_MAX_DELETES;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_DELETES;
}

async function safeScreenshot(page: Page, screenshotDir: string): Promise<string> {
  await fs.mkdir(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, 'delete-space-result.png');
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  return screenshotPath;
}

async function visibleCandidate(candidates: Locator[], timeout: number): Promise<Locator> {
  return firstVisible(candidates, timeout);
}

type ProfileSurface = Page | Frame;

async function welcomePrimaryAction(
  page: Page,
  version: RuntimeEnv['version'],
  timeout = 2_000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  const actionPattern = version === 'cn'
    ? /^(?:立即搭建|Build Now)$/i
    : /^(?:Builder Now|Build Now)$/i;

  while (Date.now() < deadline) {
    for (const surface of page.frames()) {
      const dialogs = [
        surface.getByRole('dialog'),
        surface.locator('.ant-modal:visible'),
        surface.locator('[class*="modal"]:visible'),
      ];
      for (const dialogCandidate of dialogs) {
        const dialog = dialogCandidate.first();
        if (!await dialog.isVisible().catch(() => false)) continue;
        const action = dialog.getByRole('button', { name: actionPattern }).first();
        if (await action.isVisible().catch(() => false)) return action;
      }
    }
    await page.waitForTimeout(250);
  }

  return null;
}

async function dismissWelcomeModal(page: Page, version: RuntimeEnv['version']): Promise<boolean> {
  const action = await welcomePrimaryAction(page, version);
  if (!action) return false;

  await action.click({ force: true, timeout: 5_000 });
  await action.waitFor({ state: 'hidden', timeout: 10_000 });
  return true;
}

export type OpenPersonalCenterResult = {
  openedAvatarMenu: boolean;
  usedDirectProfileFallback: boolean;
};

async function profileSurface(page: Page, timeout = 15_000): Promise<ProfileSurface> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const surfaces: ProfileSurface[] = [
      ...page.frames().filter((frame) => frame !== page.mainFrame()),
      page,
    ];
    for (const surface of surfaces) {
      const tab = surface.getByRole('tab', { name: workspaceManagementPattern });
      if (await tab.first().isVisible().catch(() => false)) return surface;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Workspace Management / 空间管理未在个人中心页面或 iframe 中出现');
}

async function openPersonalCenterDirectly(page: Page): Promise<void> {
  const deadline = Date.now() + 10_000;
  const directUrl = new URL('/embedded-app/subapp?url=/butler/profile', page.url()).toString();
  let navigationError: unknown;

  await page.goto(directUrl, {
    waitUntil: 'domcontentloaded',
    timeout: Math.max(1, deadline - Date.now()),
  }).catch((error) => {
    navigationError = error;
  });

  const remaining = deadline - Date.now();
  if (remaining > 0) {
    await profileSurface(page, remaining).catch((error) => {
      navigationError = error;
    });
  }

  const ready = await page.frames().reduce(async (previous, frame) => {
    if (await previous) return true;
    return frame.getByRole('tab', { name: workspaceManagementPattern })
      .first()
      .isVisible()
      .catch(() => false);
  }, Promise.resolve(false));
  if (!ready) {
    const message = navigationError instanceof Error
      ? navigationError.message
      : 'Personal Center profile page was not ready within 10 seconds';
    throw new Error(`头像菜单打开失败，直访个人中心也失败：${message}`);
  }
}

function isButlerProfileRoute(page: Page): boolean {
  try {
    const currentUrl = new URL(page.url());
    const embeddedPath = currentUrl.searchParams.get('url');
    return currentUrl.pathname.startsWith('/butler/profile')
      || Boolean(embeddedPath?.startsWith('/butler/profile'));
  } catch {
    return /(?:^|\/)butler\/profile(?:[/?#]|$)/i.test(page.url());
  }
}

export async function openPersonalCenter(page: Page): Promise<OpenPersonalCenterResult> {
  try {
    await openAvatarMenu(page);
  } catch {
    await openPersonalCenterDirectly(page);
    return {
      openedAvatarMenu: false,
      usedDirectProfileFallback: true,
    };
  }

  const entry = await visibleCandidate([
    page.getByTestId('personal-center'),
    page.getByTestId('personal-center-menu-item'),
    page.getByRole('menuitem', { name: personalCenterPattern }),
    page.getByRole('button', { name: personalCenterPattern }),
    page.getByText(personalCenterPattern),
  ], 10_000);
  await entry.click({ force: true });

  await profileSurface(page);
  return {
    openedAvatarMenu: true,
    usedDirectProfileFallback: false,
  };
}

export async function openWorkspaceManagementTab(page: Page): Promise<void> {
  const surface = await profileSurface(page);
  const tab = await visibleCandidate([
    surface.getByRole('tab', { name: workspaceManagementPattern }),
    surface.getByTestId('workspace-management-tab'),
    surface.getByText(workspaceManagementPattern),
  ], 10_000);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await tab.click({ force: true }).catch(() => undefined);
    const selected = await tab.getAttribute('aria-selected').catch(() => null) === 'true';
    const panelVisible = await surface.getByRole('tabpanel', {
      name: workspaceManagementPattern,
    }).isVisible().catch(() => false);
    if (selected || panelVisible) return;
    await page.waitForTimeout(250);
  }
  throw new Error('Workspace Management / 空间管理 tab 点击后未切换为选中状态');
}

async function openWorkspaceManagementWithRecovery(
  page: Page,
  version: RuntimeEnv['version'],
): Promise<void> {
  try {
    await openWorkspaceManagementTab(page);
    return;
  } catch (firstError) {
    if (!isButlerProfileRoute(page)) {
      await openPersonalCenterDirectly(page);
    }

    const dismissedWelcomeModal = await dismissWelcomeModal(page, version);
    if (dismissedWelcomeModal) {
      // The welcome action can navigate or rebuild the embedded app. Re-enter profile
      // only after the modal is gone, then retry the Workspace Management tab.
      await openPersonalCenterDirectly(page);
    }

    try {
      await openWorkspaceManagementTab(page);
      return;
    } catch (retryError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
      throw new Error(`空间管理首次切换失败，恢复后重试仍失败：${retryMessage}；首次失败：${firstMessage}`);
    }
  }
}

async function reopenWorkspaceManagementAndCollectRows(
  page: Page,
  version: RuntimeEnv['version'],
): Promise<WorkspaceRow[]> {

  if (!isButlerProfileRoute(page)) {
    await openPersonalCenterDirectly(page);
  }

  await openWorkspaceManagementWithRecovery(page, version);
  return collectWorkspaceRows(page);
}

async function rowDeleteAction(row: Locator): Promise<Locator | null> {
  const candidates = [
    row.getByRole('button', { name: deletePattern }),
    row.getByRole('link', { name: deletePattern }),
    row.getByText(deletePattern),
  ];
  for (const candidate of candidates) {
    const target = candidate.first();
    if (await target.isVisible().catch(() => false)) return target;
  }

  const actionCell = row.locator('[role="gridcell"], td').last();
  const iconDeleteButton = actionCell.getByRole('button').last();
  if (await iconDeleteButton.isVisible().catch(() => false)) return iconDeleteButton;
  return null;
}

async function workspaceNameFromRow(row: Locator): Promise<string | undefined> {
  const cells = row.locator('[role="cell"], td');
  const cellCount = await cells.count();
  for (let index = 0; index < cellCount; index += 1) {
    const text = normalizedText(await cells.nth(index).innerText().catch(() => ''));
    if (text && !deletePattern.test(text) && !/^(?:操作|Actions?|Operation)$/i.test(text)) return text;
  }

  const rowText = normalizedText(await row.innerText().catch(() => ''));
  if (!rowText) return undefined;
  const withoutDelete = normalizedText(rowText.replace(/(?:删除|Delete)\s*$/i, ''));
  return withoutDelete || undefined;
}

async function scanWorkspaceRows(surface: ProfileSurface): Promise<WorkspaceRow[]> {
  const rows = surface.locator('.ant-table-row:visible, [role="row"]:visible, tr:visible');
  const count = await rows.count();
  const result: WorkspaceRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if (!await row.isVisible().catch(() => false)) continue;
    if (await row.locator('[role="columnheader"], th').count() > 0) continue;
    const name = await workspaceNameFromRow(row);
    if (
      !name
      || /^(?:空间名称|Space Name|Workspace Name|Name)$/i.test(name)
      || /^(?:暂无数据|无数据|数据为空|No Data|Data Empty)$/i.test(name)
    ) continue;
    result.push({ name, row });
  }

  return result;
}

async function workspaceListLoading(surface: ProfileSurface): Promise<boolean> {
  const indicators = [
    surface.locator('[aria-busy="true"]:visible'),
    surface.locator('.ant-spin-spinning:visible'),
    surface.locator('[data-loading="true"]:visible'),
  ];
  for (const indicator of indicators) {
    if (await indicator.first().isVisible().catch(() => false)) return true;
  }
  return false;
}

export async function collectWorkspaceRows(page: Page): Promise<WorkspaceRow[]> {
  const surface = await profileSurface(page);
  const deadline = Date.now() + WORKSPACE_LIST_LOAD_TIMEOUT;
  let lastSignature: string | undefined;
  let stableSince = 0;
  let lastRows: WorkspaceRow[] = [];

  while (Date.now() < deadline) {
    const result = await scanWorkspaceRows(surface);
    const signature = JSON.stringify(result.map(({ name }) => normalizedText(name)));
    const loading = await workspaceListLoading(surface);
    lastRows = result;

    if (!loading && signature === lastSignature) {
      if (stableSince === 0) {
        stableSince = Date.now();
      } else if (
        result.length > 0
        && Date.now() - stableSince >= WORKSPACE_LIST_STABLE_DURATION
      ) {
        return result;
      }
    } else {
      lastSignature = signature;
      stableSince = loading ? 0 : Date.now();
    }

    await page.waitForTimeout(Math.min(
      WORKSPACE_LIST_POLL_INTERVAL,
      Math.max(0, deadline - Date.now()),
    ));
  }

  return lastRows;
}

async function nextWorkspacePageButton(page: Page): Promise<Locator | null> {
  const surface = await profileSurface(page);
  const panel = surface.getByRole('tabpanel', { name: workspaceManagementPattern });
  const candidates = [
    panel.getByRole('button', { name: /^(?:下一页|Next|Next page)$/i }),
    panel.locator('.ant-pagination-next:not(.ant-pagination-disabled) button'),
    panel.locator('button[aria-label*="next" i]'),
  ];

  for (const candidate of candidates) {
    const button = candidate.first();
    if (!await button.isVisible().catch(() => false)) continue;
    if (await button.isDisabled().catch(() => true)) continue;
    if (await button.getAttribute('aria-disabled').catch(() => null) === 'true') continue;
    return button;
  }
  return null;
}

async function openNextWorkspacePage(page: Page): Promise<boolean> {
  const nextButton = await nextWorkspacePageButton(page);
  if (!nextButton) return false;
  await nextButton.click({ force: true });
  await page.waitForTimeout(WORKSPACE_LIST_POLL_INTERVAL);
  return true;
}

export async function findDeletableWorkspaceRow(
  page: Page,
  protectedWorkspaceName: string,
): Promise<WorkspaceRow | undefined> {
  const protectedName = normalizedText(protectedWorkspaceName);
  const rows = await collectWorkspaceRows(page);
  for (const workspaceRow of rows) {
    if (normalizedText(workspaceRow.name) === protectedName) continue;
    if (await rowDeleteAction(workspaceRow.row)) return workspaceRow;
  }
  return undefined;
}

export function extractQuotedText(text: string): string | undefined {
  const quotePatterns = [
    /“([^”]+)”/,
    /"([^"]+)"/,
    /「([^」]+)」/,
    /『([^』]+)』/,
    /'([^']+)'/,
  ];
  for (const pattern of quotePatterns) {
    const value = text.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

async function findVisibleDeleteDialog(page: Page, timeout = 10_000): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const candidates = [
        frame.getByRole('dialog'),
        frame.locator('.ant-modal:visible'),
        frame.locator('[class*="modal"]:visible'),
      ];
      for (const candidate of candidates) {
        const dialog = candidate.first();
        if (await dialog.isVisible().catch(() => false)) return dialog;
      }
    }
    await page.waitForTimeout(WORKSPACE_LIST_POLL_INTERVAL);
  }
  return null;
}

async function clickDeleteAction(action: Locator): Promise<void> {
  await action.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  await action.hover({ timeout: 3_000 }).catch(() => undefined);
  await action.click({ timeout: 5_000 }).catch(async () => {
    await action.click({ force: true, timeout: 5_000 });
  });
}

export async function deleteWorkspaceRow(page: Page, row: Locator): Promise<DeleteWorkspaceRowResult> {
  const deleteAction = await rowDeleteAction(row);
  if (!deleteAction) throw new Error('当前空间行未找到 Delete / 删除操作');
  await clickDeleteAction(deleteAction);

  let dialog = await findVisibleDeleteDialog(page, 5_000);
  if (!dialog) {
    const retryAction = await rowDeleteAction(row);
    if (!retryAction) throw new Error('重试时当前空间行未找到 Delete / 删除操作');
    await clickDeleteAction(retryAction);
    dialog = await findVisibleDeleteDialog(page, 10_000);
  }
  if (!dialog) throw new Error('删除操作点击两次后仍未出现确认弹窗');
  const dialogText = normalizedText(await dialog.innerText());
  const quotedText = extractQuotedText(dialogText);
  if (!quotedText) {
    throw new Error('删除确认弹窗没有可提取的引号文本，已停止删除');
  }

  const input = await visibleCandidate([
    dialog.getByRole('textbox'),
    dialog.locator('input'),
  ], 5_000).catch(() => null);
  if (!input) throw new Error('删除确认弹窗中未找到可填写的输入框');
  await input.fill(quotedText);
  if (await input.inputValue().catch(() => '') !== quotedText) {
    throw new Error('无法将弹窗引号文本填入确认输入框');
  }

  const confirm = await visibleCandidate([
    dialog.getByRole('button', { name: /^(?:确定|确认|Confirm)$/i }),
    dialog.getByText(/^(?:确定|确认|Confirm)$/i),
  ], 5_000).catch(() => null);
  if (!confirm) throw new Error('删除确认弹窗中未找到 Confirm / 确定按钮');
  await confirm.click({ force: true });
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Frame was detached/i.test(message)) throw error;
  });
  await page.waitForTimeout(800);
  return { quotedText };
}

function classifyFailure(message: string): string {
  if (/保护空间不存在/.test(message)) return '保护空间不存在';
  if (/最大删除次数/.test(message)) return '超过最大删除数量';
  if (/引号文本/.test(message)) return '删除确认文本缺失';
  if (/Personal Center|个人中心/.test(message)) return '个人中心入口未找到';
  if (/Workspace Management|空间管理/.test(message)) return '空间管理入口未找到';
  if (/Delete|删除操作/.test(message)) return '空间删除操作未找到';
  return '未确认';
}

export async function runDeleteSpaceFlow(
  page: Page,
  env: RuntimeEnv,
  options: RunDeleteSpaceFlowOptions,
): Promise<DeleteSpaceResult> {
  const protectedWorkspaceName = options.protectedWorkspaceName?.trim()
    || process.env.E2E_PROTECTED_WORKSPACE_NAME?.trim()
    || DEFAULT_PROTECTED_WORKSPACE_NAMES[env.version];
  const maxDeletes = configuredMaxDeletes(options.maxDeletes);
  const result: DeleteSpaceResult = {
    success: false,
    protectedWorkspaceName,
    openedAvatarMenu: false,
    usedDirectProfileFallback: false,
    enteredPersonalCenter: false,
    openedWorkspaceManagement: false,
    protectedWorkspaceFound: false,
    initialWorkspaceNames: [],
    deletedWorkspaceNames: [],
    remainingWorkspaceNames: [],
    deleteAttempts: 0,
    finalUrl: '',
    finalVisibleContent: '',
    screenshotPath: '',
    failureStep: '',
    issue: '',
    exceptionType: '',
    suggestion: '',
  };

  try {
    const initialPageStabilityWaitMs = Math.max(0, options.initialPageStabilityWaitMs || 0);
    if (initialPageStabilityWaitMs > 0) {
      result.failureStep = '等待新增空间页面稳定';
      await page.waitForTimeout(initialPageStabilityWaitMs);
    }

    result.failureStep = '进入个人中心';
    const dismissedWelcomeModal = await dismissWelcomeModal(page, env.version);
    const personalCenterResult = dismissedWelcomeModal
      ? await openPersonalCenterDirectly(page).then(() => ({
        openedAvatarMenu: false,
        usedDirectProfileFallback: true,
      }))
      : await openPersonalCenter(page);
    result.openedAvatarMenu = personalCenterResult.openedAvatarMenu;
    result.usedDirectProfileFallback = personalCenterResult.usedDirectProfileFallback;
    result.enteredPersonalCenter = true;

    result.failureStep = '切换空间管理';
    await openWorkspaceManagementWithRecovery(page, env.version);
    result.openedWorkspaceManagement = true;

    const initialRows = await collectWorkspaceRows(page);
    result.initialWorkspaceNames = initialRows.map(({ name }) => name);
    result.remainingWorkspaceNames = [...result.initialWorkspaceNames];
    result.protectedWorkspaceFound = result.initialWorkspaceNames.some(
      (name) => normalizedText(name) === normalizedText(protectedWorkspaceName),
    );
    if (!result.protectedWorkspaceFound) {
      result.failureStep = '确认保护空间存在';
      throw new Error(`保护空间不存在，已停止且未删除任何空间：${protectedWorkspaceName}`);
    }

    while (true) {
      // Deleting the active workspace can redirect the whole app back to Agent Builder.
      // Restore /butler/profile before reopening Workspace Management and reading a stable list.
      result.failureStep = '切换空间管理';
      let rows = await reopenWorkspaceManagementAndCollectRows(page, env.version);
      result.remainingWorkspaceNames = rows.map(({ name }) => name);
      let extras = rows.filter(
        ({ name }) => normalizedText(name) !== normalizedText(protectedWorkspaceName),
      );

      if (extras.length === 0 && await openNextWorkspacePage(page)) {
        rows = await collectWorkspaceRows(page);
        result.remainingWorkspaceNames = rows.map(({ name }) => name);
        extras = rows.filter(
          ({ name }) => normalizedText(name) !== normalizedText(protectedWorkspaceName),
        );
      }

      if (extras.length === 0) break;
      if (result.deleteAttempts >= maxDeletes) {
        result.failureStep = '删除多余空间';
        throw new Error(`已达到最大删除次数 ${maxDeletes}，仍有 ${extras.length} 个非保护空间`);
      }

      const target = await (async () => {
        for (const workspaceRow of extras) {
          if (await rowDeleteAction(workspaceRow.row)) return workspaceRow;
        }
        return undefined;
      })();
      if (!target) {
        result.failureStep = '删除多余空间';
        throw new Error('存在非保护空间，但当前行未找到 Delete / 删除操作');
      }

      result.failureStep = `删除空间：${target.name}`;
      await deleteWorkspaceRow(page, target.row);
      result.deletedWorkspaceNames.push(target.name);
      result.deleteAttempts += 1;
    }

    const onlyProtectedRemains = result.remainingWorkspaceNames.length === 1
      && normalizedText(result.remainingWorkspaceNames[0]) === normalizedText(protectedWorkspaceName);
    if (!onlyProtectedRemains) {
      result.failureStep = '确认仅剩保护空间';
      throw new Error(`最终空间列表不符合预期：${result.remainingWorkspaceNames.join(', ')}`);
    }

    result.success = true;
    result.failureStep = '';
    result.issue = '无';
    result.suggestion = '无';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.issue = message;
    result.exceptionType = classifyFailure(message);
    result.suggestion = result.protectedWorkspaceFound
      ? '根据失败步骤、页面可见内容和截图检查定位或删除确认流程。'
      : '核对 E2E_PROTECTED_WORKSPACE_NAME 与账号下的实际空间名称，确认后再重跑。';
  } finally {
    result.finalUrl = page.url() || '未确认';
    result.finalVisibleContent = await getVisibleContentSummary(page, 1200);
    result.screenshotPath = await safeScreenshot(page, options.screenshotDir);
  }

  return result;
}
