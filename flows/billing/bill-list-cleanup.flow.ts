import type { Locator, Page } from '@playwright/test';
import { billingUrl } from '../../configs/billing-rules';
import type { RuntimeEnv } from '../../configs/env.cn';
import { visibleText, type BillingContentContext } from './subscription.flow';

export const BILL_LIST_PATH = '/user-hub/bill/list';

export const pendingPaymentStatusPattern = /待支付|Pending\s*Payment/i;
const billListPagePattern = /账单|Bill|Invoice|待支付|Pending\s*Payment|已支付|Paid|已取消|Cancelled|Canceled/i;
const moreActionPattern = /更多|More/i;
export const cancelBillActionPattern = /作废|取消|Cancel/i;
const confirmButtonPattern = /^(?:确定|确认|Confirm|OK|Yes)$/i;

const BILL_LIST_LOAD_TIMEOUT_MS = 30_000;
const BILL_LIST_STABLE_MS = 750;
const BILL_LIST_POLL_MS = 250;
const MAX_CANCEL_PASSES = 12;

export type PendingBillCleanupIssueType =
  | 'BILL_LIST_PAGE_NOT_REACHED'
  | 'PENDING_BILL_MORE_ACTION_NOT_FOUND'
  | 'PENDING_BILL_CANCEL_ACTION_NOT_FOUND'
  | 'PENDING_BILL_CANCEL_CONFIRM_FAILED'
  | 'PENDING_BILL_CANCEL_FAILED'
  | 'PENDING_BILLS_REMAINING';

export interface PendingBillCleanupResult {
  success: boolean;
  url?: string;
  message?: string;
  visibleText?: string;
  issueType?: PendingBillCleanupIssueType;
  metadata?: Record<string, unknown>;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function billingContexts(page: Page): BillingContentContext[] {
  return [
    ...page.frames().filter((frame) => frame !== page.mainFrame()),
    page,
  ];
}

async function findBillListContext(page: Page): Promise<BillingContentContext> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const context of billingContexts(page)) {
      const text = await visibleText(context, 1_500).catch(() => '');
      if (billListPagePattern.test(text)) return context;
    }
    await sleep(250);
  }
  return page;
}

async function listLoading(context: BillingContentContext): Promise<boolean> {
  const indicators = [
    context.locator('[aria-busy="true"]:visible'),
    context.locator('.ant-spin-spinning:visible'),
    context.locator('[data-loading="true"]:visible'),
    context.locator('.ant-skeleton:visible'),
  ];
  for (const indicator of indicators) {
    if (await indicator.first().isVisible().catch(() => false)) return true;
  }
  return false;
}

function dataRows(context: BillingContentContext): Locator {
  return context.locator('.ant-table-row:visible, [role="row"]:visible, tr:visible');
}

export function rowTextIndicatesPendingPayment(rowText: string): boolean {
  const normalized = normalizedText(rowText);
  if (!normalized) return false;
  if (/^(?:状态|Status|操作|Actions?|Action)$/i.test(normalized)) return false;
  return pendingPaymentStatusPattern.test(normalized);
}

async function isHeaderRow(row: Locator): Promise<boolean> {
  if (await row.locator('[role="columnheader"], th').count() > 0) return true;
  const text = normalizedText(await row.innerText().catch(() => ''));
  return /^(?:账单编号|Bill\s*ID|Bill\s*No|状态|Status|操作|Actions?)$/i.test(text);
}

export async function collectPendingPaymentRows(context: BillingContentContext): Promise<Locator[]> {
  const rows = dataRows(context);
  const count = await rows.count();
  const pending: Locator[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if (!await row.isVisible().catch(() => false)) continue;
    if (await isHeaderRow(row)) continue;
    const text = await row.innerText().catch(() => '');
    if (rowTextIndicatesPendingPayment(text)) pending.push(row);
  }

  return pending;
}

async function firstVisible(candidates: Locator[]): Promise<Locator | null> {
  for (const candidate of candidates) {
    const target = candidate.first();
    if (await target.isVisible({ timeout: 500 }).catch(() => false)) return target;
  }
  return null;
}

async function rowMoreAction(row: Locator): Promise<Locator | null> {
  const actionCell = row.locator('[role="gridcell"], td').last();
  const scoped = [
    row.getByRole('button', { name: moreActionPattern }),
    row.getByRole('link', { name: moreActionPattern }),
    row.locator('button, a, [role="button"]').filter({ hasText: moreActionPattern }),
    actionCell.getByRole('button', { name: moreActionPattern }),
    actionCell.locator('button, a, [role="button"]').filter({ hasText: moreActionPattern }),
  ];
  return firstVisible(scoped);
}

async function visibleCancelMenuItem(page: Page): Promise<Locator | null> {
  const surfaces = [
    page.locator('.ant-dropdown:visible'),
    page.locator('[role="menu"]:visible'),
    page.locator('.ant-popover:visible'),
    page,
  ];
  for (const surface of surfaces) {
    const item = await firstVisible([
      surface.getByRole('menuitem', { name: cancelBillActionPattern }),
      surface.getByRole('button', { name: cancelBillActionPattern }),
      surface.locator('li, [role="menuitem"], button, a').filter({ hasText: cancelBillActionPattern }),
    ]);
    if (item) return item;
  }
  return null;
}

async function confirmCancelDialog(page: Page): Promise<boolean> {
  const dialog = await firstVisible([
    page.locator('.ant-modal:visible'),
    page.locator('[role="dialog"]:visible'),
    page.locator('.ant-modal-confirm:visible'),
  ]);
  if (!dialog) return true;

  const confirm = await firstVisible([
    dialog.getByRole('button', { name: confirmButtonPattern }),
    dialog.locator('button').filter({ hasText: confirmButtonPattern }),
    page.locator('.ant-modal-confirm .ant-btn-primary:visible'),
    page.locator('.ant-modal .ant-btn-primary:visible'),
  ]);
  if (!confirm) return false;

  await confirm.click({ timeout: 5_000 }).catch(() => undefined);
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
  await sleep(400);
  return true;
}

async function cancelPendingBillRow(page: Page, row: Locator): Promise<{
  success: boolean;
  issueType?: PendingBillCleanupIssueType;
  message?: string;
}> {
  const more = await rowMoreAction(row);
  if (!more) {
    return {
      success: false,
      issueType: 'PENDING_BILL_MORE_ACTION_NOT_FOUND',
      message: '待支付账单行未找到 更多/More 操作入口。',
    };
  }

  await more.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
  await more.click({ timeout: 5_000 }).catch(() => undefined);
  await sleep(300);

  const cancelItem = await visibleCancelMenuItem(page);
  if (!cancelItem) {
    return {
      success: false,
      issueType: 'PENDING_BILL_CANCEL_ACTION_NOT_FOUND',
      message: '更多菜单中未找到 作废/取消/Cancel 操作。',
    };
  }

  await cancelItem.click({ timeout: 5_000 }).catch(() => undefined);
  const confirmed = await confirmCancelDialog(page);
  if (!confirmed) {
    return {
      success: false,
      issueType: 'PENDING_BILL_CANCEL_CONFIRM_FAILED',
      message: '取消账单后未找到可点击的确认按钮。',
    };
  }

  await sleep(500);
  return { success: true };
}

async function waitForStableBillList(context: BillingContentContext): Promise<void> {
  const deadline = Date.now() + BILL_LIST_LOAD_TIMEOUT_MS;
  let lastSignature = '';
  let stableSince = 0;

  while (Date.now() < deadline) {
    const pending = await collectPendingPaymentRows(context);
    const signature = `${pending.length}:${await dataRows(context).count()}`;
    const loading = await listLoading(context);

    if (!loading && signature === lastSignature) {
      if (stableSince === 0) {
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= BILL_LIST_STABLE_MS) {
        return;
      }
    } else {
      lastSignature = signature;
      stableSince = loading ? 0 : Date.now();
    }

    await sleep(BILL_LIST_POLL_MS);
  }
}

export async function navigateToBillList(page: Page, env: RuntimeEnv): Promise<PendingBillCleanupResult> {
  await page.goto(billingUrl(env.version, BILL_LIST_PATH), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

  const context = await findBillListContext(page);
  await waitForStableBillList(context);
  const text = await visibleText(context, 2_000).catch(() => '');
  const url = page.url();
  const reached = /\/user-hub\/bill\/list/.test(url) && billListPagePattern.test(text);

  return {
    success: reached,
    url,
    visibleText: text,
    message: reached ? '已进入账单列表页面。' : '未进入账单列表页面。',
    issueType: reached ? undefined : 'BILL_LIST_PAGE_NOT_REACHED',
  };
}

export async function cleanupPendingPaymentBills(
  page: Page,
  env: RuntimeEnv,
): Promise<PendingBillCleanupResult> {
  const navigation = await navigateToBillList(page, env);
  if (!navigation.success) return navigation;

  let context = await findBillListContext(page);
  let cancelledCount = 0;
  let lastFailure: PendingBillCleanupResult | undefined;

  for (let pass = 0; pass < MAX_CANCEL_PASSES; pass += 1) {
    await waitForStableBillList(context);
    const pendingRows = await collectPendingPaymentRows(context);
    if (pendingRows.length === 0) break;

    for (const row of pendingRows) {
      const cancelResult = await cancelPendingBillRow(page, row);
      if (!cancelResult.success) {
        lastFailure = {
          success: false,
          url: page.url(),
          message: cancelResult.message,
          issueType: cancelResult.issueType || 'PENDING_BILL_CANCEL_FAILED',
          metadata: {
            cancelledCount,
            pendingBeforePass: pendingRows.length,
            pass,
          },
        };
        continue;
      }
      cancelledCount += 1;
      context = await findBillListContext(page);
      await waitForStableBillList(context);
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    context = await findBillListContext(page);
  }

  await waitForStableBillList(context);
  const remaining = await collectPendingPaymentRows(context);
  if (remaining.length > 0) {
    return {
      success: false,
      url: page.url(),
      visibleText: await visibleText(context, 1_500).catch(() => ''),
      message: `账单列表仍残留 ${remaining.length} 条待支付记录。`,
      issueType: 'PENDING_BILLS_REMAINING',
      metadata: {
        cancelledCount,
        remainingPendingCount: remaining.length,
        lastFailureIssueType: lastFailure?.issueType,
      },
    };
  }

  return {
    success: true,
    url: page.url(),
    visibleText: await visibleText(context, 1_500).catch(() => ''),
    message: cancelledCount > 0
      ? `已取消 ${cancelledCount} 条待支付账单，列表已清空。`
      : '账单列表无待支付账单，无需清理。',
    metadata: {
      cancelledCount,
      remainingPendingCount: 0,
      recoveredAfterFailure: Boolean(lastFailure),
      lastFailureIssueType: lastFailure?.issueType,
    },
  };
}
