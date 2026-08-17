import type { RuntimeEnv } from '../configs/env.cn';
import { channelRules } from '../configs/channel-rules';
import type { ScenarioExecutionOptions } from '../engine/runner';
import { openChannelOverview, checkChannelNavigation } from '../flows/channel/channel.flow';
import { loginWithPassword } from '../flows/login/password-login.flow';
import type { RiskLevel, RunMode, ScenarioResult, StepDefinition, StepResult, StepStatus, Version } from './types';

type RuntimeVersion = Exclude<Version, 'all'>;

export const channelStepDefinitions = {
  login: {
    id: 'login',
    name: '账号密码登录',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  openChannelOverview: {
    id: 'openChannelOverview',
    name: '打开渠道总览页',
    type: 'checkpoint',
    defaultRiskLevel: 'P1',
    required: true,
  },
  channelCardVisible: {
    id: 'channelCardVisible',
    name: '渠道卡片可见',
    type: 'checkpoint',
    defaultRiskLevel: 'P2',
    required: false,
  },
  channelNavigation: {
    id: 'channelNavigation',
    name: '渠道跳转结果',
    type: 'checkpoint',
    defaultRiskLevel: 'P2',
    required: false,
  },
} as const satisfies Record<string, StepDefinition>;

function stepStatus(passed: boolean, skipped = false): StepStatus {
  if (skipped) return 'skipped';
  return passed ? 'passed' : 'failed';
}

function makeStep(
  definition: StepDefinition,
  status: StepStatus,
  options: {
    stepId?: string;
    name?: string;
    message?: string;
    url?: string;
    durationMs?: number;
    issueType?: string;
    defaultRiskLevel?: RiskLevel;
    metadata?: Record<string, unknown>;
  } = {},
): StepResult {
  return {
    stepId: options.stepId || definition.id,
    name: options.name || definition.name,
    type: definition.type,
    status,
    defaultRiskLevel: options.defaultRiskLevel || definition.defaultRiskLevel,
    finalRiskLevel: 'NONE',
    issueType: options.issueType,
    message: options.message,
    url: options.url,
    durationMs: options.durationMs || 0,
    metadata: options.metadata,
  };
}

function channelRiskLevel(ruleId: string): RiskLevel {
  const rule = channelRules.find((candidate) => candidate.id === ruleId);
  if (!rule) return 'P2';
  return rule.versions.cn?.defaultRiskLevel || rule.versions.intl?.defaultRiskLevel || 'P2';
}

export async function channelScenario(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<ScenarioResult> {
  if (!options.page) {
    throw new Error('channelScenario requires a Playwright page.');
  }

  const steps: StepResult[] = [];
  const startedAt = Date.now();
  const loginStartedAt = Date.now();
  const loginResult = await loginWithPassword(options.page, options.env);
  const loginDurationMs = Date.now() - loginStartedAt;
  const version = options.env.version as RuntimeVersion;

  steps.push(makeStep(channelStepDefinitions.login, stepStatus(loginResult.success, loginResult.conclusion === '跳过'), {
    message: loginResult.failureReason || loginResult.conclusion,
    url: loginResult.afterLoginUrl || options.page.url(),
    durationMs: loginDurationMs,
    issueType: loginResult.success ? undefined : loginResult.conclusion,
  }));

  if (!loginResult.success) {
    return {
      scenario: 'channel',
      version,
      env: options.env.label,
      runMode: options.runMode as RunMode,
      success: false,
      highestRiskLevel: 'NONE',
      shouldNotify: false,
      shouldBlockCI: false,
      steps,
    };
  }

  let overviewContext;
  const overviewStartedAt = Date.now();
  try {
    overviewContext = await openChannelOverview(options.page, options.env, channelRules);
    steps.push(makeStep(channelStepDefinitions.openChannelOverview, 'passed', {
      message: '全渠道总览页已打开。',
      url: options.page.url(),
      durationMs: Date.now() - overviewStartedAt,
    }));
  } catch (error) {
    steps.push(makeStep(channelStepDefinitions.openChannelOverview, 'failed', {
      message: error instanceof Error ? error.message : String(error),
      url: options.page.url(),
      durationMs: Date.now() - overviewStartedAt,
      issueType: 'CHANNEL_PAGE_ERROR',
    }));
    return {
      scenario: 'channel',
      version,
      env: options.env.label,
      runMode: options.runMode as RunMode,
      success: false,
      highestRiskLevel: 'NONE',
      shouldNotify: false,
      shouldBlockCI: false,
      steps,
    };
  }

  for (const rule of channelRules) {
    const expected = rule.versions[version];
    const currentOverviewContext = await openChannelOverview(options.page, options.env, channelRules);
    const checkStartedAt = Date.now();
    const result = await checkChannelNavigation(options.page, currentOverviewContext || overviewContext, rule, version);
    const riskLevel = expected?.optional ? 'P2' : (expected?.defaultRiskLevel || channelRiskLevel(rule.id));
    const status = result.status === 'passed'
      ? 'passed'
      : result.status === 'skipped'
        ? 'skipped'
        : 'failed';

    steps.push(makeStep(channelStepDefinitions.channelNavigation, status, {
      stepId: `channel:${rule.id}:navigation`,
      name: `${rule.zhName} 渠道跳转`,
      message: result.message,
      url: result.actualUrl || options.page.url(),
      durationMs: Date.now() - checkStartedAt,
      issueType: result.issueType,
      defaultRiskLevel: riskLevel,
      metadata: {
        channelId: rule.id,
        zhName: rule.zhName,
        enName: rule.enName,
        version,
        expectedType: result.expectedType,
        expectedUrl: result.expectedUrl,
        actualUrl: result.actualUrl,
        visibleText: result.visibleText?.slice(0, 500),
      },
    }));
  }

  return {
    scenario: 'channel',
    version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    success: steps.every((step) => step.status !== 'failed'),
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps: steps.map((step) => ({
      ...step,
      durationMs: step.durationMs || Date.now() - startedAt,
    })),
  };
}
