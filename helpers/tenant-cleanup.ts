import type { BrowserContext } from '@playwright/test';

export const TENANT_DISABLE_TIMEOUT_MS = 10_000;

export type CleanupCredentialSource =
  | 'onboarding'
  | 'current-context'
  | 'phone-login'
  | 'none';

export type CleanupLoginRecoveryStatus =
  | 'authenticated'
  | 'onboarding'
  | 'account-not-found'
  | 'failed';

export type TenantCleanupCredentials = {
  tenantId: string;
  cookieHeader: string;
  capturedAt: string;
};

export type TenantCleanupStatus =
  | 'success'
  | 'not-required'
  | 'missing-tenant-id'
  | 'missing-cookie'
  | 'login-recovery-failed'
  | 'api-failed'
  | 'timeout'
  | 'skipped-scenario-timeout';

export type TenantCleanupResult = {
  status: TenantCleanupStatus;
  attempted: boolean;
  credentialSource: CleanupCredentialSource;
  directCaptureSucceeded: boolean;
  loginRecoveryAttempted: boolean;
  loginRecoveryStatus?: CleanupLoginRecoveryStatus;
  tenantIdFound: boolean;
  cookieFound: boolean;
  httpStatus?: number;
  message?: string;
};

export type TenantCleanupCredentialState = Pick<
  TenantCleanupResult,
  | 'credentialSource'
  | 'directCaptureSucceeded'
  | 'tenantIdFound'
  | 'cookieFound'
>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TenantCleanupTracker {
  private credentials?: TenantCleanupCredentials;

  private tenantId?: string;

  private cookieHeader?: string;

  private credentialSource: CleanupCredentialSource = 'none';

  private directCaptureSucceeded = false;

  hasCompleteCredentials(): boolean {
    return Boolean(this.credentials);
  }

  hasCapturedCredentials(): boolean {
    return this.hasCompleteCredentials();
  }

  getCredentialState(): TenantCleanupCredentialState {
    return {
      credentialSource: this.credentialSource,
      directCaptureSucceeded: this.directCaptureSucceeded,
      tenantIdFound: Boolean(this.tenantId),
      cookieFound: Boolean(this.cookieHeader),
    };
  }

  async capture(options: {
    context: BrowserContext;
    disableUrl?: string;
    source: Exclude<CleanupCredentialSource, 'none'>;
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const intervalMs = options.intervalMs ?? 300;
    const deadline = Date.now() + timeoutMs;

    do {
      try {
        const cookies = options.disableUrl
          ? await options.context.cookies(options.disableUrl)
          : await options.context.cookies();
        const tenantId = cookies.find(
          (cookie) => cookie.name.toUpperCase() === 'TENANT_ID',
        )?.value;
        const cookieHeader = cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join('; ');

        if (tenantId) this.tenantId = tenantId;
        if (cookieHeader) this.cookieHeader = cookieHeader;
        if (this.tenantId && this.cookieHeader) {
          this.credentials = {
            tenantId: this.tenantId,
            cookieHeader: this.cookieHeader,
            capturedAt: new Date().toISOString(),
          };
          if (options.source === 'phone-login' || this.credentialSource === 'none') {
            this.credentialSource = options.source;
          }
          if (options.source === 'current-context') {
            this.directCaptureSucceeded = true;
          }
          return true;
        }
      } catch {
        // The context may be closed by the Scenario timeout handler.
      }

      if (Date.now() >= deadline) return false;
      await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    } while (Date.now() <= deadline);

    return false;
  }

  async captureRequiredCredentials(
    context: BrowserContext,
    options: {
      disableUrl?: string;
      source?: Exclude<CleanupCredentialSource, 'none'>;
      timeoutMs?: number;
      intervalMs?: number;
    } = {},
  ): Promise<boolean> {
    return this.capture({
      context,
      disableUrl: options.disableUrl,
      source: options.source || 'onboarding',
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    });
  }

  private resultContext(options: {
    loginRecoveryAttempted?: boolean;
    loginRecoveryStatus?: CleanupLoginRecoveryStatus;
  }): Omit<TenantCleanupResult, 'status' | 'attempted'> {
    return {
      ...this.getCredentialState(),
      loginRecoveryAttempted: options.loginRecoveryAttempted === true,
      loginRecoveryStatus: options.loginRecoveryStatus,
    };
  }

  async cleanup(options: {
    tenantCreated: boolean;
    disableUrl: string;
    referer: string;
    loginRecoveryAttempted?: boolean;
    loginRecoveryStatus?: CleanupLoginRecoveryStatus;
  }): Promise<TenantCleanupResult> {
    const context = this.resultContext(options);

    if (!options.tenantCreated && !this.hasCompleteCredentials()) {
      return {
        status: 'not-required',
        attempted: false,
        ...context,
      };
    }

    if (!context.tenantIdFound) {
      return {
        status: 'missing-tenant-id',
        attempted: false,
        ...context,
        message: 'Tenant cleanup credentials did not include TENANT_ID.',
      };
    }

    if (!context.cookieFound || !this.credentials) {
      return {
        status: 'missing-cookie',
        attempted: false,
        ...context,
        message: 'Tenant cleanup credentials did not include a Cookie header.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TENANT_DISABLE_TIMEOUT_MS);
    try {
      const response = await fetch(options.disableUrl, {
        method: 'PUT',
        headers: {
          accept: 'application/json, text/plain, */*',
          agent: 'WEB',
          referer: options.referer,
          Cookie: this.credentials.cookieHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: this.credentials.tenantId }),
        signal: controller.signal,
      });
      const responseText = await response.text().catch(() => '');
      let businessCode: unknown;
      if (responseText) {
        try {
          const payload = JSON.parse(responseText) as Record<string, unknown>;
          businessCode = payload.code;
        } catch {
          // An HTTP 2xx response without a JSON code is successful by contract.
        }
      }
      const businessSucceeded = businessCode === undefined
        || businessCode === 200
        || businessCode === '200';

      if (response.ok && businessSucceeded) {
        return {
          status: 'success',
          attempted: true,
          ...context,
          httpStatus: response.status,
        };
      }

      return {
        status: 'api-failed',
        attempted: true,
        ...context,
        httpStatus: response.status,
        message: response.ok
          ? `Tenant disable API returned business code ${String(businessCode)}.`
          : `Tenant disable API returned HTTP ${response.status}.`,
      };
    } catch (error) {
      const timedOut = controller.signal.aborted
        || (error instanceof Error && error.name === 'AbortError');
      return {
        status: timedOut ? 'timeout' : 'api-failed',
        attempted: true,
        ...context,
        message: timedOut
          ? `Tenant disable API timed out after ${TENANT_DISABLE_TIMEOUT_MS}ms.`
          : 'Tenant disable API request failed.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
