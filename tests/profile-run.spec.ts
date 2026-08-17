import { expect, test } from '@playwright/test';
import dotenv from 'dotenv';
import { runE2ELauncher, type VersionOption } from '../orchestration/e2e-launcher';
import type { RunMode } from '../scenarios/types';
import { createProgressLogger } from './_progress';

dotenv.config();

const runMode = (process.env.E2E_RUN_MODE || 'manual') as RunMode;
const version = (process.env.E2E_VERSION || 'cn') as VersionOption;

test.setTimeout(3_600_000);

test('run e2e profile', async ({ browser }) => {
  const progress = createProgressLogger(test.step);

  const result = await runE2ELauncher({
    browser,
    runMode,
    version,
    onProgress: progress,
  });

  expect(
    result.shouldBlockCI,
    `profile shouldBlockCI=true, scenario runs: ${result.scenarioRuns
      .map((run) => run.runDir)
      .join(', ')}`,
  ).toBeFalsy();

  expect(
    result.scenarioErrors.length,
    `scenario runner errors: ${result.scenarioErrors.map((error) => error.message).join('; ')}`,
  ).toBe(0);

  expect(
    result.localizationErrors.length,
    `localization runner errors: ${result.localizationErrors.map((error) => error.message).join('; ')}`,
  ).toBe(0);

  expect(
    result.success,
    `profile success=false, scenario runs: ${result.scenarioRuns
      .map((run) => run.runDir)
      .join(', ')}, localization runs: ${result.localizationRuns
      .map((run) => run.runDir)
      .join(', ')}`,
  ).toBeTruthy();
});
