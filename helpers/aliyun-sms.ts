import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeEnv } from '../configs/env.cn';

const BUSINESS_CODE_PATTERNS = [
  /code["'\s:：=]+(\d{6})/i,
  /验证码[^\d]*(\d{6})/i,
];
const FALLBACK_CODE_PATTERN = /\b\d{6}\b/;
const LOG_API_BASE_URL = 'https://logs.dev.newcoretech.com';
const PHONE_PREFIX = '150';
const COUNTER_FILE = path.resolve(process.cwd(), '.data', 'test-phone-counter.json');
const usedPhones = new Set<string>();

export type SmsLogConfig = RuntimeEnv['smsLog'];

export type GetSmsCodeOptions = {
  phone: string;
  sentAt: number;
  logConfig: SmsLogConfig;
  timeoutMs?: number;
  intervalMs?: number;
};

export type GetEmailCodeOptions = {
  email: string;
  sentAt: number;
  logConfig: SmsLogConfig;
  timeoutMs?: number;
  intervalMs?: number;
};

type CounterState = {
  current: number;
};

type AliyunLogEntry = Record<string, unknown>;

function optionalEnv(...names: string[]): string | undefined {
  return names.map((name) => process.env[name]).find(Boolean);
}

async function readCounter(): Promise<CounterState> {
  try {
    const raw = await fs.readFile(COUNTER_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CounterState>;
    return { current: Number(parsed.current) || 0 };
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return { current: 0 };
    }
    throw error;
  }
}

async function writeCounter(state: CounterState): Promise<void> {
  await fs.mkdir(path.dirname(COUNTER_FILE), { recursive: true });
  await fs.writeFile(COUNTER_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function phoneFromCounter(counter: number): string {
  return `${PHONE_PREFIX}${String(counter).padStart(8, '0')}`;
}

export async function generateTestPhone(): Promise<string> {
  const state = await readCounter();
  let next = state.current;
  let phone = '';

  do {
    next += 1;
    phone = phoneFromCounter(next);
  } while (usedPhones.has(phone));

  usedPhones.add(phone);
  await writeCounter({ current: next });
  return phone;
}

function smsQuery(phone: string): string {
  return phone;
}

function emailQuery(email: string): string {
  return email;
}

function endpointUrl(config: SmsLogConfig): string {
  const baseUrl = config.endpoint || LOG_API_BASE_URL;
  return `${baseUrl}/logs/${encodeURIComponent(config.project)}/${encodeURIComponent(config.logstore)}`;
}

function logDebugContext(recipient: string, config: SmsLogConfig, query: string, recipientLabel = 'phone'): string {
  return [
    `env=${config.env}`,
    `project=${config.project}`,
    `logstore=${config.logstore}`,
    `query=${maskRecipient(query)}`,
    `${recipientLabel}=${maskRecipient(recipient)}`,
  ].join(', ');
}

async function queryAliyunLogs(query: string, sentAt: number, config: SmsLogConfig): Promise<AliyunLogEntry[]> {
  const token = optionalEnv('ALIYUN_LOG_TOKEN', 'BUTLER_API_TOKEN');
  if (!token) {
    throw new Error('Missing required environment variable: ALIYUN_LOG_TOKEN or BUTLER_API_TOKEN');
  }
  const from = new Date(sentAt - 5 * 60_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  const response = await fetch(endpointUrl(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      query,
      limit: 100,
      offset: 0,
      env: config.env,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Aliyun log query failed: ${response.status} ${response.statusText}.`,
    );
  }

  const payload = await response.json() as unknown;
  if (Array.isArray(payload)) return payload as AliyunLogEntry[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.logs)) return record.logs as AliyunLogEntry[];
    if (Array.isArray(record.data)) return record.data as AliyunLogEntry[];
    if (Array.isArray(record.results)) return record.results as AliyunLogEntry[];
  }

  return [];
}

function entryTime(entry: AliyunLogEntry): number {
  const value = entry.__time__ ?? entry.time ?? entry.timestamp ?? entry.createdAt;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function entryText(entry: AliyunLogEntry): string {
  return Object.values(entry)
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ');
}

function extractSmsCode(text: string): string | undefined {
  for (const pattern of BUSINESS_CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return text.match(FALLBACK_CODE_PATTERN)?.[0];
}

export function latestCodeFromLogs(logs: AliyunLogEntry[], recipient: string, sentAt: number): string | undefined {
  const sentAtFloor = Math.floor(sentAt / 1000) * 1000;
  const latestAllowedAt = Date.now() + 60_000;
  return logs
    .filter((entry) => entryText(entry).includes(recipient))
    .filter((entry) => entryTime(entry) >= sentAtFloor)
    .filter((entry) => entryTime(entry) <= latestAllowedAt)
    .sort((left, right) => entryTime(right) - entryTime(left))
    .map((entry) => extractSmsCode(entryText(entry)))
    .find(Boolean);
}

export async function getSmsCode(options: GetSmsCodeOptions): Promise<string> {
  const config = options.logConfig;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const logs = await queryAliyunLogs(smsQuery(options.phone), options.sentAt, config);
      const code = latestCodeFromLogs(logs, options.phone, options.sentAt);
      if (code) return code;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) {
    throw new Error(`Aliyun SMS code query timed out. ${logDebugContext(options.phone, config, smsQuery(options.phone))}. Original error: ${String(lastError)}`);
  }
  throw new Error(`Aliyun SMS code query timed out. ${logDebugContext(options.phone, config, smsQuery(options.phone))}.`);
}

export async function getEmailCode(options: GetEmailCodeOptions): Promise<string> {
  const config = options.logConfig;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const logs = await queryAliyunLogs(emailQuery(options.email), options.sentAt, config);
      const code = latestCodeFromLogs(logs, options.email, options.sentAt);
      if (code) return code;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) {
    throw new Error(`Aliyun email code query timed out. ${logDebugContext(options.email, config, emailQuery(options.email), 'email')}. Original error: ${String(lastError)}`);
  }
  throw new Error(`Aliyun email code query timed out. ${logDebugContext(options.email, config, emailQuery(options.email), 'email')}.`);
}

export function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

export function maskEmail(email: string): string {
  return email.replace(/^(.{2}).*(@.*)$/, '$1***$2');
}

function maskRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    return maskEmail(recipient);
  }

  return maskPhone(recipient);
}
