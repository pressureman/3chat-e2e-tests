import { expect, test } from '@playwright/test';
import { latestCodeFromLogs } from '../helpers/aliyun-sms';

const recipient = '15000000160';

function logEntry(time: number, code: string) {
  return {
    __time__: time,
    phone: recipient,
    message: `验证码：${code}`,
  };
}

test('does not return a verification code sent before the current request', () => {
  const sentAt = Date.now();

  expect(latestCodeFromLogs([
    logEntry(sentAt - 65_000, '111111'),
  ], recipient, sentAt)).toBeUndefined();
});

test('returns the latest verification code sent after the current request', () => {
  const sentAt = Date.now();

  expect(latestCodeFromLogs([
    logEntry(sentAt - 65_000, '111111'),
    logEntry(sentAt + 1_000, '222222'),
    logEntry(sentAt + 2_000, '333333'),
  ], recipient, sentAt)).toBe('333333');
});

test('accepts a verification code logged in the same second as sentAt', () => {
  const sentAt = Date.now();
  const sentAtFloor = Math.floor(sentAt / 1000) * 1000;

  expect(latestCodeFromLogs([
    logEntry(sentAtFloor, '444444'),
  ], recipient, sentAt)).toBe('444444');
});
