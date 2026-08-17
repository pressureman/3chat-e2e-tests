import fs from 'node:fs/promises';
import path from 'node:path';
import type { Version } from '../scenarios/types';

const REGISTER_PHONE_BY_VERSION: Record<
  'cn' | 'intl',
  readonly [firstPhone: string, retryPhone: string]
> = {
  cn: ['15000000160', '15000000161'],
  intl: ['15000000162', '15000000163'],
};

const DEFAULT_SMS_COOLDOWN_MS = 65_000;
const COOLDOWN_FILE = path.resolve(process.cwd(), '.data', 'register-phone-cooldown.json');
const COOLDOWN_LOCK_FILE = `${COOLDOWN_FILE}.lock`;

type RegisterPhoneCooldownEntry = {
  phone: string;
  lastSentAt: number;
};

export function resolveRegisterPhone(
  version: Version,
  retryCount: number,
): string {
  if (version !== 'cn' && version !== 'intl') {
    throw new Error(
      `REGISTER_PHONE_VERSION_UNSUPPORTED: version=${version}`,
    );
  }

  if (retryCount !== 0 && retryCount !== 1) {
    throw new Error(
      `REGISTER_PHONE_RETRY_UNSUPPORTED: retryCount=${retryCount}`,
    );
  }

  return REGISTER_PHONE_BY_VERSION[version][retryCount];
}

export function resolveRegisterPhoneSmsCooldownMs(): number {
  const raw = process.env.E2E_REGISTER_PHONE_SMS_COOLDOWN_MS?.trim();
  if (!raw) return DEFAULT_SMS_COOLDOWN_MS;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_SMS_COOLDOWN_MS;
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('SCENARIO_TIMEOUT: SMS cooldown aborted.');

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('SCENARIO_TIMEOUT: SMS cooldown aborted.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function withCooldownLock<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  await fs.mkdir(path.dirname(COOLDOWN_FILE), { recursive: true });

  for (;;) {
    try {
      const lock = await fs.open(COOLDOWN_LOCK_FILE, 'wx');
      try {
        return await action();
      } finally {
        await lock.close();
        await fs.unlink(COOLDOWN_LOCK_FILE).catch(() => undefined);
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
      await delay(100, signal);
    }
  }
}

async function readCooldownEntries(): Promise<RegisterPhoneCooldownEntry[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(COOLDOWN_FILE, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry): RegisterPhoneCooldownEntry[] => {
      if (
        !entry
        || typeof entry !== 'object'
        || typeof (entry as RegisterPhoneCooldownEntry).phone !== 'string'
        || !Number.isFinite((entry as RegisterPhoneCooldownEntry).lastSentAt)
      ) {
        return [];
      }

      return [{
        phone: (entry as RegisterPhoneCooldownEntry).phone,
        lastSentAt: (entry as RegisterPhoneCooldownEntry).lastSentAt,
      }];
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeCooldownEntries(entries: RegisterPhoneCooldownEntry[]): Promise<void> {
  await fs.writeFile(COOLDOWN_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

export async function waitForRegisterPhoneSmsCooldown(
  phone: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const cooldownMs = resolveRegisterPhoneSmsCooldownMs();
  if (cooldownMs === 0) return;

  for (;;) {
    const remainingMs = await withCooldownLock(async () => {
      const entries = await readCooldownEntries();
      const entry = entries.find((item) => item.phone === phone);
      return entry ? Math.max(0, entry.lastSentAt + cooldownMs - Date.now()) : 0;
    }, options.signal);
    if (remainingMs === 0) return;
    await delay(remainingMs, options.signal);
  }
}

export async function recordRegisterPhoneSmsSent(phone: string, lastSentAt = Date.now()): Promise<void> {
  await withCooldownLock(async () => {
    const entries = await readCooldownEntries();
    const nextEntries = entries.filter((entry) => entry.phone !== phone);
    nextEntries.push({ phone, lastSentAt });
    await writeCooldownEntries(nextEntries);
  });
}
