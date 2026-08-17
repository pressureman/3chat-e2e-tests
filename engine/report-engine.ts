import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunMode, RunResult, ScenarioResult, Version } from '../scenarios/types';

export interface CreateRunReportDirOptions {
  timestamp: string;
  runMode: RunMode;
  version: Version;
  env: string;
  baseDir?: string;
}

export interface RunReportDir {
  runId: string;
  runDir: string;
}

export interface WriteScenarioReportOptions {
  runDir: string;
}

export interface ArtifactDirs {
  tracesDir: string;
  artifactsDir: string;
}

function scenarioReportKey(result: ScenarioResult): string {
  return result.reportKey || result.scenario;
}

function scenarioReportDir(runDir: string, result: ScenarioResult): string {
  return path.join(runDir, 'scenarios', scenarioReportKey(result));
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function booleanText(value: boolean): string {
  return value ? 'true' : 'false';
}

function buildScenarioMarkdown(result: ScenarioResult): string {
  const lines = [
    `# Scenario Report: ${result.scenario}`,
    '',
    `- scenario: ${result.scenario}`,
    `- reportKey: ${scenarioReportKey(result)}`,
    `- env: ${result.env}`,
    `- version: ${result.version}`,
    `- runMode: ${result.runMode}`,
    `- success: ${booleanText(result.success)}`,
    `- flaky: ${booleanText(Boolean(result.flaky))}`,
    `- retryCount: ${result.retryCount || 0}`,
    `- highestRiskLevel: ${result.highestRiskLevel}`,
    `- shouldNotify: ${booleanText(result.shouldNotify)}`,
    `- shouldBlockCI: ${booleanText(result.shouldBlockCI)}`,
  ];

  if (result.flaky) {
    lines.push(
      '',
      '## Retry',
      '',
      '⚠️ Passed after retry',
      '',
      'First attempt:',
      '',
      result.firstFailureMessage || 'Failed before retry.',
      '',
      'Retry:',
      '',
      'passed',
    );
  }

  lines.push(
    '',
    '## Steps',
    '',
    '| stepId | name | type | status | defaultRiskLevel | finalRiskLevel | issueType | message | url | screenshot | durationMs |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const step of result.steps) {
    lines.push(
      [
        markdownCell(step.stepId),
        markdownCell(step.name),
        markdownCell(step.type),
        markdownCell(step.status),
        markdownCell(step.defaultRiskLevel),
        markdownCell(step.finalRiskLevel),
        markdownCell(step.issueType),
        markdownCell(step.message),
        markdownCell(step.url),
        markdownCell(step.screenshot),
        markdownCell(step.durationMs),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    );
  }

  if (result.scenario === 'channel') {
    const channelSteps = result.steps.filter((step) => step.metadata?.channelId);
    if (channelSteps.length) {
      lines.push(
        '',
        '## Channel Details',
        '',
        '| 渠道 | 版本 | 检查项 | 状态 | 默认等级 | 最终等级 | 预期 | 实际 | 问题 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      );

      for (const step of channelSteps) {
        const metadata = step.metadata || {};
        lines.push(
          [
            markdownCell(`${metadata.zhName || '-'} / ${metadata.enName || '-'}`),
            markdownCell(metadata.version),
            markdownCell(metadata.expectedType),
            markdownCell(step.status),
            markdownCell(step.defaultRiskLevel),
            markdownCell(step.finalRiskLevel),
            markdownCell(metadata.expectedUrl),
            markdownCell(metadata.actualUrl || step.url),
            markdownCell(step.message || step.issueType),
          ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
        );
      }
    }
  }

  if (result.scenario === 'register') {
    const registerStep = result.steps.find((step) => step.metadata?.registerType);
    if (registerStep?.metadata) {
      const metadata = registerStep.metadata;
      lines.push(
        '',
        '## Register Metadata',
        '',
        '| registerType | account | attempts | reason |',
        '| --- | --- | --- | --- |',
        [
          markdownCell(metadata.registerType),
          markdownCell(metadata.phone || metadata.email),
          markdownCell(metadata.attempts),
          markdownCell(metadata.reason),
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
      );
    }
  }

  if (result.scenario === 'subscription-payment') {
    const paymentSteps = result.steps.filter((step) => step.metadata?.paymentPathId || step.metadata?.paymentMethod);
    if (paymentSteps.length) {
      const paths = [...new Set(paymentSteps.map((step) => String(step.metadata?.paymentPathId || step.metadata?.paymentMethod)))];
      lines.push(
        '',
        '## Payment Path Summary',
        '',
        '| Payment Path | 计费周期 | 支付方式 | 整体状态 | 集合状态 | 选择状态 | 动作状态 | 目标页状态 | 默认等级 | 最终等级 | 最终URL | 问题 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      );

      for (const pathId of paths) {
        const pathSteps = paymentSteps.filter((step) => String(step.metadata?.paymentPathId || step.metadata?.paymentMethod) === pathId);
        const unsupported = pathSteps.find((step) => step.stepId.endsWith(':unsupported'));
        const paymentMethodSet = pathSteps.find((step) => step.stepId.endsWith(':payment-method-set'));
        const select = pathSteps.find((step) => step.stepId.endsWith(':select'));
        const action = pathSteps.find((step) => step.stepId.endsWith(':action'));
        const target = pathSteps.find((step) => step.stepId.endsWith(':target'));
        const finalStep = target || action || select || paymentMethodSet || unsupported || pathSteps[pathSteps.length - 1];
        lines.push(
          [
            markdownCell(pathId),
            markdownCell(finalStep?.metadata?.billingCycle),
            markdownCell(finalStep?.metadata?.paymentMethod),
            markdownCell(finalStep?.status),
            markdownCell(paymentMethodSet?.status || (unsupported ? 'skipped' : '-')),
            markdownCell(select?.status || (unsupported ? 'skipped' : '-')),
            markdownCell(action?.status || (unsupported ? 'skipped' : '-')),
            markdownCell(target?.status || (unsupported ? 'skipped' : '-')),
            markdownCell(finalStep?.defaultRiskLevel),
            markdownCell(finalStep?.finalRiskLevel),
            markdownCell(finalStep?.metadata?.actualUrl || finalStep?.url),
            markdownCell(finalStep?.issueType || finalStep?.metadata?.issueType || finalStep?.message),
          ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
        );
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function buildRunSummaryMarkdown(runResult: RunResult): string {
  const lines = [
    `# Run Summary: ${runResult.runId}`,
    '',
    `- runId: ${runResult.runId}`,
    `- env: ${runResult.env}`,
    `- version: ${runResult.version}`,
    `- runMode: ${runResult.runMode}`,
    `- success: ${booleanText(runResult.success)}`,
    `- flaky: ${booleanText(Boolean(runResult.flaky))}`,
    `- retryCount: ${runResult.retryCount || 0}`,
    `- highestRiskLevel: ${runResult.highestRiskLevel}`,
    `- shouldNotify: ${booleanText(runResult.shouldNotify)}`,
    `- shouldBlockCI: ${booleanText(runResult.shouldBlockCI)}`,
    '',
    '## Scenarios',
    '',
    '| reportKey | scenario | success | flaky | retryCount | highestRiskLevel | shouldNotify | shouldBlockCI | steps |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const scenario of runResult.scenarios) {
    lines.push(
      [
        markdownCell(scenarioReportKey(scenario)),
        markdownCell(scenario.scenario),
        markdownCell(booleanText(scenario.success)),
        markdownCell(scenario.flaky ? '⚠️ Passed after retry' : false),
        markdownCell(scenario.retryCount || 0),
        markdownCell(scenario.highestRiskLevel),
        markdownCell(booleanText(scenario.shouldNotify)),
        markdownCell(booleanText(scenario.shouldBlockCI)),
        markdownCell(scenario.steps.length),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    );
  }

  lines.push(
    '',
    '## Failed Scenarios',
    '',
    '| reportKey | failedStep | issueType | message |',
    '| --- | --- | --- | --- |',
  );
  for (const scenario of runResult.scenarios.filter((item) => !item.success)) {
    const failedStep = scenario.steps.find((step) => step.status === 'failed');
    lines.push(
      [
        markdownCell(scenarioReportKey(scenario)),
        markdownCell(failedStep?.name || failedStep?.stepId),
        markdownCell(failedStep?.issueType),
        markdownCell(failedStep?.message),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    );
  }

  lines.push(
    '',
    '## Tenant Cleanup',
    '',
    '| reportKey | phone | registration | cleanup | attempted | credentialSource | directCaptureSucceeded | loginRecoveryAttempted | loginRecoveryStatus | tenantIdFound | cookieFound | httpStatus | retryAllowed |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const scenario of runResult.scenarios) {
    const cleanupStep = scenario.steps.find((step) => step.stepId === 'cleanupTenant');
    if (!cleanupStep) continue;
    const metadata = cleanupStep.metadata || {};
    const firstAttemptCleanup = metadata.firstAttemptCleanup;
    const rows: Array<{ label: string; metadata: Record<string, unknown> }> = [];
    if (firstAttemptCleanup && typeof firstAttemptCleanup === 'object') {
      rows.push({
        label: `${scenarioReportKey(scenario)} (first attempt)`,
        metadata: firstAttemptCleanup as Record<string, unknown>,
      });
    }
    rows.push({ label: scenarioReportKey(scenario), metadata });

    for (const row of rows) {
      lines.push(
        [
          markdownCell(row.label),
          markdownCell(row.metadata.phone),
          markdownCell(row.metadata.registrationBusinessSuccess === true ? 'passed' : 'failed'),
          markdownCell(row.metadata.cleanupStatus || cleanupStep.status),
          markdownCell(row.metadata.cleanupAttempted),
          markdownCell(row.metadata.credentialSource),
          markdownCell(row.metadata.directCaptureSucceeded),
          markdownCell(row.metadata.loginRecoveryAttempted),
          markdownCell(row.metadata.loginRecoveryStatus),
          markdownCell(row.metadata.tenantIdFound),
          markdownCell(row.metadata.cookieFound),
          markdownCell(row.metadata.httpStatus),
          markdownCell(row.metadata.retryAllowed),
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function createRunReportDir(options: CreateRunReportDirOptions): Promise<RunReportDir> {
  const runId = `${options.timestamp}_${options.runMode}_${options.version}`;
  const runDir = path.join(options.baseDir ?? '.', 'reports', 'scenario', runId);

  await fs.mkdir(runDir, { recursive: true });

  return {
    runId,
    runDir,
  };
}

export async function createScenarioReportDir(runDir: string, result: ScenarioResult): Promise<string> {
  const reportDir = scenarioReportDir(runDir, result);

  await fs.mkdir(path.join(reportDir, 'screenshots'), { recursive: true });

  return reportDir;
}

export async function writeScenarioReport(
  result: ScenarioResult,
  options: WriteScenarioReportOptions,
): Promise<void> {
  const reportDir = await createScenarioReportDir(options.runDir, result);

  await fs.writeFile(path.join(reportDir, 'report.md'), buildScenarioMarkdown(result), 'utf8');
  await fs.writeFile(path.join(reportDir, 'report.json'), stringifyJson(result), 'utf8');
}

export async function writeRunSummary(runResult: RunResult): Promise<void> {
  await fs.mkdir(runResult.runDir, { recursive: true });

  await fs.writeFile(path.join(runResult.runDir, 'summary.md'), buildRunSummaryMarkdown(runResult), 'utf8');
  await fs.writeFile(path.join(runResult.runDir, 'summary.json'), stringifyJson(runResult), 'utf8');
}

export async function prepareArtifactsDirs(runDir: string): Promise<ArtifactDirs> {
  const tracesDir = path.join(runDir, 'traces');
  const artifactsDir = path.join(runDir, 'artifacts');

  await fs.mkdir(tracesDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  return {
    tracesDir,
    artifactsDir,
  };
}
