import type { RuntimeEnv } from '../configs/env.cn';
import {
  paymentMethodRules,
  resolvePaymentPaths,
  isPaymentPathSupported,
  type PaymentMethod,
  type PaymentPathRule,
  type RuntimeVersion,
} from '../configs/billing-rules';
import type { ScenarioExecutionOptions } from '../engine/runner';
import {
  agreeBillingAgreement,
  clickCreateBill,
  clickRenew,
  enterSubscriptionPage,
  selectBillingCycle,
  waitForCreateBillPage,
  waitForPaymentMethodPage,
  type BillingCycleSelectionResult,
  type SubscriptionFlowResult,
} from '../flows/billing/subscription.flow';
import {
  verifyPaymentMethodAvailability,
  verifyPaymentMethodBranch,
  type PaymentMethodAvailabilityResult,
  type PaymentMethodResult,
} from '../flows/billing/payment-method.flow';
import { loginWithPassword } from '../flows/login/password-login.flow';
import type { RiskLevel, RunMode, ScenarioResult, StepDefinition, StepResult, StepStatus, StepType, Version } from './types';

export const subscriptionPaymentStepDefinitions = {
  login: {
    id: 'login',
    name: '账号密码登录',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  enterSubscriptionPage: {
    id: 'enterSubscriptionPage',
    name: '进入我的订阅页面',
    type: 'checkpoint',
    defaultRiskLevel: 'P1',
    required: true,
  },
  clickRenew: {
    id: 'clickRenew',
    name: '点击续费',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  enterCreateBillPage: {
    id: 'enterCreateBillPage',
    name: '进入创建账单页面',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  selectBillingCycle: {
    id: 'selectBillingCycle',
    name: '选择计费周期',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  agreeAgreement: {
    id: 'agreeAgreement',
    name: '同意协议',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  createBill: {
    id: 'createBill',
    name: '创建账单',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  enterPaymentMethodPage: {
    id: 'enterPaymentMethodPage',
    name: '进入选择支付方式页面',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  verifyPaymentMethodSet: {
    id: 'verifyPaymentMethodSet',
    name: '验证支付方式集合',
    type: 'checkpoint',
    defaultRiskLevel: 'P1',
    required: true,
  },
} as const satisfies Record<string, StepDefinition>;

type SubscriptionPaymentStepId = keyof typeof subscriptionPaymentStepDefinitions;

const stepDefinitionById = new Map<SubscriptionPaymentStepId, StepDefinition>(
  Object.entries(subscriptionPaymentStepDefinitions).map(([id, definition]) => [id as SubscriptionPaymentStepId, definition]),
);

function stepStatus(passed: boolean, skipped = false): StepStatus {
  if (skipped) return 'skipped';
  return passed ? 'passed' : 'failed';
}

function stepResult(
  stepId: string,
  status: StepStatus,
  options: {
    name?: string;
    type?: StepType;
    message?: string;
    url?: string;
    durationMs?: number;
    issueType?: string;
    defaultRiskLevel?: RiskLevel;
    metadata?: Record<string, unknown>;
  } = {},
): StepResult {
  const definition = stepDefinitionById.get(stepId as SubscriptionPaymentStepId);
  if (!definition && (!options.name || !options.type || !options.defaultRiskLevel)) {
    throw new Error(`Unknown subscription-payment step: ${stepId}`);
  }

  return {
    stepId,
    name: options.name || definition!.name,
    type: options.type || definition!.type,
    status,
    defaultRiskLevel: options.defaultRiskLevel || definition!.defaultRiskLevel,
    finalRiskLevel: 'NONE',
    issueType: options.issueType,
    message: options.message,
    url: options.url,
    durationMs: options.durationMs || 0,
    metadata: options.metadata,
  };
}

function flowStep(
  stepId: SubscriptionPaymentStepId,
  flowResult: SubscriptionFlowResult,
  durationMs: number,
  metadata: Record<string, unknown> = {},
): StepResult {
  return stepResult(stepId, stepStatus(flowResult.success), {
    message: flowResult.message,
    url: flowResult.url,
    durationMs,
    issueType: flowResult.issueType,
    metadata: {
      visibleText: flowResult.visibleText?.slice(0, 500),
      ...flowResult.metadata,
      ...metadata,
    },
  });
}

function scenarioResult(
  options: ScenarioExecutionOptions<RuntimeEnv>,
  steps: StepResult[],
): ScenarioResult {
  const pathIds = [...new Set(steps.map((step) => step.metadata?.paymentPathId).filter(Boolean).map(String))];
  const executablePathIds = pathIds.filter((pathId) => !steps.some((step) => (
    step.metadata?.paymentPathId === pathId
    && step.stepId.endsWith(':unsupported')
    && step.status === 'skipped'
  )));
  const hasPaymentTargetForEveryPath = executablePathIds.every((pathId) => steps.some((step) => (
    step.metadata?.paymentPathId === pathId
    && step.stepId.endsWith(':target')
    && step.status === 'passed'
  )));
  const onlyUnsupportedSkipped = steps.length > 0
    && steps.every((step) => step.status !== 'failed')
    && steps.every((step) => step.stepId.endsWith(':unsupported') && step.status === 'skipped');
  const reachedPaymentMethodPage = steps.some((step) => (
    step.stepId === 'enterPaymentMethodPage' || step.stepId.endsWith(':enterPaymentMethodPage')
  ) && step.status === 'passed');
  return {
    scenario: 'subscription-payment',
    version: options.version as Version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps,
    success: steps.every((step) => step.status !== 'failed')
      && (onlyUnsupportedSkipped || (
        reachedPaymentMethodPage
        && (executablePathIds.length === 0 || hasPaymentTargetForEveryPath)
      )),
  };
}

function unsupportedPaymentPathStep(pathRule: PaymentPathRule, version: RuntimeVersion): StepResult {
  return stepResult(`payment:${pathRule.id}:unsupported`, 'skipped', {
    name: `${pathRule.name} 当前版本未启用`,
    type: 'optional',
    defaultRiskLevel: pathRule.defaultRiskLevel,
    message: `当前版本 ${version} 未启用 ${pathRule.name}，按 unsupported skipped 处理。`,
    metadata: {
      paymentPathId: pathRule.id,
      billingCycle: pathRule.billingCycle,
      paymentMethod: pathRule.paymentMethod,
      expectedTarget: pathRule.expectedTarget,
      enabledVersions: pathRule.enabledVersions,
      issueType: 'PAYMENT_METHOD_NOT_SUPPORTED',
    },
  });
}

function billingCycleStep(
  pathRule: PaymentPathRule,
  result: BillingCycleSelectionResult,
  pageUrl: string,
  durationMs: number,
): StepResult {
  const issueType = result.selected
    ? undefined
    : !result.found
      ? 'BILLING_CYCLE_NOT_FOUND'
      : !result.visible
        ? 'BILLING_CYCLE_NOT_VISIBLE'
        : !result.enabled
          ? 'BILLING_CYCLE_DISABLED'
          : 'BILLING_CYCLE_NOT_SELECTED';

  return stepResult('selectBillingCycle', stepStatus(result.selected), {
    message: result.message,
    url: pageUrl,
    durationMs,
    issueType,
    metadata: {
      paymentPathId: pathRule.id,
      billingCycle: pathRule.billingCycle,
      found: result.found,
      visible: result.visible,
      enabled: result.enabled,
      clicked: result.clicked,
      selected: result.selected,
      selectedStateEvidence: result.selectedStateEvidence,
    },
  });
}

async function runSubscriptionOrderFlow(
  options: ScenarioExecutionOptions<RuntimeEnv>,
  pathRule: PaymentPathRule,
  page = options.page!,
): Promise<{
  steps: StepResult[];
  reachedPaymentMethodPage: boolean;
}> {
  const steps: StepResult[] = [];
  const loginStartedAt = Date.now();
  const loginResult = await loginWithPassword(page, options.env);
  steps.push(stepResult('login', stepStatus(loginResult.success, loginResult.conclusion === '跳过'), {
    message: loginResult.failureReason || loginResult.conclusion,
    url: loginResult.afterLoginUrl || page.url(),
    durationMs: Date.now() - loginStartedAt,
    issueType: loginResult.success ? undefined : loginResult.conclusion,
  }));

  if (!loginResult.success) return { steps, reachedPaymentMethodPage: false };

  if (!await runFlowStep(steps, 'enterSubscriptionPage', () => enterSubscriptionPage(page, options.env))) {
    return { steps, reachedPaymentMethodPage: false };
  }

  if (!await runFlowStep(steps, 'clickRenew', () => clickRenew(page, options.env), {
    locator: 'role=button/link name=/续费|变更订阅|Renew|Upgrade|Change Plan/',
  })) {
    return { steps, reachedPaymentMethodPage: false };
  }

  const createBillReached = await runFlowStep(steps, 'enterCreateBillPage', () => waitForCreateBillPage(page));
  if (!createBillReached) return { steps, reachedPaymentMethodPage: false };

  const cycleStartedAt = Date.now();
  const cycleResult = await selectBillingCycle(page, pathRule.billingCycle);
  steps.push(billingCycleStep(pathRule, cycleResult, page.url(), Date.now() - cycleStartedAt));
  if (!cycleResult.selected) return { steps, reachedPaymentMethodPage: false };

  if (!await runFlowStep(steps, 'agreeAgreement', () => agreeBillingAgreement(page))) {
    return { steps, reachedPaymentMethodPage: false };
  }

  if (!await runFlowStep(steps, 'createBill', () => clickCreateBill(page))) {
    return { steps, reachedPaymentMethodPage: false };
  }

  const reachedPaymentMethodPage = await runFlowStep(steps, 'enterPaymentMethodPage', () => waitForPaymentMethodPage(page));
  return { steps, reachedPaymentMethodPage };
}

function paymentStepName(method: PaymentMethod, step: 'select' | 'action' | 'target'): string {
  const rule = paymentMethodRules[method];
  if (step === 'select') return `选择${rule.name}`;
  if (step === 'action') return method === 'bank-transfer' ? '点击上传凭证' : '点击立即支付';
  if (method === 'credit-card') return '进入 Stripe 付款页';
  if (method === 'alipay') return '进入支付宝付款页';
  return '进入飞书表单页';
}

function paymentMethodSetStep(pathRule: PaymentPathRule, result: PaymentMethodAvailabilityResult, url: string, durationMs: number): StepResult {
  return stepResult(`path:${pathRule.id}:payment-method-set`, stepStatus(result.success), {
    name: '验证支付方式集合',
    type: 'checkpoint',
    defaultRiskLevel: pathRule.defaultRiskLevel,
    issueType: result.issueType,
    message: result.message,
    url,
    durationMs,
    metadata: {
      paymentPathId: pathRule.id,
      billingCycle: pathRule.billingCycle,
      paymentMethod: pathRule.paymentMethod,
      expectedPaymentMethods: pathRule.expectedPaymentMethods,
      actualPaymentMethods: result.comparison.actual,
      unknownPaymentMethods: result.comparison.unknownMethods,
      rawPaymentMethodLabels: result.visibleMethods.rawLabels,
      paymentMethodSetMatched: result.comparison.matched,
      availablePaymentMethods: result.methods,
      missingExpected: result.missingExpected,
      unexpectedVisible: result.unexpectedVisible,
    },
  });
}

function paymentStepsFromResult(pathRule: PaymentPathRule, result: PaymentMethodResult, durationMs: number): StepResult[] {
  const method = pathRule.paymentMethod;
  const rule = paymentMethodRules[method];
  const diagnostics = result.diagnostics;
  const selectIssue = diagnostics.found && !diagnostics.enabled
    ? 'PAYMENT_METHOD_DISABLED'
    : result.selectedMethod ? undefined : result.issueType || 'PAYMENT_METHOD_SELECT_FAILED';
  const actionIssue = result.clickedPay
    ? undefined
    : method === 'bank-transfer'
      ? (diagnostics.payButtonVisible ? 'UPLOAD_VOUCHER_FAILED' : 'UPLOAD_VOUCHER_BUTTON_NOT_FOUND')
      : (diagnostics.payButtonVisible && !diagnostics.payButtonEnabled ? 'PAY_NOW_DISABLED' : 'PAY_NOW_BUTTON_NOT_FOUND');
  const targetIssue = result.reachedTerminalPage
    ? undefined
    : diagnostics.targetMode === 'no-navigation'
      ? 'PAYMENT_NAVIGATION_NOT_OCCURRED'
      : result.issueType || 'PAYMENT_TARGET_NOT_REACHED';

  return [
    stepResult(`payment:${pathRule.id}:select`, stepStatus(result.selectedMethod), {
      name: paymentStepName(method, 'select'),
      type: 'action',
      defaultRiskLevel: rule.defaultRiskLevel,
      issueType: selectIssue,
      message: result.selectedMethod ? `${rule.name} 已选中。` : result.message,
      url: diagnostics.currentUrl,
      durationMs: 0,
      metadata: {
        paymentPathId: pathRule.id,
        billingCycle: pathRule.billingCycle,
        paymentMethod: method,
        selected: result.selectedMethod,
        found: diagnostics.found,
        visible: diagnostics.visible,
        enabled: diagnostics.enabled,
        clicked: diagnostics.clicked,
        locatorCount: diagnostics.locatorCount,
        selectedStateEvidence: diagnostics.selectedStateEvidence,
        radioDebug: diagnostics.radioDebug,
        suggestedTestIds: diagnostics.suggestedTestIds,
      },
    }),
    stepResult(`payment:${pathRule.id}:action`, stepStatus(result.clickedPay, !result.selectedMethod), {
      name: paymentStepName(method, 'action'),
      type: 'action',
      defaultRiskLevel: rule.defaultRiskLevel,
      issueType: result.clickedPay || !result.selectedMethod ? undefined : actionIssue,
      message: result.clickedPay ? '已触发支付动作。' : result.message,
      url: diagnostics.currentUrl,
      durationMs: 0,
      metadata: {
        paymentPathId: pathRule.id,
        billingCycle: pathRule.billingCycle,
        paymentMethod: method,
        actionTriggered: result.clickedPay,
        payButtonVisible: diagnostics.payButtonVisible,
        payButtonEnabled: diagnostics.payButtonEnabled,
        payButtonLocatorCount: diagnostics.payButtonLocatorCount,
      },
    }),
    stepResult(`payment:${pathRule.id}:target`, stepStatus(result.reachedTerminalPage, !result.clickedPay), {
      name: paymentStepName(method, 'target'),
      type: 'checkpoint',
      defaultRiskLevel: rule.defaultRiskLevel,
      issueType: result.reachedTerminalPage || !result.clickedPay ? undefined : targetIssue,
      message: result.message,
      url: result.terminalUrl,
      durationMs,
      metadata: {
        paymentPathId: pathRule.id,
        billingCycle: pathRule.billingCycle,
        paymentMethod: method,
        expectedTarget: pathRule.expectedTarget,
        navigationMode: diagnostics.targetMode,
        popupOpened: diagnostics.popupOpened,
        navigationOccurred: diagnostics.navigationOccurred,
        targetReached: result.reachedTerminalPage,
        actualUrl: result.terminalUrl,
        terminalText: result.terminalText.slice(0, 500),
        safety: '仅验证进入第三方支付页/表单页，不输入支付信息、不点击最终付款、不提交真实凭证。',
      },
    }),
  ];
}

async function runPaymentPath(
  options: ScenarioExecutionOptions<RuntimeEnv>,
  pathRule: PaymentPathRule,
  page = options.page!,
): Promise<StepResult[]> {
  const version = options.env.version as RuntimeVersion;

  if (!isPaymentPathSupported(pathRule, version)) {
    return [unsupportedPaymentPathStep(pathRule, version)];
  }

  const orderFlow = await runSubscriptionOrderFlow(options, pathRule, page);
  const steps = [...orderFlow.steps];
  if (!orderFlow.reachedPaymentMethodPage) return steps;

  const paymentMethodSetStartedAt = Date.now();
  const paymentMethodSet = await verifyPaymentMethodAvailability(page, pathRule.expectedPaymentMethods);
  steps.push(paymentMethodSetStep(pathRule, paymentMethodSet, page.url(), Date.now() - paymentMethodSetStartedAt));
  if (!paymentMethodSet.success) return steps;

  const startedAt = Date.now();
  const paymentResult = await verifyPaymentMethodBranch(page, pathRule);
  steps.push(...paymentStepsFromResult(pathRule, paymentResult, Date.now() - startedAt));
  return steps;
}

async function runFlowStep(
  steps: StepResult[],
  stepId: SubscriptionPaymentStepId,
  action: () => Promise<SubscriptionFlowResult>,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const startedAt = Date.now();
  const result = await action();
  steps.push(flowStep(stepId, result, Date.now() - startedAt, metadata));
  return result.success;
}

export async function subscriptionPaymentScenario(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<ScenarioResult> {
  if (!options.page) {
    throw new Error('subscriptionPaymentScenario requires a Playwright page.');
  }

  const paymentPaths = resolvePaymentPaths(process.env.E2E_PAYMENT_PATH);

  if (paymentPaths.length > 1) {
    if (!options.browser) {
      throw new Error('subscriptionPaymentScenario requires a Playwright browser for isolated E2E_PAYMENT_PATH=all contexts.');
    }

    const allSteps: StepResult[] = [];
    const version = options.env.version as RuntimeVersion;
    for (let index = 0; index < paymentPaths.length; index += 1) {
      const pathRule = paymentPaths[index];
      if (!isPaymentPathSupported(pathRule, version)) {
        allSteps.push(unsupportedPaymentPathStep(pathRule, version));
        continue;
      }

      const isolatedContext = await options.browser.newContext();
      const isolatedPage = await isolatedContext.newPage();
      try {
        const pathSteps = await runPaymentPath({
          ...options,
          context: isolatedContext,
          page: isolatedPage,
        }, pathRule, isolatedPage);
        allSteps.push(...pathSteps.map((step) => ({
          ...step,
          stepId: step.stepId.startsWith('payment:') ? step.stepId : `${pathRule.id}:${step.stepId}`,
          metadata: {
            ...step.metadata,
            paymentPathId: pathRule.id,
            billingCycle: pathRule.billingCycle,
            paymentMethod: pathRule.paymentMethod,
            isolatedContext: true,
            isolatedContextIndex: index,
          },
        })));
      } finally {
        await isolatedContext.close().catch(() => undefined);
      }
    }
    return scenarioResult(options, allSteps);
  }

  const pathRule = paymentPaths[0];
  const steps: StepResult[] = [];
  steps.push(...await runPaymentPath(options, pathRule, options.page));
  return scenarioResult(options, steps);
}
