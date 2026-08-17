import crypto from 'node:crypto';
import type { RiskLevel, RunMode, Version } from '../scenarios/types';

export type FeishuE2ESummary = {
  notificationType?: 'scenario';
  scenario: string;
  version: Version;
  envLabel: string;
  runMode: RunMode;
  status: 'passed' | 'failed';
  executedAt?: string;
  method?: string;
  loginMethod?: string;
  registerType?: string;
  durationMs?: number;
  reportPath?: string;
  failedSteps: Array<{
    stepId?: string;
    stepName?: string;
    riskLevel?: string;
    message?: string;
    url?: string;
  }>;
};

export type FeishuE2ERunSummary = {
  notificationType: 'run';
  runId: string;
  version: Version;
  envLabel: string;
  runMode: RunMode;
  status: 'passed' | 'failed';
  executedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  summaryPath?: string;
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  highestRiskLevel: RiskLevel;
  failedScenarios: Array<{
    scenario: string;
    reportKey?: string;
    riskLevel?: string;
  }>;
  passedScenarios: Array<{
    scenario: string;
    reportKey?: string;
  }>;
};

export type FeishuLocalizationSummary = {
  notificationType: 'localization';
  runId: string;
  version: Version;
  envLabel: string;
  runMode: RunMode;
  status: 'passed' | 'failed';
  expectedLocale: string;
  executedAt?: string;
  durationMs?: number;
  reportPath?: string;
  pages: number;
  passed: number;
  failed: number;
  errors: number;
  issueCount: number;
  checkedTextCount: number;
  affectedPages: Array<{
    pageId: string;
    path?: string;
    status?: string;
    issueCount?: number;
    error?: string;
    url?: string;
  }>;
  topIssues: Array<{
    pageId: string;
    text: string;
    expectedLocale?: string;
    detectedLocale?: string;
    trigger?: string;
    target?: string;
    url?: string;
  }>;
};

export type FeishuTenantCleanupFailureSummary = {
  envLabel: string;
  runMode: RunMode;
  reportKey: string;
  phone: string;
  registrationBusinessSuccess: boolean;
  cleanupStatus: string;
  credentialSource: string;
  directCaptureSucceeded: boolean;
  loginRecoveryAttempted: boolean;
  loginRecoveryStatus?: string;
  retryAllowed: boolean;
  issueType: string;
  httpStatus?: number;
  tenantIdFound: boolean;
  cookieFound: boolean;
  retryCount: number;
  reportPath: string;
};

export type FeishuReportEmailFailureSummary = {
  notificationType: 'report-email-failed';
  runMode: RunMode;
  version: string;
  suiteStatus: 'passed' | 'failed';
  subject: string;
  recipients: string[];
  attachmentPath?: string;
  errorMessage: string;
  executedAt?: string;
};

type FeishuNotifyMode = 'always' | 'failed' | 'off';

function resolveNotifyMode(): FeishuNotifyMode {
  const mode = (process.env.E2E_FEISHU_NOTIFY || 'failed').trim().toLowerCase();
  if (mode === 'always' || mode === 'off') return mode;
  return 'failed';
}

function shouldNotify(summary: { status: 'passed' | 'failed' }): boolean {
  const mode = resolveNotifyMode();
  if (mode === 'off') return false;
  if (mode === 'failed') return summary.status === 'failed';
  return true;
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '-';
  if (durationMs < 1000) return `${durationMs}ms`;

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatLocalDateTime(isoDateTime?: string): string {
  if (!isoDateTime) return '';
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function versionLabel(version: Version): string {
  return version === 'cn' ? 'CN' : 'INTL';
}

function resultTitle(status: FeishuE2ESummary['status']): string {
  return status === 'passed'
    ? '✅ 3Chat E2E 通过'
    : '❌ 3Chat E2E 失败';
}

function scenarioName(scenario: { scenario: string; reportKey?: string }): string {
  return scenario.reportKey || scenario.scenario;
}

function scenarioListText(scenarios: Array<{ scenario: string; reportKey?: string }>): string {
  const text = scenarios.map(scenarioName).join(',');
  return text || 'none';
}

function runResultTitle(status: FeishuE2ERunSummary['status']): string {
  return status === 'passed'
    ? '✅ 3Chat E2E Run 通过'
    : '❌ 3Chat E2E Run 失败';
}

function localizationResultTitle(status: FeishuLocalizationSummary['status']): string {
  return status === 'passed'
    ? '✅ 3Chat E2E Localization 通过'
    : '❌ 3Chat E2E Localization 失败';
}

function reportEmailFailureTitle(): string {
  return '❌ 3Chat E2E 报告邮件发送失败';
}

function buildFieldPayload(summary: FeishuE2ESummary): Record<string, unknown> {
  const [firstFailedStep] = summary.failedSteps;
  const passedScenario = summary.status === 'passed' ? summary.scenario : 'none';
  const failedScenario = summary.status === 'failed' ? summary.scenario : 'none';
  return {
    title: resultTitle(summary.status),
    notificationType: summary.notificationType ?? 'scenario',
    env: summary.envLabel,
    version: summary.version,
    versionLabel: versionLabel(summary.version),
    runMode: summary.runMode,
    passedScenariosText: passedScenario,
    failedScenariosText: failedScenario,
    status: summary.status,
    executedAt: summary.executedAt ?? '',
    executedAtLocal: formatLocalDateTime(summary.executedAt),
    method: summary.method ?? '',
    loginMethod: summary.loginMethod ?? '',
    registerType: summary.registerType ?? '',
    durationMs: summary.durationMs ?? null,
    duration: formatDuration(summary.durationMs),
    reportPath: summary.reportPath ?? '',
    failedSteps: summary.failedSteps,
    failedStepCount: summary.failedSteps.length,
    firstFailedStepId: firstFailedStep?.stepId ?? '',
    firstFailedStepName: firstFailedStep?.stepName ?? '',
    firstFailedStepRiskLevel: firstFailedStep?.riskLevel ?? '',
    firstFailedStepMessage: firstFailedStep?.message ?? '',
    firstFailedStepUrl: firstFailedStep?.url ?? '',
  };
}

function buildRunFieldPayload(summary: FeishuE2ERunSummary): Record<string, unknown> {
  return {
    title: runResultTitle(summary.status),
    notificationType: summary.notificationType,
    runId: summary.runId,
    env: summary.envLabel,
    version: summary.version,
    versionLabel: versionLabel(summary.version),
    runMode: summary.runMode,
    status: summary.status,
    executedAt: summary.executedAt ?? '',
    executedAtLocal: formatLocalDateTime(summary.executedAt),
    finishedAt: summary.finishedAt ?? '',
    finishedAtLocal: formatLocalDateTime(summary.finishedAt),
    durationMs: summary.durationMs ?? null,
    duration: formatDuration(summary.durationMs),
    summaryPath: summary.summaryPath ?? '',
    passedScenariosText: scenarioListText(summary.passedScenarios),
    failedScenariosText: scenarioListText(summary.failedScenarios),
    highestRiskLevel: summary.highestRiskLevel,
    failedScenarios: summary.failedScenarios,
  };
}

function affectedPagesText(pages: FeishuLocalizationSummary['affectedPages']): string {
  return pages.map((page) => page.pageId).join(',') || 'none';
}

function topIssuesText(issues: FeishuLocalizationSummary['topIssues']): string {
  return issues
    .map((issue) => `${issue.pageId}: ${issue.text}`)
    .join(' | ') || 'none';
}

function buildLocalizationFieldPayload(summary: FeishuLocalizationSummary): Record<string, unknown> {
  const [firstAffectedPage] = summary.affectedPages;
  const [firstIssue] = summary.topIssues;
  const firstError = summary.affectedPages.find((page) => page.error);

  return {
    title: localizationResultTitle(summary.status),
    notificationType: summary.notificationType,
    runId: summary.runId,
    env: summary.envLabel,
    version: summary.version,
    versionLabel: versionLabel(summary.version),
    runMode: summary.runMode,
    status: summary.status,
    expectedLocale: summary.expectedLocale,
    executedAt: summary.executedAt ?? '',
    executedAtLocal: formatLocalDateTime(summary.executedAt),
    durationMs: summary.durationMs ?? null,
    duration: formatDuration(summary.durationMs),
    pages: summary.pages,
    passed: summary.passed,
    failed: summary.failed,
    errors: summary.errors,
    issueCount: summary.issueCount,
    checkedTextCount: summary.checkedTextCount,
    affectedPagesText: affectedPagesText(summary.affectedPages),
    topIssuesText: topIssuesText(summary.topIssues),
    firstAffectedPageId: firstAffectedPage?.pageId ?? '',
    firstIssueText: firstIssue?.text ?? '',
    firstErrorMessage: firstError?.error ?? '',
    reportPath: summary.reportPath ?? '',
    affectedPages: summary.affectedPages,
    topIssues: summary.topIssues,
  };
}

function buildReportEmailFailureFieldPayload(
  summary: FeishuReportEmailFailureSummary,
): Record<string, unknown> {
  return {
    title: reportEmailFailureTitle(),
    notificationType: summary.notificationType,
    runMode: summary.runMode,
    version: summary.version,
    suiteStatus: summary.suiteStatus,
    subject: summary.subject,
    recipients: summary.recipients.join(','),
    recipientCount: summary.recipients.length,
    attachmentPath: summary.attachmentPath ?? '',
    errorMessage: summary.errorMessage,
    executedAt: summary.executedAt ?? '',
    executedAtLocal: formatLocalDateTime(summary.executedAt),
  };
}

function buildReportEmailFailureBotPostPayload(
  summary: FeishuReportEmailFailureSummary,
): Record<string, unknown> {
  const lines = [
    `模式：${summary.runMode}`,
    `执行环境：${summary.version}`,
    `Suite 结果：${summary.suiteStatus}`,
    `邮件主题：${summary.subject}`,
    `收件人：${summary.recipients.join(',') || '-'}`,
    `附件：${summary.attachmentPath || '-'}`,
    `错误：${summary.errorMessage}`,
    `时间：${formatLocalDateTime(summary.executedAt) || '-'}`,
  ];

  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: reportEmailFailureTitle(),
          content: lines.map((text) => [{ tag: 'text', text }]),
        },
      },
    },
  };
}

function buildPostLines(summary: FeishuE2ESummary): Array<Array<{ tag: 'text'; text: string }>> {
  const lines = [
    `环境：${summary.envLabel} ${versionLabel(summary.version)}`.trim(),
    `模式：${summary.runMode}`,
    `场景：${summary.scenario}`,
    `结果：${summary.status}`,
    `执行时间：${formatLocalDateTime(summary.executedAt) || '-'}`,
    `方式：${summary.method || '-'}`,
    `耗时：${formatDuration(summary.durationMs)}`,
  ];

  if (summary.status === 'failed') {
    lines.push(`失败步骤数：${summary.failedSteps.length}`);
    for (const [index, step] of summary.failedSteps.entries()) {
      lines.push(
        `${index + 1}. ${step.stepName || step.stepId || '-'}`,
        `风险：${step.riskLevel || '-'}`,
        `原因：${step.message || '-'}`,
        `页面：${step.url || '-'}`,
      );
    }
  }

  lines.push(`报告：${summary.reportPath || '-'}`);

  return lines.map((text) => [{ tag: 'text', text }]);
}

function buildBotPostPayload(summary: FeishuE2ESummary): Record<string, unknown> {
  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: resultTitle(summary.status),
          content: buildPostLines(summary),
        },
      },
    },
  };
}

function buildRunPostLines(summary: FeishuE2ERunSummary): Array<Array<{ tag: 'text'; text: string }>> {
  const lines = [
    `环境：${summary.envLabel} ${versionLabel(summary.version)}`.trim(),
    `模式：${summary.runMode}`,
    `结果：${summary.status}`,
    `执行时间：${formatLocalDateTime(summary.executedAt) || '-'}`,
    `耗时：${formatDuration(summary.durationMs)}`,
    `成功场景：${scenarioListText(summary.passedScenarios)}`,
    `失败场景：${scenarioListText(summary.failedScenarios)}`,
    `最高风险：${summary.highestRiskLevel}`,
  ];

  if (summary.failedScenarios.length) {
    lines.push(`失败场景数：${summary.failedCount}`);
  }

  lines.push(`报告：${summary.summaryPath || '-'}`);

  return lines.map((text) => [{ tag: 'text', text }]);
}

function buildRunBotPostPayload(summary: FeishuE2ERunSummary): Record<string, unknown> {
  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: runResultTitle(summary.status),
          content: buildRunPostLines(summary),
        },
      },
    },
  };
}

function buildLocalizationPostLines(summary: FeishuLocalizationSummary): Array<Array<{ tag: 'text'; text: string }>> {
  const lines = [
    `环境：${summary.envLabel} ${versionLabel(summary.version)}`.trim(),
    `模式：${summary.runMode}`,
    `结果：${summary.status}`,
    `期望语言：${summary.expectedLocale}`,
    `页面数：${summary.pages}`,
    `通过：${summary.passed}`,
    `失败：${summary.failed}`,
    `错误：${summary.errors}`,
    `问题数：${summary.issueCount}`,
    `检查文本数：${summary.checkedTextCount}`,
    `执行时间：${formatLocalDateTime(summary.executedAt) || '-'}`,
    `耗时：${formatDuration(summary.durationMs)}`,
  ];

  if (summary.affectedPages.length) {
    lines.push('影响页面：');
    for (const [index, page] of summary.affectedPages.slice(0, 10).entries()) {
      lines.push(
        `${index + 1}. ${page.pageId} issues=${page.issueCount ?? 0} status=${page.status || '-'}`,
        page.error ? `错误：${page.error}` : '',
        page.url ? `页面：${page.url}` : '',
      );
    }
  }

  if (summary.topIssues.length) {
    lines.push('Top Issues:');
    for (const [index, issue] of summary.topIssues.slice(0, 10).entries()) {
      lines.push(
        `${index + 1}. ${issue.pageId}: ${issue.text}`,
        issue.url ? `页面：${issue.url}` : '',
      );
    }
  }

  lines.push(`报告：${summary.reportPath || '-'}`);

  return lines
    .filter((text) => text !== '')
    .map((text) => [{ tag: 'text', text }]);
}

function buildLocalizationBotPostPayload(summary: FeishuLocalizationSummary): Record<string, unknown> {
  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: localizationResultTitle(summary.status),
          content: buildLocalizationPostLines(summary),
        },
      },
    },
  };
}

function buildTenantCleanupFieldPayload(
  summary: FeishuTenantCleanupFailureSummary,
): Record<string, unknown> {
  return {
    title: '❌ 3Chat E2E 租户清理失败',
    notificationType: 'tenant-cleanup',
    env: summary.envLabel,
    runMode: summary.runMode,
    reportKey: summary.reportKey,
    phone: summary.phone,
    registrationBusinessSuccess: summary.registrationBusinessSuccess,
    cleanupStatus: summary.cleanupStatus,
    credentialSource: summary.credentialSource,
    directCaptureSucceeded: summary.directCaptureSucceeded,
    loginRecoveryAttempted: summary.loginRecoveryAttempted,
    loginRecoveryStatus: summary.loginRecoveryStatus ?? null,
    retryAllowed: summary.retryAllowed,
    issueType: summary.issueType,
    httpStatus: summary.httpStatus ?? null,
    tenantIdFound: summary.tenantIdFound,
    cookieFound: summary.cookieFound,
    retryCount: summary.retryCount,
    reportPath: summary.reportPath,
  };
}

function buildTenantCleanupBotPostPayload(
  summary: FeishuTenantCleanupFailureSummary,
): Record<string, unknown> {
  const lines = [
    `环境：${summary.envLabel}`,
    `模式：${summary.runMode}`,
    `场景：${summary.reportKey}`,
    `手机号：${summary.phone}`,
    `注册业务成功：${summary.registrationBusinessSuccess}`,
    `清理状态：${summary.cleanupStatus}`,
    `凭证来源：${summary.credentialSource}`,
    `当前上下文直接捕获：${summary.directCaptureSucceeded}`,
    `尝试登录恢复：${summary.loginRecoveryAttempted}`,
    `登录恢复状态：${summary.loginRecoveryStatus ?? '-'}`,
    `允许重试：${summary.retryAllowed}`,
    `问题类型：${summary.issueType}`,
    `HTTP status：${summary.httpStatus ?? '-'}`,
    `找到 Tenant ID：${summary.tenantIdFound}`,
    `找到 Cookie：${summary.cookieFound}`,
    `retryCount：${summary.retryCount}`,
    `报告：${summary.reportPath}`,
  ];

  return {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: '❌ 3Chat E2E 租户清理失败',
          content: lines.map((text) => [{ tag: 'text', text }]),
        },
      },
    },
  };
}

function buildTenantCleanupWebhookPayload(
  webhook: string,
  summary: FeishuTenantCleanupFailureSummary,
): Record<string, unknown> {
  if (isBaseAutomationWebhook(webhook)) {
    return buildTenantCleanupFieldPayload(summary);
  }

  return signedPayload(buildTenantCleanupBotPostPayload(summary));
}

function isBaseAutomationWebhook(webhook: string): boolean {
  return webhook.includes('/base/automation/webhook/');
}

function buildWebhookPayload(webhook: string, summary: FeishuE2ESummary): Record<string, unknown> {
  if (isBaseAutomationWebhook(webhook)) {
    return buildFieldPayload(summary);
  }

  return signedPayload(buildBotPostPayload(summary));
}

function buildRunWebhookPayload(webhook: string, summary: FeishuE2ERunSummary): Record<string, unknown> {
  if (isBaseAutomationWebhook(webhook)) {
    return buildRunFieldPayload(summary);
  }

  return signedPayload(buildRunBotPostPayload(summary));
}

function buildLocalizationWebhookPayload(webhook: string, summary: FeishuLocalizationSummary): Record<string, unknown> {
  if (isBaseAutomationWebhook(webhook)) {
    return buildLocalizationFieldPayload(summary);
  }

  return signedPayload(buildLocalizationBotPostPayload(summary), process.env.E2E_LOCALIZATION_FEISHU_WEBHOOK_SECRET);
}

function buildReportEmailFailureWebhookPayload(
  webhook: string,
  summary: FeishuReportEmailFailureSummary,
): Record<string, unknown> {
  if (isBaseAutomationWebhook(webhook)) {
    return buildReportEmailFailureFieldPayload(summary);
  }

  return signedPayload(buildReportEmailFailureBotPostPayload(summary));
}

function signedPayload(content: Record<string, unknown>, secret = process.env.FEISHU_WEBHOOK_SECRET): Record<string, unknown> {
  if (!secret) return content;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = crypto
    .createHmac('sha256', `${timestamp}\n${secret}`)
    .update('')
    .digest('base64');

  return {
    timestamp,
    sign,
    ...content,
  };
}

async function warnOnFeishuError(response: Response): Promise<void> {
  const responseText = await response.text().catch(() => '');
  if (!response.ok) {
    console.warn(`Feishu webhook failed: ${response.status} ${response.statusText}${responseText ? ` ${responseText}` : ''}`);
    return;
  }

  if (!responseText) return;

  try {
    const data = JSON.parse(responseText) as { code?: number; StatusCode?: number; msg?: string; message?: string };
    const code = data.code ?? data.StatusCode ?? 0;
    if (code !== 0) {
      console.warn(`Feishu webhook returned code=${code}: ${data.msg || data.message || responseText}`);
    }
  } catch {
    // Some webhook implementations return plain text on success.
  }
}

export async function notifyFeishuE2eResult(summary: FeishuE2ESummary): Promise<void> {
  if (!shouldNotify(summary)) return;

  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildWebhookPayload(webhook, summary)),
    });

    await warnOnFeishuError(response);
  } catch (error) {
    console.warn('Feishu webhook failed:', error);
  }
}

export async function notifyFeishuE2eRunResult(summary: FeishuE2ERunSummary): Promise<void> {
  if (!shouldNotify(summary)) return;

  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildRunWebhookPayload(webhook, summary)),
    });

    await warnOnFeishuError(response);
  } catch (error) {
    console.warn('Feishu webhook failed:', error);
  }
}

export async function notifyFeishuLocalizationResult(summary: FeishuLocalizationSummary): Promise<void> {
  if (!shouldNotify(summary)) return;

  const webhook = process.env.E2E_LOCALIZATION_FEISHU_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildLocalizationWebhookPayload(webhook, summary)),
    });

    await warnOnFeishuError(response);
  } catch (error) {
    console.warn('Localization Feishu webhook failed:', error);
  }
}

export async function notifyReportEmailFailure(
  summary: FeishuReportEmailFailureSummary,
): Promise<void> {
  const webhook = process.env.E2E_REPORT_EMAIL_FAILURE_FEISHU_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildReportEmailFailureWebhookPayload(webhook, summary)),
    });

    await warnOnFeishuError(response);
  } catch (error) {
    console.warn('Report email failure Feishu webhook failed:', error);
  }
}

export async function notifyFeishuTenantCleanupFailure(
  summary: FeishuTenantCleanupFailureSummary,
): Promise<void> {
  if (process.env.E2E_TENANT_CLEANUP_FEISHU_NOTIFY?.trim().toLowerCase() !== 'true') return;

  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) return;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildTenantCleanupWebhookPayload(webhook, summary)),
    });

    await warnOnFeishuError(response);
  } catch (error) {
    console.warn('Tenant cleanup Feishu webhook failed:', error);
  }
}
