import { expect, test } from '@playwright/test';
import dotenv from 'dotenv';
import { cnEnv, type RuntimeEnv } from '../configs/env.cn';
import { intlEnv } from '../configs/env.intl';
import { runLocalizationSuite } from '../localization/suite-runner';
import type { Version } from '../scenarios/types';
import { createProgressLogger } from './_progress';

dotenv.config();

const version = (process.env.E2E_VERSION || 'intl') as Version;

function selectedEnv(): RuntimeEnv {
  return version === 'cn' ? cnEnv : intlEnv;
}

test.setTimeout(1_800_000);

test(`localization pages @${version}`, async ({ page }, testInfo) => {
  const env = selectedEnv();
  const progress = createProgressLogger(test.step);
  progress({ kind: 'suite:start', suite: 'localization', version });

  const { runDir, report } = await runLocalizationSuite({ page, env, onProgress: progress });

  progress({ kind: 'suite:end', suite: 'localization', success: report.summary.errors === 0 });
  await testInfo.attach('localization-summary', {
    path: `${runDir}/summary.md`,
    contentType: 'text/markdown',
  });

  testInfo.annotations.push({
    type: 'localization-report',
    description: `${runDir} (${report.summary.issueCount} issues, ${report.summary.errors} errors)`,
  });

  expect(report.summary.errors, `localization report: ${runDir}`).toBe(0);
});
