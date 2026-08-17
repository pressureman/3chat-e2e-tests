import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeEnv } from '../configs/env.cn';
import type { LocalizationPageResult } from './types';

export interface LocalizationRunReport {
  runId: string;
  version: RuntimeEnv['version'];
  expectedLocale: RuntimeEnv['locale']['expected'];
  summary: {
    pages: number;
    passed: number;
    failed: number;
    errors: number;
    checkedTextCount: number;
    issueCount: number;
  };
  pages: LocalizationPageResult[];
}

export interface WriteLocalizationReportInput {
  env: RuntimeEnv;
  results: LocalizationPageResult[];
  runDir: string;
  runId: string;
}

export function createLocalizationRunId(date = new Date(), version: RuntimeEnv['version']): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}_localization_${version}`;
}

export async function createLocalizationRunDir(runId: string): Promise<string> {
  const runDir = path.join('.', 'reports', 'localization', runId);
  await fs.mkdir(path.join(runDir, 'screenshots'), { recursive: true });
  return runDir;
}

export async function writeLocalizationReport(input: WriteLocalizationReportInput): Promise<LocalizationRunReport> {
  const report = buildLocalizationRunReport(input);

  await fs.mkdir(input.runDir, { recursive: true });
  await fs.writeFile(path.join(input.runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(input.runDir, 'summary.md'), buildMarkdown(report), 'utf8');

  return report;
}

function buildLocalizationRunReport(input: WriteLocalizationReportInput): LocalizationRunReport {
  return {
    runId: input.runId,
    version: input.env.version,
    expectedLocale: input.env.locale.expected,
    summary: {
      pages: input.results.length,
      passed: input.results.filter((result) => result.status === 'passed').length,
      failed: input.results.filter((result) => result.status === 'failed').length,
      errors: input.results.filter((result) => result.status === 'error').length,
      checkedTextCount: input.results.reduce((sum, result) => sum + result.checkedTextCount, 0),
      issueCount: input.results.reduce((sum, result) => sum + result.issues.length, 0),
    },
    pages: input.results,
  };
}

function buildMarkdown(report: LocalizationRunReport): string {
  const lines = [
    `# Localization Report: ${report.runId}`,
    '',
    `- version: ${report.version}`,
    `- expectedLocale: ${report.expectedLocale}`,
    `- pages: ${report.summary.pages}`,
    `- passed: ${report.summary.passed}`,
    `- failed: ${report.summary.failed}`,
    `- errors: ${report.summary.errors}`,
    `- checkedTextCount: ${report.summary.checkedTextCount}`,
    `- issueCount: ${report.summary.issueCount}`,
    '',
    '## Pages',
    '',
    '| pageId | path | url | status | checkedTextCount | issues | durationMs | error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const page of report.pages) {
    lines.push([
      markdownCell(page.pageId),
      markdownCell(page.path),
      markdownCell(page.url),
      markdownCell(page.status),
      markdownCell(page.checkedTextCount),
      markdownCell(page.issues.length),
      markdownCell(page.durationMs),
      markdownCell(page.error),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  const issues = report.pages.flatMap((page) => page.issues);
  if (issues.length) {
    lines.push(
      '',
      '## Issues',
      '',
      '| pageId | text | expectedLocale | detectedLocale | trigger | target | selector | source | screenshot |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );

    for (const issue of issues) {
      lines.push([
        markdownCell(issue.pageId),
        markdownCell(issue.text),
        markdownCell(issue.expectedLocale),
        markdownCell(issue.detectedLocale),
        markdownCell(issue.trigger.type),
        markdownCell(issue.trigger.target),
        markdownCell(issue.element?.selector),
        markdownCell(issue.element?.source),
        markdownCell(issue.screenshot),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
  }

  return `${lines.join('\n')}\n`;
}

function markdownCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}
