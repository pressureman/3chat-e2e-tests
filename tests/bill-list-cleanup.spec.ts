import { expect, test } from '@playwright/test';
import {
  cancelBillActionPattern,
  pendingPaymentStatusPattern,
  rowTextIndicatesPendingPayment,
} from '../flows/billing/bill-list-cleanup.flow';
import {
  vtableActionCellIsMore,
  vtableRowLooksPending,
} from '../flows/billing/bill-list-vtable.flow';

test('pending payment status pattern matches CN and intl labels', () => {
  expect(pendingPaymentStatusPattern.test('待支付')).toBe(true);
  expect(pendingPaymentStatusPattern.test('Pending Payment')).toBe(true);
  expect(pendingPaymentStatusPattern.test('pending payment')).toBe(true);
  expect(pendingPaymentStatusPattern.test('已支付')).toBe(false);
});

test('cancel bill action pattern matches CN 作废 and intl Cancel labels', () => {
  expect(cancelBillActionPattern.test('作废')).toBe(true);
  expect(cancelBillActionPattern.test('取消')).toBe(true);
  expect(cancelBillActionPattern.test('Cancel')).toBe(true);
});

test('rowTextIndicatesPendingPayment ignores header-only rows', () => {
  expect(rowTextIndicatesPendingPayment('BILL-001 Business 待支付 2026-01-01')).toBe(true);
  expect(rowTextIndicatesPendingPayment('Status')).toBe(false);
  expect(rowTextIndicatesPendingPayment('Pending Payment CNY 100')).toBe(true);
});

test('vtable pending detection treats More action as pending bill', () => {
  expect(vtableActionCellIsMore('More')).toBe(true);
  expect(vtableActionCellIsMore('更多')).toBe(true);
  expect(vtableActionCellIsMore('Detail')).toBe(false);
  expect(vtableRowLooksPending('120193 3Chat', 'Online', 'More')).toBe(true);
  expect(vtableRowLooksPending('119406 paid', 'Paid', 'Detail')).toBe(false);
});

test('vtable pending detection recognizes PENDING_PAID with empty Actions cell', () => {
  expect(vtableRowLooksPending('120193 3Chat', 'PENDING_PAID', '')).toBe(true);
  expect(vtableActionCellIsMore('')).toBe(false);
});
