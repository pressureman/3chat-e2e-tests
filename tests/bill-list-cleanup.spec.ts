import { expect, test } from '@playwright/test';
import {
  pendingPaymentStatusPattern,
  rowTextIndicatesPendingPayment,
} from '../flows/billing/bill-list-cleanup.flow';

test('pending payment status pattern matches CN and intl labels', () => {
  expect(pendingPaymentStatusPattern.test('待支付')).toBe(true);
  expect(pendingPaymentStatusPattern.test('Pending Payment')).toBe(true);
  expect(pendingPaymentStatusPattern.test('pending payment')).toBe(true);
  expect(pendingPaymentStatusPattern.test('已支付')).toBe(false);
});

test('rowTextIndicatesPendingPayment ignores header-only rows', () => {
  expect(rowTextIndicatesPendingPayment('BILL-001 Business 待支付 2026-01-01')).toBe(true);
  expect(rowTextIndicatesPendingPayment('Status')).toBe(false);
  expect(rowTextIndicatesPendingPayment('Pending Payment CNY 100')).toBe(true);
});
