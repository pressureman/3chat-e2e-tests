import type { RuntimeEnv } from './env.cn';
import type { ScenarioFn } from '../engine/runner';
import { addSpaceScenario } from '../scenarios/add-space.scenario';
import { channelScenario } from '../scenarios/channel.scenario';
import { loginScenario } from '../scenarios/login.scenario';
import { registerScenario } from '../scenarios/register.scenario';
import { subscriptionPaymentScenario } from '../scenarios/subscription-payment.scenario';
import type { RunMode } from '../scenarios/types';

export interface E2EProfileScenario {
  id: string;
  run: ScenarioFn<RuntimeEnv>;
}

export interface E2EProfile {
  scenarios: E2EProfileScenario[];
  localization: boolean;
}

type LoginMethod = 'password' | 'phone' | 'email';
type RegisterType = 'email' | 'phone';

function withReportKey(
  scenario: ScenarioFn<RuntimeEnv>,
  reportKey: (env: RuntimeEnv) => string,
): ScenarioFn<RuntimeEnv> {
  return async (options) => {
    const result = await scenario(options);
    return {
      ...result,
      reportKey: reportKey(options.env),
    };
  };
}

function loginVariant(method: LoginMethod): E2EProfileScenario {
  return {
    id: `login-${method}`,
    run: withReportKey(
      (options) => loginScenario({
        ...options,
        env: {
          ...options.env,
          loginMethod: method,
        },
      }),
      (env) => `login-${env.version}-${method}`,
    ),
  };
}

function registerVariant(registerType: RegisterType): E2EProfileScenario {
  return {
    id: `register-${registerType}`,
    run: withReportKey(
      (options) => registerScenario({
        ...options,
        env: {
          ...options.env,
          reportKey: `register-${options.env.version}-${registerType}`,
          registerType,
        },
      }),
      (env) => `register-${env.version}-${registerType}`,
    ),
  };
}

const releaseSmokeScenarios: E2EProfileScenario[] = [
  loginVariant('password'),
  loginVariant('phone'),
  loginVariant('email'),
  registerVariant('email'),
  registerVariant('phone'),
  {
    id: 'subscription-payment',
    run: subscriptionPaymentScenario,
  },
  {
    id: 'add-space',
    run: addSpaceScenario,
  },
];

export const e2eProfiles: Record<RunMode, E2EProfile> = {
  'release-smoke': {
    scenarios: releaseSmokeScenarios,
    localization: false,
  },

  daily: {
    scenarios: [
      loginVariant('password'),
      loginVariant('phone'),
      loginVariant('email'),
      registerVariant('email'),
      registerVariant('phone'),
      {
        id: 'add-space',
        run: addSpaceScenario,
      },
      {
        id: 'channel',
        run: channelScenario,
      },
      {
        id: 'subscription-payment',
        run: subscriptionPaymentScenario,
      },
    ],
    localization: true,
  },

  manual: {
    scenarios: [
      {
        id: 'login',
        run: loginScenario,
      },
      registerVariant('email'),
      registerVariant('phone'),
      {
        id: 'add-space',
        run: addSpaceScenario,
      },
      {
        id: 'channel',
        run: channelScenario,
      },
      {
        id: 'subscription-payment',
        run: subscriptionPaymentScenario,
      },
    ],
    localization: true,
  },
};
