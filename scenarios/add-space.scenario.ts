import path from 'node:path';
import type { RuntimeEnv } from '../configs/env.cn';
import type { ScenarioExecutionOptions } from '../engine/runner';
import { loginWithPassword } from '../flows/login/password-login.flow';
import { runAddSpaceFlow } from '../flows/space/add-space.flow';
import { runDeleteSpaceFlow, type DeleteSpaceResult } from '../flows/space/delete-space.flow';
import type { RiskLevel, RunMode, ScenarioResult, StepDefinition, StepResult, StepStatus, Version } from './types';

export const addSpaceStepDefinitions: StepDefinition[] = [
  {
    id: 'login',
    name: '账号密码登录',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  {
    id: 'detect-version',
    name: '判断当前版本',
    type: 'checkpoint',
    defaultRiskLevel: 'P1',
    required: true,
  },
  {
    id: 'open-avatar-menu',
    name: '打开头像菜单',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  {
    id: 'open-space-switcher',
    name: '打开切换空间入口',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  {
    id: 'click-add-space',
    name: '点击添加空间',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  {
    id: 'submit-space-name',
    name: '输入空间名称并继续',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: true,
  },
  {
    id: 'complete-onboarding',
    name: '完成 onboarding / 问卷',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  {
    id: 'welcome-primary-action',
    name: '欢迎弹窗点击主动作',
    type: 'optional',
    defaultRiskLevel: 'P2',
    required: false,
  },
  {
    id: 'reach-builder',
    name: '验证进入搭建助手',
    type: 'checkpoint',
    defaultRiskLevel: 'P0',
    required: true,
  },
  {
    id: 'cleanup-extra-workspaces',
    name: '清理多余空间',
    type: 'action',
    defaultRiskLevel: 'P1',
    required: false,
  },
];

const stepDefinitionById = new Map(addSpaceStepDefinitions.map((definition) => [definition.id, definition]));

function stepStatus(passed: boolean, skipped = false): StepStatus {
  if (skipped) return 'skipped';
  return passed ? 'passed' : 'failed';
}

function stepResult(
  stepId: string,
  status: StepStatus,
  options: {
    message?: string;
    url?: string;
    screenshot?: string;
    durationMs?: number;
    issueType?: string;
    defaultRiskLevel?: RiskLevel;
    metadata?: Record<string, unknown>;
  } = {},
): StepResult {
  const definition = stepDefinitionById.get(stepId);
  if (!definition) throw new Error(`Unknown add-space step: ${stepId}`);

  return {
    stepId: definition.id,
    name: definition.name,
    type: definition.type,
    status,
    defaultRiskLevel: options.defaultRiskLevel || definition.defaultRiskLevel,
    finalRiskLevel: 'NONE',
    issueType: options.issueType,
    message: options.message,
    url: options.url,
    screenshot: options.screenshot,
    durationMs: options.durationMs || 0,
    metadata: options.metadata,
  };
}

export async function addSpaceScenario(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<ScenarioResult> {
  if (!options.page) {
    throw new Error('addSpaceScenario requires a Playwright page.');
  }

  const loginStartedAt = Date.now();
  const loginResult = await loginWithPassword(options.page, options.env);
  const loginDurationMs = Date.now() - loginStartedAt;

  const flowStartedAt = Date.now();
  const addSpaceResult = await runAddSpaceFlow(options.page, options.env, loginResult, {
    screenshotDir: path.join(options.runDir, 'scenarios', 'add-space', 'screenshots'),
  });
  const flowDurationMs = Date.now() - flowStartedAt;
  const finalUrl = addSpaceResult.finalUrl || options.page.url() || '未确认';
  const cleanupEnabled = process.env.E2E_ADD_SPACE_CLEANUP !== 'false';
  let cleanupResult: DeleteSpaceResult | undefined;
  let cleanupDurationMs = 0;

  if (addSpaceResult.success && cleanupEnabled) {
    const cleanupStartedAt = Date.now();
    cleanupResult = await runDeleteSpaceFlow(options.page, options.env, {
      screenshotDir: path.join(options.runDir, 'scenarios', 'add-space', 'screenshots'),
      initialPageStabilityWaitMs: 5_000,
    });
    cleanupDurationMs = Date.now() - cleanupStartedAt;
  }

  const scenarioSuccess = addSpaceResult.success
    && (!cleanupEnabled || cleanupResult?.success === true);

  const steps: StepResult[] = [
    stepResult('login', stepStatus(loginResult.success, loginResult.conclusion === '跳过'), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: loginResult.afterLoginUrl || finalUrl,
      durationMs: loginDurationMs,
      issueType: loginResult.success ? undefined : loginResult.conclusion,
    }),
    stepResult('detect-version', stepStatus(addSpaceResult.version !== '未确认', !loginResult.success), {
      message: addSpaceResult.version,
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.version === '未确认' ? addSpaceResult.exceptionType : undefined,
    }),
    stepResult('open-avatar-menu', stepStatus(addSpaceResult.openedAvatarMenu, !loginResult.success), {
      message: addSpaceResult.openedAvatarMenu ? undefined : addSpaceResult.issue,
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.openedAvatarMenu ? undefined : addSpaceResult.exceptionType,
    }),
    stepResult('open-space-switcher', stepStatus(addSpaceResult.openedSpaceSwitcher, !loginResult.success), {
      message: addSpaceResult.openedSpaceSwitcher ? undefined : addSpaceResult.issue,
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.openedSpaceSwitcher ? undefined : addSpaceResult.exceptionType,
    }),
    stepResult('click-add-space', stepStatus(addSpaceResult.clickedAddSpace, !loginResult.success), {
      message: addSpaceResult.clickedAddSpace ? undefined : addSpaceResult.issue,
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.clickedAddSpace ? undefined : addSpaceResult.exceptionType,
    }),
    stepResult('submit-space-name', stepStatus(addSpaceResult.createdSpace, !loginResult.success), {
      message: addSpaceResult.createdSpace ? addSpaceResult.workspaceName : addSpaceResult.issue,
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.createdSpace ? undefined : addSpaceResult.exceptionType,
    }),
    stepResult('complete-onboarding', stepStatus(addSpaceResult.onboarding.enteredSystem, !loginResult.success), {
      message: addSpaceResult.onboarding.issue || addSpaceResult.issue,
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.onboarding.enteredSystem ? undefined : addSpaceResult.exceptionType,
    }),
    stepResult('welcome-primary-action', stepStatus(
      addSpaceResult.clickedBuildNow,
      !loginResult.success || addSpaceResult.reachedBuilderPage,
    ), {
      message: addSpaceResult.reachedBuilderPage
        ? '已通过 /butler/agent/builder URL 判断成功，不再依赖欢迎弹窗。'
        : addSpaceResult.sawWelcomeModal
          ? undefined
          : '欢迎弹窗未出现或主动作未点击',
      url: finalUrl,
      durationMs: 0,
      issueType: addSpaceResult.clickedBuildNow || addSpaceResult.reachedBuilderPage
        ? undefined
        : addSpaceResult.exceptionType,
    }),
    stepResult('reach-builder', stepStatus(addSpaceResult.reachedBuilderPage, !loginResult.success), {
      message: addSpaceResult.reachedBuilderPage ? undefined : addSpaceResult.issue,
      url: finalUrl,
      screenshot: addSpaceResult.screenshotPath,
      durationMs: flowDurationMs,
      issueType: addSpaceResult.reachedBuilderPage ? undefined : addSpaceResult.exceptionType,
    }),
    stepResult('cleanup-extra-workspaces', cleanupEnabled
      ? stepStatus(Boolean(cleanupResult?.success), !addSpaceResult.success)
      : 'skipped', {
      message: !cleanupEnabled
        ? 'Workspace cleanup disabled by E2E_ADD_SPACE_CLEANUP=false.'
        : !addSpaceResult.success
          ? 'Add space failed; workspace cleanup was not executed.'
          : cleanupResult?.success
            ? `Workspace cleanup passed; deleted ${cleanupResult.deleteAttempts} workspace(s).`
            : `Add space succeeded, but workspace cleanup failed: ${cleanupResult?.issue || '未确认'}`,
      url: cleanupResult?.finalUrl || finalUrl,
      screenshot: cleanupResult?.screenshotPath,
      durationMs: cleanupDurationMs,
      issueType: cleanupResult?.success ? undefined : cleanupResult?.exceptionType,
      metadata: cleanupResult ? {
        protectedWorkspaceName: cleanupResult.protectedWorkspaceName,
        usedDirectProfileFallback: cleanupResult.usedDirectProfileFallback,
        deletedWorkspaceNames: cleanupResult.deletedWorkspaceNames,
        remainingWorkspaceNames: cleanupResult.remainingWorkspaceNames,
        deleteAttempts: cleanupResult.deleteAttempts,
        failureStep: cleanupResult.failureStep,
        screenshotPath: cleanupResult.screenshotPath,
        suggestion: cleanupResult.success
          ? '无'
          : 'Check Personal Center > Workspace Management delete flow and protected workspace config.',
      } : {
        cleanupEnabled,
      },
    }),
  ];

  return {
    scenario: 'add-space',
    version: options.version as Version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    success: scenarioSuccess,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps,
  };
}
