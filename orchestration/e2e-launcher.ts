import type { Browser } from '@playwright/test';
import { cnEnv, type RuntimeEnv } from '../configs/env.cn';
import { e2eProfiles, type E2EProfileScenario } from '../configs/e2e-profiles';
import { intlEnv } from '../configs/env.intl';
import { runScenarioSuite } from '../engine/runner';
import { executeLocalizationSuite } from '../localization/localization-executor';
import type { LocalizationRunReport } from '../localization/report';
import type { RunMode, RunResult, Version } from '../scenarios/types';
import type { ProgressEvent } from '../tests/_progress';
import { archiveReportDirectories } from '../helpers/report-archive';
import { sendReportEmail } from '../helpers/email-client';
import {
  notifyFeishuLocalizationResult,
  notifyReportEmailFailure,
  type FeishuLocalizationSummary,
} from '../helpers/feishu';

export type VersionOption = Version | 'all';

export interface RunE2EInput {
  browser: Browser;
  runMode: RunMode;
  version: VersionOption;
  onProgress?: (event: ProgressEvent) => void;
}

export interface LocalizationRunSummary {
  env: RuntimeEnv;
  runDir: string;
  report: LocalizationRunReport;
}

export interface E2ELauncherResult {
  runMode: RunMode;
  version: VersionOption;
  scenarioRuns: RunResult[];
  localizationRuns: LocalizationRunSummary[];
  scenarioErrors: Error[];
  localizationErrors: Error[];
  success: boolean;
  shouldBlockCI: boolean;
}

function selectedEnvs(version: VersionOption): RuntimeEnv[] {
  if (version === 'all') return [cnEnv, intlEnv];
  return version === 'intl' ? [intlEnv] : [cnEnv];
}

function selectedScenarios(profileScenarios: E2EProfileScenario[]): E2EProfileScenario[] {
  const override = process.env.E2E_SCENARIOS?.trim();
  if (!override || override === 'all') return profileScenarios;
  if (override === 'none') return [];

  const requestedIds: string[] = override
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean);
  const scenarioById = new Map(profileScenarios.map((scenario) => [scenario.id, scenario]));
  const scenariosByGroup = new Map<string, E2EProfileScenario[]>();
  for (const scenario of profileScenarios) {
    const [group] = scenario.id.split('-');
    const existing = scenariosByGroup.get(group) || [];
    existing.push(scenario);
    scenariosByGroup.set(group, existing);
  }
  const unknownIds = requestedIds.filter((id: string) => !scenarioById.has(id) && !scenariosByGroup.has(id));
  if (unknownIds.length) {
    throw new Error(`Unsupported E2E_SCENARIOS=${unknownIds.join(',')}`);
  }

  const selected: E2EProfileScenario[] = requestedIds.flatMap((id: string): E2EProfileScenario[] => {
    const scenario = scenarioById.get(id);
    if (scenario) return [scenario];
    return scenariosByGroup.get(id) || [];
  });
  return Array.from(new Map(selected.map((scenario) => [scenario.id, scenario])).values());
}

function shouldRunLocalization(profileDefault: boolean): boolean {
  const override = process.env.E2E_LOCALIZATION?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return profileDefault;
}

function buildLocalizationFeishuSummary(input: {
  runMode: RunMode;
  env: RuntimeEnv;
  runDir: string;
  report: LocalizationRunReport;
}): FeishuLocalizationSummary {
  const affectedPages = input.report.pages
    .filter((page) => page.issues.length > 0 || page.status === 'error' || page.error)
    .slice(0, 10)
    .map((page) => ({
      pageId: page.pageId,
      path: page.path,
      status: page.status,
      issueCount: page.issues.length,
      error: page.error,
      url: page.url,
    }));
  const topIssues = input.report.pages
    .flatMap((page) => page.issues.map((issue) => ({
      pageId: issue.pageId,
      text: issue.text,
      expectedLocale: issue.expectedLocale,
      detectedLocale: issue.detectedLocale,
      trigger: issue.trigger.type,
      target: issue.trigger.target,
      url: issue.url,
    })))
    .slice(0, 10);
  const durationMs = input.report.pages.reduce((total, page) => total + page.durationMs, 0);

  return {
    notificationType: 'localization',
    runId: input.report.runId,
    version: input.env.version,
    envLabel: input.env.label,
    runMode: input.runMode,
    status: input.report.summary.issueCount > 0 || input.report.summary.errors > 0 ? 'failed' : 'passed',
    expectedLocale: input.report.expectedLocale,
    executedAt: new Date().toISOString(),
    durationMs,
    reportPath: `${input.runDir}/summary.md`,
    pages: input.report.summary.pages,
    passed: input.report.summary.passed,
    failed: input.report.summary.failed,
    errors: input.report.summary.errors,
    issueCount: input.report.summary.issueCount,
    checkedTextCount: input.report.summary.checkedTextCount,
    affectedPages,
    topIssues,
  };
}

type ReportEmailNotifyMode = 'always' | 'failed' | 'off';

function resolveReportEmailNotifyMode(): ReportEmailNotifyMode {
  const mode = process.env.E2E_REPORT_EMAIL_NOTIFY?.trim().toLowerCase();
  if (mode === 'always' || mode === 'failed' || mode === 'off') return mode;

  const legacyEnabled = process.env.E2E_REPORT_EMAIL_ENABLED?.trim().toLowerCase();
  if (legacyEnabled === 'true') return 'always';
  if (legacyEnabled === 'false') return 'off';

  return 'always';
}

function shouldSendReportEmail(result: E2ELauncherResult): boolean {
  const mode = resolveReportEmailNotifyMode();
  if (mode === 'off') return false;
  if (mode === 'failed') return !result.success;
  return true;
}

function reportEmailRecipients(): string[] {
  return (process.env.E2E_REPORT_EMAIL_TO || '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  return escapeHtml(value);
}

function reportEmailSubject(result: E2ELauncherResult): string {
  return `[3Chat E2E] ${result.runMode} - ${result.success ? 'PASSED' : 'FAILED'}`;
}

function reportArchiveBaseName(result: E2ELauncherResult): string {
  const runId = result.scenarioRuns[0]?.runId || result.localizationRuns[0]?.report.runId || Date.now();
  return `3chat-e2e-${result.runMode}-${result.version}-${runId}-${result.success ? 'passed' : 'failed'}`;
}

function reportEmailContent(result: E2ELauncherResult): string {
  const scenarioResults = result.scenarioRuns.flatMap((run) => run.scenarios);
  const startedTimes = result.scenarioRuns.map((run) => run.startedAt).sort();
  const finishedTimes = result.scenarioRuns.map((run) => run.finishedAt).sort();
  const startedAt = startedTimes[0];
  const finishedAt = finishedTimes[finishedTimes.length - 1];
  const failedScenarios = scenarioResults.filter((scenario) => !scenario.success).length;
  const tenantCleanupFailures = scenarioResults.flatMap((scenario) => (
    scenario.steps
      .filter((step) => (
        step.status === 'failed'
        && step.issueType?.startsWith('TENANT_CLEANUP_')
      ))
      .map(() => scenario.reportKey || scenario.scenario)
  ));
  const localizationPages = result.localizationRuns.reduce(
    (total, run) => total + run.report.summary.pages,
    0,
  );
  const localizationIssues = result.localizationRuns.reduce(
    (total, run) => total + run.report.summary.issueCount,
    0,
  );
  const rows: [string, unknown][] = [
    ['执行类型', result.runMode],
    ['执行环境', result.version],
    ['开始时间', startedAt],
    ['结束时间', finishedAt],
    ['总场景数', scenarioResults.length],
    ['通过数', scenarioResults.length - failedScenarios],
    ['失败数', failedScenarios],
    ['flaky 数量', scenarioResults.filter((scenario) => scenario.flaky).length],
    ['租户清理失败数', tenantCleanupFailures.length],
    ['租户清理失败场景', tenantCleanupFailures.join(', ') || 'none'],
    ['Scenario runner errors', result.scenarioErrors.length],
    ['Localization runs', result.localizationRuns.length],
    ['Localization pages', localizationPages],
    ['Localization issues', localizationIssues],
    ['Localization runner errors', result.localizationErrors.length],
  ];

  return [
    '<p>3Chat E2E 完整执行已结束，完整详情请查看附件中的 report zip。</p>',
    '<table border="1" cellpadding="6" cellspacing="0">',
    ...rows.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${emailValue(value)}</td></tr>`),
    '</table>',
  ].join('\n');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

async function sendE2EReportEmailIfEnabled(result: E2ELauncherResult): Promise<void> {
  if (!shouldSendReportEmail(result)) return;

  const reportDirs = Array.from(new Set([
    ...result.scenarioRuns.map((run) => run.runDir),
    ...result.localizationRuns.map((run) => run.runDir),
  ]));
  if (!reportDirs.length) {
    console.error('[report-email] Report archive failed: no report directories were generated for this run.');
    return;
  }

  let zipPath: string;
  try {
    zipPath = await archiveReportDirectories(
      reportDirs,
      reportArchiveBaseName(result),
    );
  } catch (error) {
    console.error('[report-email] Report archive failed:', error);
    return;
  }

  try {
    const recipients = reportEmailRecipients();
    const subject = reportEmailSubject(result);
    await sendReportEmail({
      recipients,
      subject,
      content: reportEmailContent(result),
      attachmentPath: zipPath,
    });
  } catch (error) {
    console.error('[report-email] Email API failed:', error);
    await notifyReportEmailFailure({
      notificationType: 'report-email-failed',
      runMode: result.runMode,
      version: result.version,
      suiteStatus: result.success ? 'passed' : 'failed',
      subject: reportEmailSubject(result),
      recipients: reportEmailRecipients(),
      attachmentPath: zipPath,
      errorMessage: errorMessage(error),
      executedAt: new Date().toISOString(),
    }).catch((notifyError) => {
      console.error('[report-email] Feishu notification for email failure failed:', notifyError);
    });
  }
}

export async function runE2ELauncher(input: RunE2EInput): Promise<E2ELauncherResult> {
  const profile = e2eProfiles[input.runMode];
  if (!profile) {
    throw new Error(`Unsupported E2E_RUN_MODE=${input.runMode}`);
  }

  const scenarioRuns: RunResult[] = [];
  const localizationRuns: LocalizationRunSummary[] = [];
  const scenarioErrors: Error[] = [];
  const localizationErrors: Error[] = [];
  const scenarios = selectedScenarios(profile.scenarios);
  const runLocalization = shouldRunLocalization(profile.localization);

  input.onProgress?.({
    kind: 'suite:start',
    suite: 'profile',
    version: input.version,
    runMode: input.runMode,
  });

  for (const env of selectedEnvs(input.version)) {
    if (scenarios.length) {
      try {
        const runResult = await runScenarioSuite({
          scenarios,
          browser: input.browser,
          env,
          version: env.version,
          runMode: input.runMode,
          isolateScenarios: true,
          onProgress: input.onProgress,
        });

        scenarioRuns.push(runResult);
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        scenarioErrors.push(normalizedError);
        console.error(normalizedError);
      }
    }

    if (runLocalization) {
      const context = await input.browser.newContext();
      const page = await context.newPage();

      try {
        const localizationResult = await executeLocalizationSuite({ page, env, onProgress: input.onProgress });
        localizationRuns.push({
          env,
          runDir: localizationResult.runDir,
          report: localizationResult.report,
        });

        await notifyFeishuLocalizationResult(
          buildLocalizationFeishuSummary({
            runMode: input.runMode,
            env,
            runDir: localizationResult.runDir,
            report: localizationResult.report,
          }),
        );
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        localizationErrors.push(normalizedError);
        console.error(normalizedError);
      } finally {
        await context.close();
      }
    }
  }

  const hasScenarioFailure = scenarioRuns.some((run) => !run.success) || scenarioErrors.length > 0;
  const hasLocalizationFailure = localizationErrors.length > 0;
  const hasLocalizationIssues = localizationRuns.some((run) => (
    run.report.summary.issueCount > 0 || run.report.summary.errors > 0
  ));

  const result: E2ELauncherResult = {
    runMode: input.runMode,
    version: input.version,
    scenarioRuns,
    localizationRuns,
    scenarioErrors,
    localizationErrors,
    success: !hasScenarioFailure && !hasLocalizationFailure && !hasLocalizationIssues,
    shouldBlockCI: scenarioRuns.some((run) => run.shouldBlockCI),
  };

  await sendE2EReportEmailIfEnabled(result);

  input.onProgress?.({ kind: 'suite:end', suite: 'profile', success: result.success });

  return result;
}
