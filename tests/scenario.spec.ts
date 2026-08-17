import { expect, test } from '@playwright/test';
import dotenv from 'dotenv';
import { cnEnv, type RuntimeEnv } from '../configs/env.cn';
import { intlEnv } from '../configs/env.intl';
import { runScenarioSuite, type ScenarioFn, type ScenarioSuiteInput } from '../engine/runner';
import { addSpaceScenario } from '../scenarios/add-space.scenario';
import { channelScenario } from '../scenarios/channel.scenario';
import { loginScenario } from '../scenarios/login.scenario';
import { registerScenario } from '../scenarios/register.scenario';
import { subscriptionPaymentScenario } from '../scenarios/subscription-payment.scenario';
import type { RunMode, Version } from '../scenarios/types';
import { createProgressLogger } from './_progress';

dotenv.config();

const scenarioName = process.env.E2E_SCENARIO || 'channel';
const version = (process.env.E2E_VERSION || 'cn') as Version;
const runMode = (process.env.E2E_RUN_MODE || 'manual') as RunMode;
const registerType = process.env.E2E_REGISTER_TYPE?.trim();
const loginMethod = process.env.E2E_LOGIN_METHOD?.trim();

const scenarioMap: Record<string, ScenarioFn<RuntimeEnv>> = {
  login: loginScenario,
  register: registerScenario,
  'add-space': addSpaceScenario,
  channel: channelScenario,
  'subscription-payment': subscriptionPaymentScenario,
};

function selectedEnv(): RuntimeEnv {
  return version === 'intl' ? intlEnv : cnEnv;
}

function registerVariant(type: 'email' | 'phone'): ScenarioSuiteInput<RuntimeEnv> {
  return {
    id: `register-${type}`,
    run: async (options) => ({
      ...await registerScenario({
        ...options,
        env: {
          ...options.env,
          reportKey: `register-${options.env.version}-${type}`,
          registerType: type,
        },
      }),
      reportKey: `register-${options.env.version}-${type}`,
    }),
  };
}

function loginVariant(method: 'email' | 'phone' | 'password'): ScenarioSuiteInput<RuntimeEnv> {
  return {
    id: `login-${method}`,
    run: async (options) => ({
      ...await loginScenario({
        ...options,
        env: {
          ...options.env,
          loginMethod: method,
        },
      }),
      reportKey: `login-${options.env.version}-${method}`,
    }),
  };
}

function selectedScenarios(): ScenarioSuiteInput<RuntimeEnv>[] {
  if (scenarioName === 'login') {
    if (loginMethod === 'email' || loginMethod === 'phone' || loginMethod === 'password') {
      return [loginVariant(loginMethod)];
    }

    return [loginVariant('email'), loginVariant('phone'), loginVariant('password')];
  }

  if (scenarioName !== 'register') {
    const scenario = scenarioMap[scenarioName];
    if (!scenario) {
      throw new Error(`Unsupported E2E_SCENARIO=${scenarioName}`);
    }
    return [{ id: scenarioName, run: scenario }];
  }

  if (registerType === 'email' || registerType === 'phone') {
    return [registerVariant(registerType)];
  }

  return [registerVariant('email'), registerVariant('phone')];
}

test.setTimeout(600_000);

test(`scenario ${scenarioName} @${version}`, async ({ page, context, browser }) => {
  const scenarios = selectedScenarios();
  const env = selectedEnv();
  const progress = createProgressLogger(test.step);
  progress({ kind: 'suite:start', suite: 'scenario', version, runMode });

  const runResult = await runScenarioSuite({
    scenarios,
    page,
    context,
    browser,
    env,
    version,
    runMode,
    onProgress: progress,
    isolateScenarios: scenarios.length > 1,
  });

  progress({ kind: 'suite:end', suite: 'scenario', success: runResult.success });

  expect(
    runResult.shouldBlockCI,
    `scenario shouldBlockCI=true, report: ${runResult.runDir}`,
  ).toBeFalsy();

  expect(
    runResult.success,
    `scenario success=false, report: ${runResult.runDir}`,
  ).toBeTruthy();
});
