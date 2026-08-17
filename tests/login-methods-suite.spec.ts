import { expect, test } from '@playwright/test';
import dotenv from 'dotenv';
import { cnEnv, type RuntimeEnv } from '../configs/env.cn';
import { intlEnv } from '../configs/env.intl';
import { runScenarioSuite, type ScenarioExecutionOptions, type ScenarioFn, type ScenarioSuiteInput } from '../engine/runner';
import { loginScenario } from '../scenarios/login.scenario';
import type { RunMode, ScenarioResult, Version } from '../scenarios/types';

dotenv.config();

type LoginMethod = 'password' | 'phone' | 'email';

const loginMethods: LoginMethod[] = ['password', 'phone', 'email'];
const runMode = (process.env.E2E_RUN_MODE || 'manual') as RunMode;

function loginVariant(env: RuntimeEnv, method: LoginMethod): ScenarioFn<unknown> {
  return async (options: ScenarioExecutionOptions<unknown>): Promise<ScenarioResult> => {
    const result = await loginScenario({
      ...options,
      env: {
        ...env,
        loginMethod: method,
      },
      version: env.version,
      runMode: options.runMode,
      runDir: options.runDir,
    });

    return {
      ...result,
      reportKey: `login-${env.version}-${method}`,
    };
  };
}

test.setTimeout(1_800_000);

test('login all methods @all', async ({ browser }) => {
  const scenarios: ScenarioSuiteInput<unknown>[] = [
    ...loginMethods.map((method) => ({
      id: `login-${method}`,
      reportKey: `login-cn-${method}`,
      run: loginVariant(cnEnv, method),
    })),
    ...loginMethods.map((method) => ({
      id: `login-${method}`,
      reportKey: `login-intl-${method}`,
      run: loginVariant(intlEnv, method),
    })),
  ];

  const runResult = await runScenarioSuite({
    scenarios,
    browser,
    env: {
      label: '国内版+国际版',
      version: 'all',
    },
    version: 'all' as Version,
    runMode,
    isolateScenarios: true,
  });

  expect(
    runResult.success,
    `login method suite success=false, report: ${runResult.runDir}`,
  ).toBeTruthy();
});
