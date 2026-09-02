import type { RiskLevel, Version } from '../scenarios/types';

export type RuntimeVersion = Exclude<Version, 'all'>;

export type PaymentPathId =
  | 'monthly-credit-card'
  | 'quarterly-credit-card'
  | 'quarterly-alipay'
  | 'quarterly-bank-transfer';
export type PaymentPathSelection = PaymentPathId | 'all';
export type BillingCycle = 'monthly' | 'quarterly';
export type PaymentMethod = 'credit-card' | 'alipay' | 'bank-transfer';
export type PaymentTarget = 'alipay-page' | 'stripe-page' | 'feishu-form';

export interface SubscriptionBillingRule {
  id: 'subscription-renew';
  name: string;
  path: string;
  renewText: RegExp;
  defaultRiskLevel: RiskLevel;
}

export interface PaymentMethodRule {
  id: PaymentMethod;
  name: string;
  enabledVersions: RuntimeVersion[];
  expectedTarget: PaymentTarget;
  expectedOrigins?: string[];
  expectedUrlIncludes?: string[];
  expectedPageText?: string[];
  selectText: RegExp;
  submitText: RegExp;
  terminalText: RegExp;
  terminalUrl: RegExp;
  defaultRiskLevel: RiskLevel;
  optional?: boolean;
}

export interface PaymentPathRule {
  id: PaymentPathId;
  name: string;
  billingCycle: BillingCycle;
  paymentMethod: PaymentMethod;
  expectedPaymentMethods: PaymentMethod[];
  expectedTarget: PaymentTarget;
  expectedOrigins?: string[];
  expectedUrlIncludes?: string[];
  expectedPageText?: string[];
  defaultRiskLevel: RiskLevel;
  required: boolean;
  enabledVersions: RuntimeVersion[];
}

export const subscriptionBillingRule: SubscriptionBillingRule = {
  id: 'subscription-renew',
  name: '我的订阅页续费',
  path: '/user-hub/package/detail',
  renewText: /^续费$|^去续费$|^变更订阅$|^Renew$|^Renew Subscription$|^Upgrade$|^Change Plan$/i,
  defaultRiskLevel: 'P1',
};

export const paymentMethodRules: Record<PaymentMethod, PaymentMethodRule> = {
  'credit-card': {
    id: 'credit-card',
    name: '信用卡支付',
    enabledVersions: ['cn', 'intl'],
    expectedTarget: 'stripe-page',
    expectedOrigins: ['https://checkout.stripe.com'],
    expectedUrlIncludes: ['stripe', 'checkout'],
    expectedPageText: ['Stripe', 'Credit card', 'Card number', 'Checkout'],
    selectText: /信用卡|银行卡|Credit card|Card|Stripe/i,
    submitText: /立即支付|确认支付|去支付|Pay now|Pay/i,
    terminalText: /Stripe|Credit card|Card number|卡号|Checkout/i,
    terminalUrl: /stripe|checkout\.stripe|billing\.stripe|pay\.stripe/i,
    defaultRiskLevel: 'P1',
  },
  alipay: {
    id: 'alipay',
    name: '支付宝支付',
    enabledVersions: ['cn'],
    expectedTarget: 'alipay-page',
    expectedUrlIncludes: ['alipay', 'cashier'],
    expectedPageText: ['支付宝', 'Alipay', '扫码支付', '付款'],
    selectText: /支付宝|Alipay/i,
    submitText: /立即支付|确认支付|去支付|Pay now|Pay/i,
    terminalText: /支付宝|Alipay|扫码支付|付款/i,
    terminalUrl: /alipay|alipaydev|render\.alipay|openapi\.alipay|cashier/i,
    defaultRiskLevel: 'P1',
  },
  'bank-transfer': {
    id: 'bank-transfer',
    name: '对公转账',
    enabledVersions: ['cn'],
    expectedTarget: 'feishu-form',
    expectedUrlIncludes: ['feishu', 'larksuite', 'forms'],
    expectedPageText: ['飞书', 'Feishu', 'Lark', '表单', 'Form'],
    selectText: /对公转账|Public Transfer|publicTransfer|Corporate transfer|Wire transfer/i,
    submitText: /上传凭证|提交凭证|Upload|Voucher|Receipt/i,
    terminalText: /飞书|Feishu|Lark|表单|Form/i,
    terminalUrl: /feishu|larksuite|jinshuju|form|forms/i,
    defaultRiskLevel: 'P2',
    optional: true,
  },
};

export const paymentPathRules: PaymentPathRule[] = [
  {
    id: 'monthly-credit-card',
    name: '月付 - 信用卡',
    billingCycle: 'monthly',
    paymentMethod: 'credit-card',
    expectedPaymentMethods: ['credit-card'],
    expectedTarget: paymentMethodRules['credit-card'].expectedTarget,
    expectedOrigins: paymentMethodRules['credit-card'].expectedOrigins,
    expectedUrlIncludes: paymentMethodRules['credit-card'].expectedUrlIncludes,
    expectedPageText: paymentMethodRules['credit-card'].expectedPageText,
    defaultRiskLevel: 'P1',
    required: true,
    enabledVersions: ['cn', 'intl'],
  },
  {
    id: 'quarterly-credit-card',
    name: '季付 - 信用卡',
    billingCycle: 'quarterly',
    paymentMethod: 'credit-card',
    expectedPaymentMethods: ['credit-card', 'alipay', 'bank-transfer'],
    expectedTarget: paymentMethodRules['credit-card'].expectedTarget,
    expectedOrigins: paymentMethodRules['credit-card'].expectedOrigins,
    expectedUrlIncludes: paymentMethodRules['credit-card'].expectedUrlIncludes,
    expectedPageText: paymentMethodRules['credit-card'].expectedPageText,
    defaultRiskLevel: 'P1',
    required: true,
    enabledVersions: ['cn', 'intl'],
  },
  {
    id: 'quarterly-alipay',
    name: '季付 - 支付宝',
    billingCycle: 'quarterly',
    paymentMethod: 'alipay',
    expectedPaymentMethods: ['credit-card', 'alipay', 'bank-transfer'],
    expectedTarget: paymentMethodRules.alipay.expectedTarget,
    expectedOrigins: paymentMethodRules.alipay.expectedOrigins,
    expectedUrlIncludes: paymentMethodRules.alipay.expectedUrlIncludes,
    expectedPageText: paymentMethodRules.alipay.expectedPageText,
    defaultRiskLevel: 'P1',
    required: true,
    enabledVersions: ['cn'],
  },
  {
    id: 'quarterly-bank-transfer',
    name: '季付 - 对公转账',
    billingCycle: 'quarterly',
    paymentMethod: 'bank-transfer',
    expectedPaymentMethods: ['credit-card', 'alipay', 'bank-transfer'],
    expectedTarget: paymentMethodRules['bank-transfer'].expectedTarget,
    expectedOrigins: paymentMethodRules['bank-transfer'].expectedOrigins,
    expectedUrlIncludes: paymentMethodRules['bank-transfer'].expectedUrlIncludes,
    expectedPageText: paymentMethodRules['bank-transfer'].expectedPageText,
    defaultRiskLevel: 'P2',
    required: true,
    enabledVersions: ['cn'],
  },
];

export const paymentPathRulesById: Record<PaymentPathId, PaymentPathRule> = paymentPathRules.reduce((acc, rule) => {
  acc[rule.id] = rule;
  return acc;
}, {} as Record<PaymentPathId, PaymentPathRule>);

export function appOrigin(version: RuntimeVersion): string {
  return version === 'intl' ? 'https://app.3chat.ai' : 'https://app.3chatai.cn';
}

export function billingUrl(version: RuntimeVersion, path: string): string {
  return `${appOrigin(version)}${path}`;
}

export function parsePaymentPath(value?: string): PaymentPathSelection {
  if (
    value === 'monthly-credit-card'
    || value === 'quarterly-credit-card'
    || value === 'quarterly-alipay'
    || value === 'quarterly-bank-transfer'
    || value === 'all'
  ) {
    return value;
  }
  return 'monthly-credit-card';
}

export function resolvePaymentPaths(value: string | undefined): PaymentPathRule[] {
  const selection = parsePaymentPath(value);
  return selection === 'all'
    ? paymentPathRules
    : [paymentPathRulesById[selection]];
}

export function isPaymentPathSupported(pathRule: PaymentPathRule, version: RuntimeVersion): boolean {
  return pathRule.enabledVersions.includes(version);
}
