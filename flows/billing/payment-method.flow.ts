import type { Frame, Locator, Page } from '@playwright/test';
import {
  paymentMethodRules,
  type PaymentMethod,
  type PaymentPathRule,
} from '../../configs/billing-rules';
import { visibleText, type BillingContentContext } from './subscription.flow';

export type PaymentTargetMode = 'popup' | 'same-page' | 'no-navigation';

export interface PaymentFrameDiagnostics {
  name: string;
  url: string;
}

export interface PaymentMethodDiagnostics {
  found: boolean;
  visible: boolean;
  enabled: boolean;
  clicked: boolean;
  selected: boolean;
  locatorCount: number;
  payButtonVisible?: boolean;
  payButtonEnabled?: boolean;
  payButtonLocatorCount?: number;
  popupOpened?: boolean;
  navigationOccurred?: boolean;
  targetMode?: PaymentTargetMode;
  finalUrl?: string;
  currentUrl: string;
  frames: PaymentFrameDiagnostics[];
  hasIframe: boolean;
  hasDialogOrOverlay: boolean;
  hasLoadingMask: boolean;
  selectedStateEvidence?: string;
  radioDebug?: PaymentRadioSelectionDebug;
  suggestedTestIds?: string[];
  message?: string;
}

export interface PaymentRadioState {
  label: string;
  value: string;
  description: string;
  checked: boolean;
  visible: boolean;
  enabled: boolean;
  role: string;
  ariaChecked?: string | null;
  dataState?: string | null;
  matchedMethod: PaymentMethod | null;
}

export interface PaymentRadioSelectionDebug {
  expectedMethod: PaymentMethod;
  radioCount: number;
  matchingRadioCount: number;
  selectedRadioCount: number;
  selectedMatchedExpected: boolean;
  radios: PaymentRadioState[];
}

export interface AvailablePaymentMethod {
  method: PaymentMethod;
  found: boolean;
  visible: boolean;
  enabled: boolean;
  locatorCount: number;
}

export interface VisiblePaymentMethodsResult {
  methods: PaymentMethod[];
  unknownMethods: string[];
  rawLabels: string[];
}

export interface PaymentMethodSetComparison {
  matched: boolean;
  expected: PaymentMethod[];
  actual: PaymentMethod[];
  missing: PaymentMethod[];
  unexpected: PaymentMethod[];
  unknownMethods: string[];
}

export interface PaymentMethodAvailabilityResult {
  success: boolean;
  methods: AvailablePaymentMethod[];
  visibleMethods: VisiblePaymentMethodsResult;
  comparison: PaymentMethodSetComparison;
  missingExpected: PaymentMethod[];
  unexpectedVisible: PaymentMethod[];
  readiness?: PaymentPageReadiness;
  issueType?: 'PAYMENT_METHOD_SET_MISMATCH' | 'PAYMENT_PAGE_NOT_READY';
  message?: string;
}

export interface PaymentPageReadiness {
  ready: boolean;
  timedOut: boolean;
  timeoutMs: number;
  billIdReady: boolean;
  serviceDurationReady: boolean;
  seatCountReady: boolean;
  totalReady: boolean;
  expectedMethodsEnabled: boolean;
}

export const PAYMENT_PAGE_READY_TIMEOUT_MS = 10_000;

export interface PaymentMethodResult {
  success: boolean;
  method: PaymentMethod;
  selectedMethod: boolean;
  clickedPay: boolean;
  reachedTerminalPage: boolean;
  terminalUrl: string;
  terminalText: string;
  diagnostics: PaymentMethodDiagnostics;
  message?: string;
  issueType?:
    | 'PAYMENT_METHOD_NOT_FOUND'
    | 'PAYMENT_METHOD_NOT_SELECTED'
    | 'PAYMENT_SUBMIT_NOT_FOUND'
    | 'PAY_NOW_DISABLED'
    | 'PAYMENT_TERMINAL_NOT_REACHED';
}

interface LocatedTarget {
  target: Locator | null;
  found: boolean;
  visible: boolean;
  enabled: boolean;
  locatorCount: number;
}

interface PaymentTargetCapture {
  mode: PaymentTargetMode;
  finalUrl: string;
  targetPage: Page;
  page: Page;
  popupOpened: boolean;
  navigationOccurred: boolean;
}

function billingContexts(page: Page): BillingContentContext[] {
  return [
    ...page.frames().filter((frame) => frame !== page.mainFrame()),
    page,
  ];
}

function frameDiagnostics(page: Page): PaymentFrameDiagnostics[] {
  return page.frames().map((frame) => ({
    name: frame.name(),
    url: frame.url(),
  }));
}

async function hasVisibleAny(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluateAll((elements) => elements.some((element) => {
    const htmlElement = element as HTMLElement;
    const rect = htmlElement.getBoundingClientRect();
    const style = window.getComputedStyle(htmlElement);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  })).catch(() => false);
}

async function collectRuntimeDiagnostics(page: Page): Promise<Pick<
  PaymentMethodDiagnostics,
  'currentUrl' | 'frames' | 'hasIframe' | 'hasDialogOrOverlay' | 'hasLoadingMask'
>> {
  const frames = frameDiagnostics(page);
  return {
    currentUrl: page.url(),
    frames,
    hasIframe: frames.length > 1,
    hasDialogOrOverlay: await hasVisibleAny(page, [
      '[role="dialog"]',
      '.ant-modal',
      '.ant-drawer',
      '.ant-popover',
      '.ant-dropdown',
      '[class*="modal"]',
      '[class*="drawer"]',
      '[class*="overlay"]',
      '[class*="popover"]',
    ].join(',')),
    hasLoadingMask: await hasVisibleAny(page, [
      '.ant-spin',
      '.ant-skeleton',
      '[class*="loading"]',
      '[class*="Loading"]',
      '[class*="skeleton"]',
      '[aria-busy="true"]',
    ].join(',')),
  };
}

function emptyDiagnostics(page: Page): PaymentMethodDiagnostics {
  const frames = frameDiagnostics(page);
  return {
    found: false,
    visible: false,
    enabled: false,
    clicked: false,
    selected: false,
    locatorCount: 0,
    currentUrl: page.url(),
    frames,
    hasIframe: frames.length > 1,
    hasDialogOrOverlay: false,
    hasLoadingMask: false,
  };
}

async function isActionEnabled(locator: Locator): Promise<boolean> {
  const playwrightEnabled = await locator.isEnabled({ timeout: 1_000 }).catch(() => true);
  const domDisabled = await locator.evaluate((node) => {
    const element = node as HTMLElement;
    const disabledElement = element.closest('button:disabled, input:disabled, [disabled], [aria-disabled="true"]');
    if (disabledElement) return true;
    const className = String(element.closest('button, a, [role="button"], label, [role="radio"], .ant-radio-wrapper')?.className || element.className || '');
    return /\bdisabled\b|ant-btn-disabled|is-disabled/i.test(className);
  }).catch(() => false);
  return playwrightEnabled && !domDisabled;
}

async function resolveActionableTarget(
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
        || current.hasAttribute('onclick')
        || /button|btn|radio-wrapper|cursor-pointer|clickable/i.test(className)
        || window.getComputedStyle(current).cursor === 'pointer';
      if (clickable && isVisible(current)) {
        current.setAttribute('data-e2e-payment-click-target', markerValue);
        return true;
      }
      current = current.parentElement;
    }

    return false;
  }, marker).catch(() => false);

  if (!marked) return null;
  const target = context.locator(`[data-e2e-payment-click-target="${marker}"]`).first();
  return await target.isVisible().catch(() => false) ? target : null;
}

function paymentMethodCandidates(context: BillingContentContext, method: PaymentMethod): Locator[] {
  const rule = paymentMethodRules[method];
  return [
    context.getByRole('radio', { name: rule.selectText }),
    context.getByRole('button', { name: rule.selectText }),
    context.getByLabel(rule.selectText),
    context.getByText(rule.selectText),
    context.locator('.ant-radio-wrapper, [role="radio"], button, label, [data-testid]').filter({ hasText: rule.selectText }),
  ];
}

function payButtonCandidates(context: BillingContentContext, method: PaymentMethod): Locator[] {
  const rule = paymentMethodRules[method];
  return [
    context.getByRole('button', { name: rule.submitText }),
    context.getByRole('link', { name: rule.submitText }),
    context.locator('button, a, [role="button"], [data-testid], [data-test-id]').filter({ hasText: rule.submitText }),
  ];
}

function normalizePaymentLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function mapPaymentMethodLabel(label: string): PaymentMethod | null {
  if (/信用卡支付?|银行卡|credit\s*card|card|stripe/i.test(label)) return 'credit-card';
  if (/支付宝支付?|alipay/i.test(label)) return 'alipay';
  if (/对公转账|银行转账|public\s*transfer|publicTransfer|bank\s*transfer|corporate\s*transfer|wire\s*transfer/i.test(label)) return 'bank-transfer';
  return null;
}

function mapPaymentRadioValue(value: string): PaymentMethod | null {
  if (/^stripe$|^card$|credit/i.test(value)) return 'credit-card';
  if (/^alipay$/i.test(value)) return 'alipay';
  if (/^publicTransfer$|public[_-]?transfer|corporate[_-]?transfer|wire[_-]?transfer/i.test(value)) return 'bank-transfer';
  return null;
}

function paymentRadioValueSelector(method: PaymentMethod): string {
  if (method === 'credit-card') return 'input[type="radio"][value="stripe"]';
  if (method === 'alipay') return 'input[type="radio"][value="alipay"]';
  return 'input[type="radio"][value="publicTransfer"]';
}

function mapPaymentRadioState(state: Pick<PaymentRadioState, 'label' | 'value' | 'description'>): PaymentMethod | null {
  return mapPaymentRadioValue(state.value)
    || mapPaymentMethodLabel(`${state.label} ${state.description}`);
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function positiveNumber(value: string | undefined): boolean {
  if (!value) return false;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0;
}

export function evaluatePaymentPageReadiness(
  text: string,
  methods: AvailablePaymentMethod[],
  expectedMethods: PaymentMethod[],
  timeoutMs: number,
  timedOut: boolean,
): PaymentPageReadiness {
  const billId = text.match(/(?:Bill\s*ID|账单(?:编号|ID|号))\s*[:：]?\s*(?![-—])([A-Za-z0-9][A-Za-z0-9-]*)/i)?.[1];
  const serviceDuration = text.match(/(?:Service\s*Duration|服务(?:时长|周期))\s*[:：]?\s*([\d,.]+)\s*(?:Day(?:\(s\)|s)?|天)/i)?.[1];
  const seatCount = text.match(/(?:Number\s*of\s*Seats|席位(?:数量|数)?|账号(?:数量|数))\s*[:：]?\s*([\d,.]+)/i)?.[1];
  const total = text.match(/(?:Total|总计|合计)\s*[:：]?\s*(?:[A-Z]{3}\s*)?([\d,.]+)/i)?.[1];
  const expectedMethodsEnabled = expectedMethods.every((expected) => methods.some((method) => (
    method.method === expected && method.found && method.visible && method.enabled
  )));
  const billIdReady = Boolean(billId);
  const serviceDurationReady = positiveNumber(serviceDuration);
  const seatCountReady = positiveNumber(seatCount);
  const totalReady = positiveNumber(total);

  return {
    ready: billIdReady
      && serviceDurationReady
      && seatCountReady
      && totalReady
      && expectedMethodsEnabled,
    timedOut,
    timeoutMs,
    billIdReady,
    serviceDurationReady,
    seatCountReady,
    totalReady,
    expectedMethodsEnabled,
  };
}

async function paymentPageVisibleText(page: Page): Promise<string> {
  const texts = await Promise.all(billingContexts(page).map((context) => (
    visibleText(context, 3_000).catch(() => '')
  )));
  return texts.filter(Boolean).join(' ');
}

function paymentPageNotReadyMessage(readiness: PaymentPageReadiness): string {
  const state = (ready: boolean) => ready ? '已就绪' : '未就绪';
  return [
    `支付页面在 ${readiness.timeoutMs / 1_000} 秒内未完成加载。`,
    `Bill ID: ${state(readiness.billIdReady)}`,
    `Service Duration: ${state(readiness.serviceDurationReady)}`,
    `Number of Seats: ${state(readiness.seatCountReady)}`,
    `Total: ${state(readiness.totalReady)}`,
    `Expected payment methods enabled: ${state(readiness.expectedMethodsEnabled)}`,
  ].join('\n');
}

async function locateTarget(
  contexts: BillingContentContext[],
  candidatesFor: (context: BillingContentContext) => Locator[],
  markerPrefix: string,
): Promise<LocatedTarget> {
  let locatorCount = 0;
  let found = false;
  let visible = false;

  for (const context of contexts) {
    for (const locator of candidatesFor(context)) {
      const count = await locator.count().catch(() => 0);
      locatorCount += count;
      found = found || count > 0;
      for (let i = 0; i < count; i += 1) {
        const candidate = locator.nth(i);
        const candidateVisible = await candidate.isVisible().catch(() => false);
        visible = visible || candidateVisible;
        if (!candidateVisible) continue;

        const target = await resolveActionableTarget(context, candidate, markerPrefix) || candidate;
        const enabled = await isActionEnabled(target);
        if (enabled) {
          return {
            target,
            found: true,
            visible: true,
            enabled: true,
            locatorCount,
          };
        }
      }
    }
  }

  return {
    target: null,
    found,
    visible,
    enabled: false,
    locatorCount,
  };
}

async function locatePaymentMethodRadioTarget(
  page: Page,
  method: PaymentMethod,
): Promise<LocatedTarget> {
  const rule = paymentMethodRules[method];
  let locatorCount = 0;
  let found = false;
  let visible = false;

  for (const context of billingContexts(page)) {
    for (const radio of [
      context.locator(paymentRadioValueSelector(method)),
      context.getByRole('radio', { name: rule.selectText }),
    ]) {
      const count = await radio.count().catch(() => 0);
      locatorCount += count;
      found = found || count > 0;

      if (count !== 1) continue;

      const candidateVisible = await radio.isVisible().catch(() => false);
      visible = visible || candidateVisible;
      if (!candidateVisible) continue;

      const target = await resolveActionableTarget(context, radio, `payment-method-${method}`) || radio;
      const enabled = await isActionEnabled(target);
      return {
        target: enabled ? target : null,
        found: true,
        visible: true,
        enabled,
        locatorCount,
      };
    }
  }

  return {
    target: null,
    found,
    visible,
    enabled: false,
    locatorCount,
  };
}

async function readSelectedState(locator: Locator): Promise<{
  selected: boolean;
  evidence?: string;
  stableStateAvailable: boolean;
}> {
  const checked = await locator.isChecked({ timeout: 500 }).catch(() => undefined);
  if (checked === true) {
    return { selected: true, evidence: 'locator.isChecked() === true', stableStateAvailable: true };
  }

  return locator.evaluate((node) => {
    const root = node as HTMLElement;
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    for (const element of elements) {
      const input = element as HTMLInputElement;
      if ((input.type === 'radio' || input.type === 'checkbox') && input.checked) {
        return { selected: true, evidence: `${input.tagName.toLowerCase()}[checked]`, stableStateAvailable: true };
      }

      const ariaChecked = element.getAttribute('aria-checked');
      if (ariaChecked === 'true') {
        return { selected: true, evidence: 'aria-checked=true', stableStateAvailable: true };
      }

      const ariaSelected = element.getAttribute('aria-selected');
      if (ariaSelected === 'true') {
        return { selected: true, evidence: 'aria-selected=true', stableStateAvailable: true };
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

    const hasStableStateAttribute = elements.some((element) => (
      element.hasAttribute('aria-checked')
      || element.hasAttribute('aria-selected')
      || element.hasAttribute('data-state')
      || element.matches('input[type="radio"], input[type="checkbox"]')
    ));
    return { selected: false, stableStateAvailable: hasStableStateAttribute };
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return lastState;
}

async function collectPaymentRadioStates(page: Page): Promise<PaymentRadioState[]> {
  const states: PaymentRadioState[] = [];

  for (const context of billingContexts(page)) {
    const contextStates = await context.locator('body').evaluate((body) => {
      const textOf = (element: Element | null): string => (
        (element as HTMLElement | null)?.innerText
        || element?.textContent
        || ''
      ).replace(/\s+/g, ' ').trim();

      const labelledText = (element: HTMLElement): string => {
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;

        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => textOf(element.ownerDocument.getElementById(id)))
            .filter(Boolean)
            .join(' ');
          if (text) return text;
        }

        const label = element.closest('label');
        if (label) return textOf(label);

        const container = element.closest('[role="radio"], [data-testid], [data-test-id], li, label, div');
        return textOf(container);
      };

      const describedText = (element: HTMLElement): string => {
        const describedBy = element.getAttribute('aria-describedby');
        if (!describedBy) return '';
        return describedBy
          .split(/\s+/)
          .map((id) => textOf(element.ownerDocument.getElementById(id)))
          .filter(Boolean)
          .join(' ');
      };

      const isVisible = (element: HTMLElement): boolean => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      const isDisabled = (element: HTMLElement): boolean => Boolean(
        element.closest('button:disabled, input:disabled, [disabled], [aria-disabled="true"]'),
      );

      const nodes = Array.from(body.querySelectorAll<HTMLElement>('input[type="radio"], [role="radio"]'));
      return nodes.map((element) => {
        const input = element as HTMLInputElement;
        const ariaChecked = element.getAttribute('aria-checked');
        const dataState = element.getAttribute('data-state');
        const checked = Boolean(
          input.checked
          || ariaChecked === 'true'
          || (dataState && /checked|selected|active/i.test(dataState)),
        );

        return {
          label: labelledText(element),
          value: element.getAttribute('value') || '',
          description: describedText(element),
          checked,
          visible: isVisible(element),
          enabled: !isDisabled(element),
          role: element.getAttribute('role') || element.tagName.toLowerCase(),
          ariaChecked,
          dataState,
        };
      });
    }).catch(() => []);

    states.push(...contextStates.map((state) => ({
      ...state,
      matchedMethod: mapPaymentRadioState(state),
    })));
  }

  return states;
}

async function readUniqueSelectedPaymentRadio(page: Page, method: PaymentMethod): Promise<{
  selected: boolean;
  evidence?: string;
  stableStateAvailable: boolean;
  debug: PaymentRadioSelectionDebug;
}> {
  const radios = await collectPaymentRadioStates(page);
  const selectedRadios = radios.filter((radio) => radio.checked);
  const matchingRadios = radios.filter((radio) => radio.matchedMethod === method);
  const selectedMatchedExpected = selectedRadios.length === 1 && selectedRadios[0].matchedMethod === method;

  const debug: PaymentRadioSelectionDebug = {
    expectedMethod: method,
    radioCount: radios.length,
    matchingRadioCount: matchingRadios.length,
    selectedRadioCount: selectedRadios.length,
    selectedMatchedExpected,
    radios,
  };

  const selectedRadio = selectedRadios[0];
  return {
    selected: selectedMatchedExpected,
    evidence: selectedMatchedExpected && selectedRadio
      ? `unique checked radio matched ${method}: value=${selectedRadio.value || '-'}, label=${selectedRadio.label || '-'}`
      : undefined,
    stableStateAvailable: radios.length > 0,
    debug,
  };
}

async function waitForUniqueSelectedPaymentRadio(page: Page, method: PaymentMethod): Promise<{
  selected: boolean;
  evidence?: string;
  stableStateAvailable: boolean;
  debug: PaymentRadioSelectionDebug;
}> {
  const deadline = Date.now() + 5_000;
  let lastState = await readUniqueSelectedPaymentRadio(page, method);

  while (Date.now() < deadline) {
    lastState = await readUniqueSelectedPaymentRadio(page, method);
    if (lastState.selected) return lastState;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return lastState;
}

export async function selectPaymentMethod(
  page: Page,
  method: PaymentMethod,
): Promise<PaymentMethodDiagnostics> {
  const diagnostics: PaymentMethodDiagnostics = {
    ...emptyDiagnostics(page),
    ...(await collectRuntimeDiagnostics(page)),
  };
  const located = await locatePaymentMethodRadioTarget(page, method);

  diagnostics.found = located.found;
  diagnostics.visible = located.visible;
  diagnostics.enabled = located.enabled;
  diagnostics.locatorCount = located.locatorCount;

  if (!located.target) {
    diagnostics.message = located.found
      ? `${paymentMethodRules[method].name} 支付方式存在，但没有可点击且 enabled 的目标。`
      : `未找到 ${paymentMethodRules[method].name} 支付方式。`;
    return diagnostics;
  }

  await located.target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
  await located.target.click({ timeout: 5_000 });
  diagnostics.clicked = true;

  const selectedState = await waitForUniqueSelectedPaymentRadio(page, method);
  diagnostics.selected = selectedState.selected;
  diagnostics.selectedStateEvidence = selectedState.evidence;
  diagnostics.radioDebug = selectedState.debug;
  if (!selectedState.selected) {
    diagnostics.suggestedTestIds = [
      `billing-payment-method-${method}`,
      `billing-payment-method-${method}-radio`,
    ];
    diagnostics.message = selectedState.stableStateAvailable
      ? `${paymentMethodRules[method].name} 已点击，但未检测到唯一选中的目标 radio。selectedRadioCount=${selectedState.debug.selectedRadioCount}, matchingRadioCount=${selectedState.debug.matchingRadioCount}。`
      : `${paymentMethodRules[method].name} 已点击，但当前 UI 没有可稳定判断选中态的 DOM 状态。建议增加 data-testid 和 aria-checked/data-state。`;
  }

  return diagnostics;
}

export async function verifyPaymentMethodSelected(page: Page, method: PaymentMethod): Promise<{
  selected: boolean;
  evidence?: string;
  stableStateAvailable: boolean;
  message?: string;
}> {
  const located = await locatePaymentMethodRadioTarget(page, method);

  if (!located.target) {
    return {
      selected: false,
      stableStateAvailable: false,
      message: located.found
        ? `${paymentMethodRules[method].name} 支付方式 radio 存在，但没有唯一可读取选中态的可见目标。locatorCount=${located.locatorCount}。`
        : `未找到 ${paymentMethodRules[method].name} 支付方式。`,
    };
  }

  const state = await readUniqueSelectedPaymentRadio(page, method);
  return {
    selected: state.selected,
    evidence: state.evidence,
    stableStateAvailable: state.stableStateAvailable,
    message: state.selected
      ? `${paymentMethodRules[method].name} 已处于选中状态。`
      : state.stableStateAvailable
        ? `${paymentMethodRules[method].name} 未处于唯一选中状态。selectedRadioCount=${state.debug.selectedRadioCount}, matchingRadioCount=${state.debug.matchingRadioCount}。`
        : `${paymentMethodRules[method].name} 当前 UI 没有可稳定判断选中态的 DOM 状态。`,
  };
}

export async function getAvailablePaymentMethods(page: Page): Promise<AvailablePaymentMethod[]> {
  const methods: PaymentMethod[] = ['credit-card', 'alipay', 'bank-transfer'];
  const available: AvailablePaymentMethod[] = [];

  for (const method of methods) {
    const located = await locateTarget(
      billingContexts(page),
      (context) => paymentMethodCandidates(context, method),
      `payment-method-availability-${method}`,
    );
    available.push({
      method,
      found: located.found,
      visible: located.visible,
      enabled: located.enabled,
      locatorCount: located.locatorCount,
    });
  }

  return available;
}

export async function getVisiblePaymentMethods(page: Page): Promise<VisiblePaymentMethodsResult> {
  const labels: string[] = [];

  for (const context of billingContexts(page)) {
    const contextLabels = await context.locator('body').evaluate((body) => {
      const isVisible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        return rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0';
      };

      const isProbablyPaymentOption = (element: Element, text: string) => {
        const htmlElement = element as HTMLElement;
        const attributes = [
          htmlElement.id,
          htmlElement.getAttribute('role'),
          htmlElement.getAttribute('aria-label'),
          htmlElement.getAttribute('data-testid'),
          htmlElement.getAttribute('data-test-id'),
          htmlElement.getAttribute('data-value'),
          htmlElement.getAttribute('value'),
          htmlElement.className,
        ].filter(Boolean).join(' ');
        const searchable = `${text} ${attributes}`;
        const optionMarker = /支付|付款|信用卡|银行卡|支付宝|对公|转账|credit\s*card|card|stripe|alipay|bank\s*transfer|corporate\s*transfer|wire\s*transfer|paypal|wechat|微信|wxpay|apple\s*pay|google\s*pay|unionpay/i;
        const structureMarker = htmlElement.matches([
          '[role="radio"]',
          '[role="option"]',
          'label',
          'button',
          '[data-testid]',
          '[data-test-id]',
          '[class*="radio"]',
          '[class*="payment"]',
          '[class*="pay"]',
          '[class*="method"]',
        ].join(','));
        const actionText = /立即支付|确认支付|去支付|上传凭证|提交凭证|pay\s*now|continue|submit|upload|voucher|receipt/i;

        return optionMarker.test(searchable)
          && (structureMarker || /paypal|wechat|微信|wxpay|apple\s*pay|google\s*pay|unionpay/i.test(searchable))
          && !actionText.test(text);
      };

      const elements = Array.from(body.querySelectorAll<HTMLElement>([
        '[role="radio"]',
        '[role="option"]',
        'label',
        'button',
        '[data-testid]',
        '[data-test-id]',
        '[class*="radio"]',
        '[class*="payment"]',
        '[class*="pay"]',
        '[class*="method"]',
      ].join(',')));

      return elements
        .filter((element) => isVisible(element))
        .map((element) => {
          const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
          const ariaLabel = element.getAttribute('aria-label') || '';
          const dataValue = element.getAttribute('data-value') || element.getAttribute('value') || '';
          return text || ariaLabel || dataValue;
        })
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter((text) => text.length > 0 && text.length <= 80)
        .filter((text, index, array) => array.indexOf(text) === index)
        .filter((text) => {
          const matchingElement = elements.find((element) => {
            const elementText = (element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('data-value') || element.getAttribute('value') || '').replace(/\s+/g, ' ').trim();
            return elementText === text;
          });
          return matchingElement ? isProbablyPaymentOption(matchingElement, text) : false;
        });
    }).catch(() => []);

    labels.push(...contextLabels);
  }

  const rawLabels = uniqueValues(labels.map(normalizePaymentLabel).filter(Boolean));
  const methods = uniqueValues(rawLabels.map(mapPaymentMethodLabel).filter((method): method is PaymentMethod => Boolean(method)));
  const unknownMethods = rawLabels.filter((label) => !mapPaymentMethodLabel(label));

  return {
    methods,
    unknownMethods,
    rawLabels,
  };
}

export function comparePaymentMethodSet(
  expected: PaymentMethod[],
  actual: PaymentMethod[],
  unknownMethods: string[],
): PaymentMethodSetComparison {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((method) => !actualSet.has(method));
  const unexpected = actual.filter((method) => !expectedSet.has(method));

  return {
    matched: missing.length === 0 && unexpected.length === 0 && unknownMethods.length === 0,
    expected,
    actual,
    missing,
    unexpected,
    unknownMethods,
  };
}

function paymentMethodSetMessage(comparison: PaymentMethodSetComparison): string {
  if (comparison.matched) {
    return `支付方式集合完全匹配：${comparison.expected.join(', ')}。`;
  }

  return [
    '支付方式集合不匹配。',
    `Expected: ${comparison.expected.join(', ') || '-'}`,
    `Actual: ${comparison.actual.join(', ') || '-'}`,
    `Missing: ${comparison.missing.join(', ') || '-'}`,
    `Unexpected: ${comparison.unexpected.join(', ') || '-'}`,
    `Unknown: ${comparison.unknownMethods.join(', ') || '-'}`,
  ].join('\n');
}

export async function verifyPaymentMethodAvailability(
  page: Page,
  expectedMethods: PaymentMethod[],
): Promise<PaymentMethodAvailabilityResult> {
  const methods = await getAvailablePaymentMethods(page);
  const visibleMethods = await getVisiblePaymentMethods(page);
  const actualMethods = uniqueValues(methods
    .filter((method) => method.visible && method.enabled)
    .map((method) => method.method));
  const comparison = comparePaymentMethodSet(expectedMethods, actualMethods, []);

  return {
    success: comparison.matched,
    methods,
    visibleMethods: {
      ...visibleMethods,
      methods: actualMethods,
    },
    comparison,
    missingExpected: comparison.missing,
    unexpectedVisible: comparison.unexpected,
    issueType: comparison.matched ? undefined : 'PAYMENT_METHOD_SET_MISMATCH',
    message: paymentMethodSetMessage(comparison),
  };
}

export async function waitForPaymentMethodAvailability(
  page: Page,
  expectedMethods: PaymentMethod[],
  timeoutMs = PAYMENT_PAGE_READY_TIMEOUT_MS,
): Promise<PaymentMethodAvailabilityResult> {
  const deadline = Date.now() + timeoutMs;
  let lastResult = await verifyPaymentMethodAvailability(page, expectedMethods);
  let lastText = await paymentPageVisibleText(page);
  let readiness = evaluatePaymentPageReadiness(lastText, lastResult.methods, expectedMethods, timeoutMs, false);

  while (!readiness.ready && Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, remainingMs)));
    lastResult = await verifyPaymentMethodAvailability(page, expectedMethods);
    lastText = await paymentPageVisibleText(page);
    readiness = evaluatePaymentPageReadiness(lastText, lastResult.methods, expectedMethods, timeoutMs, false);
  }

  if (readiness.ready) {
    return {
      ...lastResult,
      readiness,
    };
  }

  readiness = {
    ...readiness,
    timedOut: true,
  };
  return {
    ...lastResult,
    success: false,
    readiness,
    issueType: 'PAYMENT_PAGE_NOT_READY',
    message: paymentPageNotReadyMessage(readiness),
  };
}

export async function clickAndCapturePaymentTarget(
  page: Page,
  target: Locator,
): Promise<PaymentTargetCapture> {
  const beforeUrl = page.url();
  const popupPromise = page.waitForEvent('popup', { timeout: 8_000 }).catch(() => null);

  await target.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => undefined);
  await target.click({ timeout: 5_000 });

  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);
    return {
      mode: 'popup',
      finalUrl: popup.url(),
      targetPage: popup,
      page: popup,
      popupOpened: true,
      navigationOccurred: true,
    };
  }

  const navigationOccurred = await page.waitForFunction(
    (url) => window.location.href !== url,
    beforeUrl,
    { timeout: 8_000 },
  ).then(() => true).catch(() => false);
  await page.waitForLoadState('domcontentloaded', { timeout: 12_000 }).catch(() => undefined);

  return {
    mode: navigationOccurred ? 'same-page' : 'no-navigation',
    finalUrl: page.url(),
    targetPage: page,
    page,
    popupOpened: false,
    navigationOccurred,
  };
}

async function clickPaymentTrigger(
  page: Page,
  method: PaymentMethod,
): Promise<{
  target: PaymentTargetCapture | null;
  diagnostics: Pick<PaymentMethodDiagnostics, 'payButtonLocatorCount' | 'payButtonVisible' | 'payButtonEnabled' | 'popupOpened' | 'navigationOccurred' | 'targetMode' | 'finalUrl'>;
}> {
  const located = await locateTarget(
    billingContexts(page),
    (context) => payButtonCandidates(context, method),
    `payment-submit-${method}`,
  );
  const diagnostics = {
    payButtonLocatorCount: located.locatorCount,
    payButtonVisible: located.visible,
    payButtonEnabled: located.enabled,
    popupOpened: false,
    navigationOccurred: false,
    finalUrl: page.url(),
  };

  if (!located.target || !located.enabled) {
    return {
      target: null,
      diagnostics,
    };
  }

  const target = await clickAndCapturePaymentTarget(page, located.target);
  return {
    target,
    diagnostics: {
      ...diagnostics,
      popupOpened: target.popupOpened,
      navigationOccurred: target.navigationOccurred,
      targetMode: target.mode,
      finalUrl: target.finalUrl,
    },
  };
}

export async function clickPayNow(page: Page, method: Exclude<PaymentMethod, 'bank-transfer'>): Promise<{
  target: PaymentTargetCapture | null;
  diagnostics: Pick<PaymentMethodDiagnostics, 'payButtonLocatorCount' | 'payButtonVisible' | 'payButtonEnabled' | 'popupOpened' | 'navigationOccurred' | 'targetMode' | 'finalUrl'>;
}> {
  return clickPaymentTrigger(page, method);
}

export async function clickUploadVoucher(page: Page): Promise<{
  target: PaymentTargetCapture | null;
  diagnostics: Pick<PaymentMethodDiagnostics, 'payButtonLocatorCount' | 'payButtonVisible' | 'payButtonEnabled' | 'popupOpened' | 'navigationOccurred' | 'targetMode' | 'finalUrl'>;
}> {
  return clickPaymentTrigger(page, 'bank-transfer');
}

export async function clickPaymentSubmit(
  page: Page,
  method: PaymentMethod,
): Promise<{
  target: PaymentTargetCapture | null;
  diagnostics: Pick<PaymentMethodDiagnostics, 'payButtonLocatorCount' | 'payButtonVisible' | 'payButtonEnabled' | 'popupOpened' | 'navigationOccurred' | 'targetMode' | 'finalUrl'>;
}> {
  return method === 'bank-transfer'
    ? clickUploadVoucher(page)
    : clickPayNow(page, method);
}

export async function verifyPaymentTerminal(page: Page, method: PaymentMethod): Promise<boolean> {
  const rule = paymentMethodRules[method];
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const url = page.url();
    const text = await visibleText(page, 1_200).catch(() => '');
    if (rule.terminalUrl.test(url) || rule.terminalText.test(text)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

export async function verifyPaymentTarget(page: Page, pathRule: PaymentPathRule): Promise<boolean> {
  const methodRule = paymentMethodRules[pathRule.paymentMethod];
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const url = page.url();
    const text = await visibleText(page, 1_200).catch(() => '');
    const originMatched = pathRule.expectedOrigins?.some((origin) => url.startsWith(origin)) || false;
    const urlMatched = pathRule.expectedUrlIncludes?.some((value) => url.toLowerCase().includes(value.toLowerCase())) || false;
    const textMatched = pathRule.expectedPageText?.some((value) => text.toLowerCase().includes(value.toLowerCase())) || false;
    if (originMatched || urlMatched || textMatched || methodRule.terminalUrl.test(url) || methodRule.terminalText.test(text)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

export async function verifyPaymentMethodBranch(page: Page, pathRule: PaymentPathRule): Promise<PaymentMethodResult> {
  const method = pathRule.paymentMethod;
  const diagnostics = await selectPaymentMethod(page, method);
  if (!diagnostics.clicked || !diagnostics.found) {
    return {
      success: false,
      method,
      selectedMethod: false,
      clickedPay: false,
      reachedTerminalPage: false,
      terminalUrl: page.url(),
      terminalText: '',
      diagnostics,
      message: diagnostics.message || `未找到 ${paymentMethodRules[method].name} 支付方式。`,
      issueType: 'PAYMENT_METHOD_NOT_FOUND',
    };
  }

  if (!diagnostics.selected) {
    return {
      success: false,
      method,
      selectedMethod: false,
      clickedPay: false,
      reachedTerminalPage: false,
      terminalUrl: page.url(),
      terminalText: await visibleText(page, 800).catch(() => ''),
      diagnostics,
      message: diagnostics.message || `点击 ${paymentMethodRules[method].name} 后未确认选中态。`,
      issueType: 'PAYMENT_METHOD_NOT_SELECTED',
    };
  }

  const submitResult = await clickPaymentSubmit(page, method);
  Object.assign(diagnostics, submitResult.diagnostics);

  if (!submitResult.target) {
    const issueType = diagnostics.payButtonVisible && !diagnostics.payButtonEnabled
      ? 'PAY_NOW_DISABLED'
      : 'PAYMENT_SUBMIT_NOT_FOUND';
    return {
      success: false,
      method,
      selectedMethod: true,
      clickedPay: false,
      reachedTerminalPage: false,
      terminalUrl: page.url(),
      terminalText: await visibleText(page, 800).catch(() => ''),
      diagnostics,
      message: issueType === 'PAY_NOW_DISABLED'
        ? '立即支付按钮可见但处于 disabled 状态。'
        : `已选择 ${paymentMethodRules[method].name}，但未找到可点击的立即支付/上传凭证按钮。`,
      issueType,
    };
  }

  const reachedTerminalPage = await verifyPaymentTarget(submitResult.target.targetPage, pathRule);
  const terminalUrl = submitResult.target.targetPage.url();
  const terminalText = await visibleText(submitResult.target.targetPage, 1_000).catch(() => '');
  diagnostics.finalUrl = terminalUrl;
  if (submitResult.target.popupOpened) {
    await submitResult.target.targetPage.close().catch(() => undefined);
  }

  return {
    success: reachedTerminalPage,
    method,
    selectedMethod: true,
    clickedPay: true,
    reachedTerminalPage,
    terminalUrl,
    terminalText,
    diagnostics,
    message: reachedTerminalPage
      ? `已进入 ${paymentMethodRules[method].name} 终态页面，仅验证入口，不继续支付。`
      : `未确认进入 ${paymentMethodRules[method].name} 对应第三方页面。`,
    issueType: reachedTerminalPage ? undefined : 'PAYMENT_TERMINAL_NOT_REACHED',
  };
}
