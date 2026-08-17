import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../configs/env.cn';
import type { ProgressEvent } from '../tests/_progress';
import { loginWithPassword } from '../flows/login/password-login.flow';
import { checkHomeAvatarMenuLocalization } from './interactions';
import { localizationPages } from './pages';
import { runLocalizationPage } from './page-runner';
import {
  createLocalizationRunDir,
  createLocalizationRunId,
  type LocalizationRunReport,
  writeLocalizationReport,
} from './report';
import type { LocalizationPageResult } from './types';

export interface RunLocalizationSuiteInput {
  page: Page;
  env: RuntimeEnv;
  onProgress?: (event: ProgressEvent) => void;
  runId?: string;
  runDir?: string;
}

export interface RunLocalizationSuiteResult {
  runId: string;
  runDir: string;
  report: LocalizationRunReport;
}

export async function runLocalizationSuite(
  input: RunLocalizationSuiteInput,
): Promise<RunLocalizationSuiteResult> {
  const runId = input.runId || createLocalizationRunId(new Date(), input.env.version);
  const runDir = input.runDir || await createLocalizationRunDir(runId);

  const loginResult = await loginWithPassword(input.page, input.env);
  if (!loginResult.success) {
    throw new Error(
      `localization must stop before page checks when login fails: ${
        loginResult.failureReason || loginResult.conclusion
      }`,
    );
  }
  input.onProgress?.({ kind: 'localization:login', env: input.env.version });

  const homeAvatarResult = await checkHomeAvatarMenuLocalization({
    page: input.page,
    env: input.env,
    runDir,
  });
  const results: LocalizationPageResult[] = [homeAvatarResult];
  input.onProgress?.({
    kind: 'localization:page:end',
    pageId: 'home-avatar-menu',
    env: input.env.version,
    issues: homeAvatarResult.issues.length,
    errors: 0,
  });

  for (const definition of localizationPages) {
    input.onProgress?.({
      kind: 'localization:page:start',
      pageId: definition.id,
      env: input.env.version,
    });
    const pageResult = await runLocalizationPage({
      page: input.page,
      definition,
      env: input.env,
      runDir,
    });
    results.push(pageResult);
    input.onProgress?.({
      kind: 'localization:page:end',
      pageId: definition.id,
      env: input.env.version,
      issues: pageResult.issues.length,
      errors: 0,
    });
  }

  const report = await writeLocalizationReport({
    env: input.env,
    results,
    runDir,
    runId,
  });

  input.onProgress?.({
    kind: 'localization:end',
    env: input.env.version,
    pages: report.summary.pages,
    errors: report.summary.errors,
    issues: report.summary.issueCount,
    runDir,
  });

  return {
    runId,
    runDir,
    report,
  };
}
