import { expect, test } from '@playwright/test';
import type { PaymentMethod } from '../configs/billing-rules';
import {
  evaluatePaymentPageReadiness,
  PAYMENT_PAGE_READY_TIMEOUT_MS,
  type AvailablePaymentMethod,
} from '../flows/billing/payment-method.flow';

function creditCard(enabled: boolean): AvailablePaymentMethod[] {
  return [{
    method: 'credit-card',
    found: true,
    visible: true,
    enabled,
    locatorCount: 1,
  }];
}

const expectedMethods: PaymentMethod[] = ['credit-card'];

test('waits when bill data still contains placeholders and the payment method is disabled', () => {
  const readiness = evaluatePaymentPageReadiness(
    'Bill ID - Currency CNY Service Duration 0 Day(s) Number of Seats - Total CNY 0 Credit cards',
    creditCard(false),
    expectedMethods,
    PAYMENT_PAGE_READY_TIMEOUT_MS,
    false,
  );

  expect(PAYMENT_PAGE_READY_TIMEOUT_MS).toBe(10_000);
  expect(readiness).toMatchObject({
    ready: false,
    billIdReady: false,
    serviceDurationReady: false,
    seatCountReady: false,
    totalReady: false,
    expectedMethodsEnabled: false,
  });
});

test('becomes ready only after bill data and the expected payment method are usable', () => {
  const readiness = evaluatePaymentPageReadiness(
    'Bill ID 96328 Currency CNY Service Duration 30 Day(s) Number of Seats 5 Total CNY 5,980 Credit cards',
    creditCard(true),
    expectedMethods,
    PAYMENT_PAGE_READY_TIMEOUT_MS,
    false,
  );

  expect(readiness).toMatchObject({
    ready: true,
    billIdReady: true,
    serviceDurationReady: true,
    seatCountReady: true,
    totalReady: true,
    expectedMethodsEnabled: true,
  });
});
