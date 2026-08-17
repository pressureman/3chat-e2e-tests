import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { cnEnv, type RuntimeEnv } from '../configs/env.cn';
import { intlEnv } from '../configs/env.intl';
import { runScenarioSuite } from '../engine/runner';
import { deleteSpaceScenario } from '../scenarios/delete-space.scenario';
import type { RunMode, Version } from '../scenarios/types';

dotenv.config();

const version = (process.env.E2E_VERSION || 'cn') as Version;
const runMode = (process.env.E2E_RUN_MODE || 'manual') as RunMode;

function selectedEnv(): RuntimeEnv {
  if (version !== 'cn' && version !== 'intl') {
    throw new Error(`delete-space only supports E2E_VERSION=cn or intl, received: ${version}`);
  }
  return version === 'intl' ? intlEnv : cnEnv;
}

test.setTimeout(1_800_000);

test(`delete-space cleanup @${version}`, async ({ page, context, browser }, testInfo) => {
  const runResult = await runScenarioSuite({
    scenarios: [{ id: 'delete-space', run: deleteSpaceScenario }],
    page,
    context,
    browser,
    env: selectedEnv(),
    version,
    runMode,
    scenarioRetries: 0,
    notifyScenarioResults: false,
  });

  const scenario = runResult.scenarios[0];
  const reportPath = path.join(runResult.runDir, 'scenarios', 'delete-space', 'report.md');
  if (await fs.stat(reportPath).then(() => true).catch(() => false)) {
    await testInfo.attach('delete-space-report', { path: reportPath, contentType: 'text/markdown' });
  }

  const screenshotPath = scenario.steps.find((step) => step.screenshot)?.screenshot;
  if (screenshotPath && await fs.stat(screenshotPath).then(() => true).catch(() => false)) {
    await testInfo.attach('delete-space-final-state', { path: screenshotPath, contentType: 'image/png' });
  }

  expect(
    scenario.success,
    `delete-space success=false, report: ${reportPath}`,
  ).toBeTruthy();
});
