import type { Frame, Locator, Page } from '@playwright/test';
import { billingUrl, subscriptionBillingRule } from '../../configs/billing-rules';
import type { BillingCycle } from '../../configs/billing-rules';
import type { RuntimeEnv } from '../../configs/env.cn';

export type BillingContentContext = Page | Frame;

export type SubscriptionBillingIssueType =
  | 'SUBSCRIPTION_PAGE_NOT_REACHED'
  | 'RENEW_BUTTON_NOT_FOUND'
  | 'RENEW_BUTTON_DISABLED'
  | 'RENEW_CLICK_FAILED'
  | 'CREATE_BILL_PAGE_NOT_REACHED'
  | 'AGREEMENT_NOT_FOUND'
  | 'AGREEMENT_NOT_ACCEPTED'
  | 'CREATE_BILL_BUTTON_NOT_FOUND'
  | 'CREATE_BILL_BUTTON_DISABLED'
  | 'CREATE_BILL_FAILED'
  | 'PAYMENT_METHOD_PAGE_NOT_REACHED';

export interface SubscriptionFlowResult {
  success: boolean;
  url?: string;
  message?: string;
  visibleText?: string;
  issueType?: SubscriptionBillingIssueType;
  metadata?: Record<string, unknown>;
}

export interface BillingCycleSelectionResult {
  found: boolean;
  visible: boolean;
  enabled: boolean;
  clicked: boolean;
  selected: boolean;
  selectedStateEvidence?: string;
  message?: string;
}

const subscriptionPagePattern = /我的订阅|My Subscription|Subscription|Package Info|Active|续费|Renew/i;
const createBillPagePattern = /创建账单|账单|协议|Create bill|Create Bill|Invoice|Agreement|Bill Details|Contracting Party/i;
const paymentMethodPagePattern = /选择支付方式|支付方式|付款方式|支付渠道|支付宝|支付宝支付|信用卡|银行卡支付|对公转账|银行转账|上传凭证|Payment method|Pay with|Alipay|Credit card|Stripe|Bank transfer|Wire transfer|Upload voucher|Upload receipt/i;
const RENEW_BUTTON_WAIT_MS = 30_000;
const RENEW_PAGE_RETRY_LIMIT = 2;

export async function visibleText(context: BillingContentContext, limit = 800): Promise<string> {
  const text = await context.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findBillingContext(page: Page): Promise<BillingContentContext> {
  const marker = new RegExp(`${subscriptionPagePattern.source}|${createBillPagePattern.source}|${paymentMethodPagePattern.source}`, 'i');
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    for (const frame of page.frames().filter((frame) => frame !== page.mainFrame())) {
      const text = await visibleText(frame, 1_500).catch(() => '');
      if (marker.test(text)) return frame;
    }

    const text = await visibleText(page, 1_500).catch(() => '');
    if (marker.test(text)) return page;
    await sleep(250);
  }

  return page;
}

async function waitForStableContent(page: Page, matcher: RegExp, timeout = 30_000): Promise<{
  context: BillingContentContext;
  text: string;
} | null> {
  const deadline = Date.now() + timeout;
  let lastText = '';
  let stableHits = 0;

  while (Date.now() < deadline) {
    const context = await findBillingContext(page);
    const text = await visibleText(context, 3_000).catch(() => '');
    const normalized = text.replace(/\s+/g, ' ').trim();
    const loading = /loading|加载中|skeleton/i.test(normalized);

    if (matcher.test(normalized) && !loading) {
      stableHits = normalized === lastText ? stableHits + 1 : 1;
      if (stableHits >= 2) return { context, text: normalized };
    } else {
      stableHits = 0;
    }

    lastText = normalized;
    await sleep(250);
  }

  return null;
}

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.first().isVisible({ timeout: 1_000 }).catch(() => false);
}

async function isEnabled(locator: Locator): Promise<boolean> {
  const target = locator.first();
  const playwrightEnabled = await target.isEnabled({ timeout: 1_000 }).catch(() => true);
  const domDisabled = await target.evaluate((node) => {
    const element = node as HTMLElement;
    return Boolean(element.closest('button:disabled, input:disabled, [disabled], [aria-disabled="true"]'));
  }).catch(() => false);
  return playwrightEnabled && !domDisabled;
}

async function firstVisible(locators: Locator[], timeout = 10_000): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      if (await isVisible(locator)) return locator.first();
    }
    await sleep(250);
  }
  return null;
}

function billingCycleText(cycle: BillingCycle): RegExp {
  return cycle === 'monthly'
    ? /月付|按月|月度|Monthly|Month|Pay Monthly/i
    : /季付|季度|按季|Quarterly|Quarter|Pay Quarterly/i;
}

function billingCycleCandidates(context: BillingContentContext, cycle: BillingCycle): Locator[] {
  const text = billingCycleText(cycle);
  return [
    context.getByRole('tab', { name: text }),
    context.getByRole('radio', { name: text }),
    context.getByRole('button', { name: text }),
    context.getByLabel(text),
    context.getByText(text),
    context.locator('.ant-radio-wrapper, [role="radio"], [role="tab"], [data-slot="tab"], button, label, [data-testid]').filter({ hasText: text }),
  ];
}

async function resolveClickableAncestor(
  context: BillingContentContext,
  candidate: Locator,
  markerPrefix: string,
): Promise<Locator | null> {
  const marker = `${markerPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const marked = await candidate.evaluate((node, value) => {
    const markerValue = value as string;
    const isVisible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    let current = node as HTMLElement | null;
    while (current && current !== document.body) {
      const role = current.getAttribute('role') || '';
      const className = String(current.className || '');
      const clickable = current.tagName === 'BUTTON'
        || current.tagName === 'A'
        || current.tagName === 'LABEL'
        || role === 'button'
        || role === 'radio'
        || role === 'tab'
        || current.getAttribute('data-slot') === 'tab'
        || current.hasAttribute('onclick')
        || /button|btn|radio-wrapper|tab|cursor-pointer|clickable/i.test(className)
        || window.getComputedStyle(current).cursor === 'pointer';
      if (clickable && isVisible(current)) {
        current.setAttribute('data-e2e-billing-cycle-click-target', markerValue);
        return true;
      }
      current = current.parentElement;
    }

    return false;
  }, marker).catch(() => false);

  if (!marked) return null;
  const target = context.locator(`[data-e2e-billing-cycle-click-target="${marker}"]`).first();
  return await target.isVisible().catch(() => false) ? target : null;
}

async function readSelectedState(locator: Locator): Promise<{
  selected: boolean;
  evidence?: string;
  stableStateAvailable: boolean;
}> {
  const checked = await locator.isChecked({ timeout: 500 }).catch(() => undefined);
  if (checked === true) return { selected: true, evidence: 'locator.isChecked() === true', stableStateAvailable: true };

  return locator.evaluate((node) => {
    const root = node as HTMLElement;
    const scopedRoots = new Set<HTMLElement>([root]);
    let current = root.parentElement;
    while (current && current !== document.body) {
      if (
        current.getAttribute('role') === 'tab'
        || current.getAttribute('role') === 'radio'
        || current.getAttribute('data-slot') === 'tab'
        || current.matches('button, label, [data-testid]')
      ) {
        scopedRoots.add(current);
        break;
      }
      current = current.parentElement;
    }

    const elements = Array.from(scopedRoots).flatMap((element) => [
      element,
      ...Array.from(element.querySelectorAll<HTMLElement>('*')),
    ]);
    for (const element of elements) {
      const input = element as HTMLInputElement;
      if ((input.type === 'radio' || input.type === 'checkbox') && input.checked) {
        return { selected: true, evidence: `${input.tagName.toLowerCase()}[checked]`, stableStateAvailable: true };
      }
      if (element.getAttribute('aria-checked') === 'true') {
        return { selected: true, evidence: 'aria-checked=true', stableStateAvailable: true };
      }
      if (element.getAttribute('aria-selected') === 'true') {
        return { selected: true, evidence: 'aria-selected=true', stableStateAvailable: true };
      }
      const dataSelected = element.getAttribute('data-selected');
      if (dataSelected === '' || dataSelected === 'true') {
        return { selected: true, evidence: dataSelected === '' ? 'data-selected' : 'data-selected=true', stableStateAvailable: true };
      }
      const dataState = element.getAttribute('data-state');
      if (dataState && /checked|selected|active/i.test(dataState)) {
        return { selected: true, evidence: `data-state=${dataState}`, stableStateAvailable: true };
      }
      const className = String(element.className || '');
      if (/(^|\s|-)checked(\s|$|-)|(^|\s|-)selected(\s|$|-)|(^|\s|-)active(\s|$|-)/i.test(className)) {
        return { selected: true, evidence: `class=${className.slice(0, 120)}`, stableStateAvailable: true };
      }
    }

    const stableStateAvailable = elements.some((element) => (
      element.hasAttribute('aria-checked')
      || element.hasAttribute('aria-selected')
      || element.hasAttribute('data-selected')
      || element.hasAttribute('data-state')
      || element.matches('input[type="radio"], input[type="checkbox"]')
    ));
    return { selected: false, stableStateAvailable };
  }).catch(() => ({ selected: false, stableStateAvailable: false }));
}

async function waitForSelectedState(locator: Locator): Promise<{
  selected: boolean;
  evidence?: string;
  stableStateAvailable: boolean;
}> {
  const deadline = Date.now() + 5_000;
  let lastState = { selected: false, stableStateAvailable: false } as {
    selected: boolean;
    evidence?: string;
    stableStateAvailable: boolean;
  };

  while (Date.now() < deadline) {
    lastState = await readSelectedState(locator);
    if (lastState.selected) return lastState;
    await sleep(250);
  }

  return lastState;
}

async function clickAndCaptureAppNavigation(page: Page, target: Locator): Promise<boolean> {
  const beforeUrl = page.url();
  const popupPromise = page.waitForEvent('popup', { timeout: 5_000 }).catch(() => null);
  await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
  await target.click({ timeout: 5_000 });

  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
    const popupUrl = popup.url();
    if (/app\.3chatai\.cn|app\.3chat\.ai/.test(popupUrl)) {
      await page.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined);
    }
    await popup.close().catch(() => undefined);
    return true;
  }

  await page.waitForFunction((url) => window.location.href !== url, beforeUrl, { timeout: 8_000 }).catch(() => undefined);
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
  return true;
}

function result(
  page: Page,
  success: boolean,
  options: Omit<SubscriptionFlowResult, 'success' | 'url'> = {},
): SubscriptionFlowResult {
  return {
    success,
    url: page.url(),
    ...options,
  };
}

export async function enterSubscriptionPage(page: Page, env: RuntimeEnv): Promise<SubscriptionFlowResult> {
  await page.goto(billingUrl(env.version, subscriptionBillingRule.path), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

  const stable = await waitForStableContent(
    page,
    new RegExp(`${subscriptionPagePattern.source}|${createBillPagePattern.source}|${paymentMethodPagePattern.source}`, 'i'),
    25_000,
  );
  const text = stable?.text || await visibleText(page, 1_500).catch(() => '');
  const url = page.url();
  const reached = /\/user-hub\/package\/detail|\/user-hub\/package\/operation\/|\/user-hub\/bill\/\d+\/payment/.test(url)
    || subscriptionPagePattern.test(text)
    || createBillPagePattern.test(text)
    || paymentMethodPagePattern.test(text);

  return result(page, reached, {
    visibleText: text,
    message: reached ? '已进入我的订阅页面或续费下单流程。' : '未进入我的订阅页面。',
    issueType: reached ? undefined : 'SUBSCRIPTION_PAGE_NOT_REACHED',
  });
}

function renewButtonCandidates(context: BillingContentContext): Locator[] {
  return [
    context.getByRole('button', { name: subscriptionBillingRule.renewText }),
    context.getByRole('link', { name: subscriptionBillingRule.renewText }),
    context.locator('button, a, [role="button"]').filter({ hasText: subscriptionBillingRule.renewText }),
  ];
}

async function revisitSubscriptionPage(page: Page, env: RuntimeEnv): Promise<void> {
  await page.goto(billingUrl(env.version, subscriptionBillingRule.path), {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
}

export async function clickRenew(page: Page, env: RuntimeEnv): Promise<SubscriptionFlowResult> {
  if ((await waitForCreateBillPage(page, 1_000)).success || (await waitForPaymentMethodPage(page, 1_000)).success) {
    return result(page, true, {
      visibleText: await visibleText(page, 1_500).catch(() => ''),
      message: '当前已在续费下单流程中，跳过重复点击续费。',
      metadata: { alreadyInRenewFlow: true, buttonSearchAttempts: 0, pageRevisits: 0 },
    });
  }

  let renewButton: Locator | null = null;
  let lastVisibleText = '';
  let buttonSearchAttempts = 0;
  let pageRevisits = 0;

  for (let attempt = 0; attempt <= RENEW_PAGE_RETRY_LIMIT; attempt += 1) {
    buttonSearchAttempts += 1;
    const attemptStartedAt = Date.now();
    const context = await findBillingContext(page);
    const remainingWaitMs = Math.max(1, RENEW_BUTTON_WAIT_MS - (Date.now() - attemptStartedAt));
    renewButton = await firstVisible(renewButtonCandidates(context), remainingWaitMs);
    lastVisibleText = await visibleText(context, 1_500).catch(() => '');

    if (renewButton) break;
    if (attempt === RENEW_PAGE_RETRY_LIMIT) {
      return result(page, false, {
        visibleText: lastVisibleText,
        message: `每次等待 ${RENEW_BUTTON_WAIT_MS / 1_000} 秒并重新访问订阅页面 ${RENEW_PAGE_RETRY_LIMIT} 次后，仍未找到续费按钮。`,
        issueType: 'RENEW_BUTTON_NOT_FOUND',
        metadata: {
          locator: 'role=button/link name=/续费|变更订阅|Renew|Upgrade|Change Plan/',
          buttonSearchAttempts,
          pageRevisits,
          expectedSubscriptionUrl: billingUrl(env.version, subscriptionBillingRule.path),
        },
      });
    }

    await revisitSubscriptionPage(page, env);
    pageRevisits += 1;
  }

  if (!renewButton) {
    return result(page, false, {
      visibleText: lastVisibleText,
      message: '未找到续费按钮。',
      issueType: 'RENEW_BUTTON_NOT_FOUND',
      metadata: { buttonSearchAttempts, pageRevisits },
    });
  }

  if (!(await isEnabled(renewButton))) {
    return result(page, false, {
      visibleText: lastVisibleText,
      message: '续费按钮存在但不可用。',
      issueType: 'RENEW_BUTTON_DISABLED',
      metadata: {
        locator: 'role=button/link name=/续费|变更订阅|Renew|Upgrade|Change Plan/',
        buttonSearchAttempts,
        pageRevisits,
      },
    });
  }

  const clicked = await clickAndCaptureAppNavigation(page, renewButton).then(() => true).catch(() => false);
  const reachedCreateBill = (await waitForCreateBillPage(page, 20_000)).success;
  const reachedPaymentMethod = (await waitForPaymentMethodPage(page, 1_000)).success;

  return result(page, clicked && (reachedCreateBill || reachedPaymentMethod), {
    visibleText: await visibleText(await findBillingContext(page), 1_500).catch(() => ''),
    message: clicked && (reachedCreateBill || reachedPaymentMethod)
      ? '已点击续费并进入续费下单流程。'
      : '点击续费后未进入创建账单页面。',
    issueType: clicked && (reachedCreateBill || reachedPaymentMethod) ? undefined : 'RENEW_CLICK_FAILED',
    metadata: {
      locator: 'role=button/link name=/续费|变更订阅|Renew|Upgrade|Change Plan/',
      buttonSearchAttempts,
      pageRevisits,
      reachedCreateBill,
      reachedPaymentMethod,
    },
  });
}

export async function waitForCreateBillPage(page: Page, timeout = 25_000): Promise<SubscriptionFlowResult> {
  const stable = await waitForStableContent(page, createBillPagePattern, timeout);
  const text = stable?.text || await visibleText(page, 1_500).catch(() => '');
  const reached = Boolean(stable) || /\/user-hub\/package\/operation\//.test(page.url());

  return result(page, reached, {
    visibleText: text,
    message: reached ? '已进入创建账单页面。' : '未进入创建账单页面。',
    issueType: reached ? undefined : 'CREATE_BILL_PAGE_NOT_REACHED',
  });
}

export async function selectBillingCycle(page: Page, cycle: BillingCycle): Promise<BillingCycleSelectionResult> {
  const context = await findBillingContext(page);
  const candidates = billingCycleCandidates(context, cycle);
  let found = false;
  let visible = false;
  let locatorCount = 0;

  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);
    locatorCount += count;
    found = found || count > 0;

    for (let i = 0; i < count; i += 1) {
      const candidate = locator.nth(i);
      const candidateVisible = await candidate.isVisible().catch(() => false);
      visible = visible || candidateVisible;
      if (!candidateVisible) continue;

      const target = await resolveClickableAncestor(context, candidate, `billing-cycle-${cycle}`) || candidate;
      const enabled = await isEnabled(target);
      if (!enabled) {
        return {
          found,
          visible,
          enabled: false,
          clicked: false,
          selected: false,
          message: `${cycle} 计费周期可见但不可用。`,
        };
      }

      const beforeClickState = await readSelectedState(target);
      if (beforeClickState.selected) {
        return {
          found: true,
          visible: true,
          enabled: true,
          clicked: false,
          selected: true,
          selectedStateEvidence: beforeClickState.evidence,
          message: `${cycle} 计费周期已处于选中状态。`,
        };
      }

      await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
      await target.click({ timeout: 5_000 });
      const selectedState = await waitForSelectedState(target);
      return {
        found: true,
        visible: true,
        enabled: true,
        clicked: true,
        selected: selectedState.selected,
        selectedStateEvidence: selectedState.evidence,
        message: selectedState.selected
          ? `已选择 ${cycle} 计费周期。`
          : selectedState.stableStateAvailable
            ? `已点击 ${cycle} 计费周期，但未检测到 checked/aria-checked/aria-selected/data-selected/data-state/selected class。`
            : `已点击 ${cycle} 计费周期，但当前 UI 没有可稳定判断选中态的 DOM 状态。建议增加 billing-cycle-${cycle} 的 data-testid 和 aria-selected/data-selected。`,
      };
    }
  }

  return {
    found,
    visible,
    enabled: false,
    clicked: false,
    selected: false,
    message: found
      ? `${cycle} 计费周期存在但不可见。`
      : `未找到 ${cycle} 计费周期选项。locatorCount=${locatorCount}`,
  };
}

async function isAgreementAccepted(locator: Locator): Promise<boolean> {
  const checked = await locator.isChecked({ timeout: 500 }).catch(() => undefined);
  if (checked === true) return true;

  return locator.evaluate((node) => {
    const root = node as HTMLElement;
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    return elements.some((element) => {
      const input = element as HTMLInputElement;
      if ((input.type === 'checkbox' || input.getAttribute('role') === 'checkbox') && input.checked) return true;
      if (element.getAttribute('aria-checked') === 'true') return true;
      const dataState = element.getAttribute('data-state');
      if (dataState && /checked|selected|active/i.test(dataState)) return true;
      return /checked|selected|active/i.test(String(element.className || ''));
    });
  }).catch(() => false);
}

export async function agreeBillingAgreement(page: Page): Promise<SubscriptionFlowResult> {
  if ((await waitForPaymentMethodPage(page, 1_000)).success) {
    return result(page, true, {
      visibleText: await visibleText(page, 1_500).catch(() => ''),
      message: '当前已进入选择支付方式页面，协议已在前序下单流程中完成。',
      metadata: { alreadyPastAgreement: true },
    });
  }

  const context = await findBillingContext(page);
  const checkbox = await firstVisible([
    context.getByRole('checkbox', { name: /同意|协议|Agree|Terms|Agreement/i }),
    context.locator('label').filter({ hasText: /同意|协议|Agree|Terms|Agreement/i }),
    context.locator('.ant-checkbox-wrapper').filter({ hasText: /同意|协议|Agree|Terms|Agreement/i }),
    context.locator('.ant-checkbox-input'),
    context.locator('input[type="checkbox"]'),
  ], 10_000);

  if (!checkbox) {
    return result(page, false, {
      visibleText: await visibleText(context, 1_500).catch(() => ''),
      message: '创建账单页未找到同意协议勾选项。',
      issueType: 'AGREEMENT_NOT_FOUND',
    });
  }

  if (!(await isAgreementAccepted(checkbox))) {
    await checkbox.click({ timeout: 5_000 }).catch(async () => {
      await checkbox.locator('xpath=ancestor::label[1]').click({ timeout: 5_000 });
    });
  }

  const accepted = await isAgreementAccepted(checkbox);
  return result(page, accepted, {
    visibleText: await visibleText(context, 1_500).catch(() => ''),
    message: accepted ? '已同意订阅协议。' : '点击协议后未确认选中状态。',
    issueType: accepted ? undefined : 'AGREEMENT_NOT_ACCEPTED',
    metadata: { selectedState: accepted },
  });
}

export async function clickCreateBill(page: Page): Promise<SubscriptionFlowResult> {
  if ((await waitForPaymentMethodPage(page, 1_000)).success) {
    return result(page, true, {
      visibleText: await visibleText(page, 1_500).catch(() => ''),
      message: '当前已进入选择支付方式页面，跳过重复创建账单。',
      metadata: { alreadyOnPaymentMethodPage: true },
    });
  }

  const context = await findBillingContext(page);
  const button = await firstVisible([
    context.getByRole('button', { name: /创建账单|确认创建|Create bill|Create Bill|Create invoice|Continue/i }),
    context.locator('button, [role="button"]').filter({ hasText: /创建账单|确认创建|Create bill|Create Bill|Create invoice|Continue/i }),
  ], 12_000);

  if (!button) {
    return result(page, false, {
      visibleText: await visibleText(context, 1_500).catch(() => ''),
      message: '未找到创建账单按钮。',
      issueType: 'CREATE_BILL_BUTTON_NOT_FOUND',
    });
  }

  if (!(await isEnabled(button))) {
    return result(page, false, {
      visibleText: await visibleText(context, 1_500).catch(() => ''),
      message: '创建账单按钮存在但不可用。',
      issueType: 'CREATE_BILL_BUTTON_DISABLED',
    });
  }

  const clicked = await clickAndCaptureAppNavigation(page, button).then(() => true).catch(() => false);
  const reachedPaymentMethod = (await waitForPaymentMethodPage(page, 25_000)).success;

  return result(page, clicked && reachedPaymentMethod, {
    visibleText: await visibleText(await findBillingContext(page), 1_500).catch(() => ''),
    message: clicked && reachedPaymentMethod ? '已创建账单并进入选择支付方式页面。' : '创建账单后未进入选择支付方式页面。',
    issueType: clicked && reachedPaymentMethod ? undefined : 'CREATE_BILL_FAILED',
    metadata: { reachedPaymentMethod },
  });
}

export async function waitForPaymentMethodPage(page: Page, timeout = 25_000): Promise<SubscriptionFlowResult> {
  const stable = await waitForStableContent(page, paymentMethodPagePattern, timeout);
  const text = stable?.text || await visibleText(page, 1_500).catch(() => '');
  const reached = Boolean(stable) || /\/user-hub\/bill\/\d+\/payment/.test(page.url());

  return result(page, reached, {
    visibleText: text,
    message: reached ? '已进入选择支付方式页面。' : '未进入选择支付方式页面。',
    issueType: reached ? undefined : 'PAYMENT_METHOD_PAGE_NOT_REACHED',
    metadata: {
      urlMatched: /\/user-hub\/bill\/\d+\/payment/.test(page.url()),
      textMatched: paymentMethodPagePattern.test(text),
    },
  });
}
