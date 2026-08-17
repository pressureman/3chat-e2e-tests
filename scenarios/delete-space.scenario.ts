import path from 'node:path';
import type { Page } from '@playwright/test';
import type { RuntimeEnv } from '../configs/env.cn';
import type { ScenarioExecutionOptions } from '../engine/runner';
import { loginWithPassword } from '../flows/login/password-login.flow';
import { runDeleteSpaceFlow, type DeleteSpaceResult } from '../flows/space/delete-space.flow';
import type { RiskLevel, RunMode, ScenarioResult, StepDefinition, StepResult, StepStatus, Version } from './types';

export const deleteSpaceStepDefinitions: StepDefinition[] = [
  { id: 'login', name: '账号密码登录', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'open-avatar-menu', name: '打开头像菜单', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'enter-personal-center', name: '进入个人中心', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'open-workspace-management', name: '切换空间管理', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'detect-protected-workspace', name: '确认保护空间存在', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
  { id: 'delete-extra-workspaces', name: '删除多余空间', type: 'action', defaultRiskLevel: 'P1', required: true },
  { id: 'verify-only-protected-remains', name: '确认仅剩保护空间', type: 'checkpoint', defaultRiskLevel: 'P0', required: true },
];

const definitionById = new Map(deleteSpaceStepDefinitions.map((definition) => [definition.id, definition]));

function status(passed: boolean, skipped = false): StepStatus {
  return skipped ? 'skipped' : passed ? 'passed' : 'failed';
}

function stepResult(
  id: string,
  stepStatus: StepStatus,
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
  const definition = definitionById.get(id);
  if (!definition) throw new Error(`Unknown delete-space step: ${id}`);
  return {
    stepId: id,
    name: definition.name,
    type: definition.type,
    status: stepStatus,
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

function manualOnlyResult(options: ScenarioExecutionOptions<RuntimeEnv>): ScenarioResult {
  const message = 'delete-space is manual only';
  return {
    scenario: 'delete-space',
    version: options.version as Version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    success: false,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps: deleteSpaceStepDefinitions.map((definition, index) => stepResult(
      definition.id,
      index === 0 ? 'failed' : 'skipped',
      { message, issueType: index === 0 ? 'MANUAL_ONLY' : undefined },
    )),
  };
}

function flowMetadata(result: DeleteSpaceResult): Record<string, unknown> {
  return {
    protectedWorkspaceName: result.protectedWorkspaceName,
    usedDirectProfileFallback: result.usedDirectProfileFallback,
    initialWorkspaceNames: result.initialWorkspaceNames,
    deletedWorkspaceNames: result.deletedWorkspaceNames,
    remainingWorkspaceNames: result.remainingWorkspaceNames,
    deleteAttempts: result.deleteAttempts,
  };
}

async function hasAuthenticatedAppShell(page: Page): Promise<boolean> {
  if (!/^https:\/\/app\.(?:3chatai\.cn|3chat\.ai)\//i.test(page.url())) return false;
  const avatar = page.getByRole('navigation').getByRole('button').last();
  return avatar.isVisible({ timeout: 5_000 }).catch(() => false);
}

export async function deleteSpaceScenario(
  options: ScenarioExecutionOptions<RuntimeEnv>,
): Promise<ScenarioResult> {
  if (options.runMode !== 'manual') return manualOnlyResult(options);
  if (!options.page) throw new Error('deleteSpaceScenario requires a Playwright page.');

  const loginStartedAt = Date.now();
  const loginResult = await loginWithPassword(options.page, options.env);
  if (
    !loginResult.success
    && loginResult.clickedLogin
    && await hasAuthenticatedAppShell(options.page)
  ) {
    loginResult.success = true;
    loginResult.conclusion = '通过';
    loginResult.failureReason = '';
  }
  const loginDurationMs = Date.now() - loginStartedAt;

  if (!loginResult.success) {
    const finalUrl = loginResult.afterLoginUrl || options.page.url() || '未确认';
    return {
      scenario: 'delete-space',
      version: options.version as Version,
      env: options.env.label,
      runMode: options.runMode as RunMode,
      success: false,
      highestRiskLevel: 'NONE',
      shouldNotify: false,
      shouldBlockCI: false,
      steps: deleteSpaceStepDefinitions.map((definition) => definition.id === 'login'
        ? stepResult('login', status(false, loginResult.conclusion === '跳过'), {
          message: loginResult.failureReason || loginResult.conclusion,
          url: finalUrl,
          durationMs: loginDurationMs,
          issueType: loginResult.conclusion,
        })
        : stepResult(definition.id, 'skipped', {
          message: '登录失败，未执行空间删除。',
          url: finalUrl,
        })),
    };
  }

  const flowStartedAt = Date.now();
  const flowResult = await runDeleteSpaceFlow(options.page, options.env, {
    screenshotDir: path.join(options.runDir, 'scenarios', 'delete-space', 'screenshots'),
  });
  const flowDurationMs = Date.now() - flowStartedAt;
  const finalUrl = flowResult.finalUrl || options.page.url() || '未确认';
  const skippedAfterLogin = !loginResult.success;
  const metadata = flowMetadata(flowResult);
  const extrasRemain = flowResult.remainingWorkspaceNames.some(
    (name) => name.trim() !== flowResult.protectedWorkspaceName.trim(),
  );
  const onlyProtectedRemains = flowResult.remainingWorkspaceNames.length === 1 && !extrasRemain;

  const steps: StepResult[] = [
    stepResult('login', status(loginResult.success, loginResult.conclusion === '跳过'), {
      message: loginResult.failureReason || loginResult.conclusion,
      url: loginResult.afterLoginUrl || finalUrl,
      durationMs: loginDurationMs,
      issueType: loginResult.success ? undefined : loginResult.conclusion,
    }),
    stepResult('open-avatar-menu', status(
      flowResult.openedAvatarMenu || flowResult.usedDirectProfileFallback,
      skippedAfterLogin,
    ), {
      message: flowResult.usedDirectProfileFallback
        ? '头像菜单打开失败，已直接访问 Personal Center。'
        : flowResult.openedAvatarMenu ? undefined : flowResult.issue,
      url: finalUrl,
      issueType: flowResult.openedAvatarMenu || flowResult.usedDirectProfileFallback
        ? undefined
        : flowResult.exceptionType,
    }),
    stepResult('enter-personal-center', status(flowResult.enteredPersonalCenter, skippedAfterLogin), {
      message: flowResult.enteredPersonalCenter ? undefined : flowResult.issue,
      url: finalUrl,
      issueType: flowResult.enteredPersonalCenter ? undefined : flowResult.exceptionType,
    }),
    stepResult('open-workspace-management', status(flowResult.openedWorkspaceManagement, skippedAfterLogin), {
      message: flowResult.openedWorkspaceManagement ? undefined : flowResult.issue,
      url: finalUrl,
      issueType: flowResult.openedWorkspaceManagement ? undefined : flowResult.exceptionType,
    }),
    stepResult('detect-protected-workspace', status(flowResult.protectedWorkspaceFound, skippedAfterLogin), {
      message: flowResult.protectedWorkspaceFound
        ? flowResult.protectedWorkspaceName
        : flowResult.issue,
      url: finalUrl,
      issueType: flowResult.protectedWorkspaceFound ? undefined : flowResult.exceptionType,
      metadata,
    }),
    stepResult('delete-extra-workspaces', status(!extrasRemain && flowResult.protectedWorkspaceFound, skippedAfterLogin), {
      message: flowResult.issue === '无'
        ? `已删除 ${flowResult.deleteAttempts} 个空间`
        : flowResult.issue,
      url: finalUrl,
      issueType: extrasRemain ? flowResult.exceptionType : undefined,
      metadata,
    }),
    stepResult('verify-only-protected-remains', status(onlyProtectedRemains && flowResult.success, skippedAfterLogin), {
      message: onlyProtectedRemains ? flowResult.protectedWorkspaceName : flowResult.issue,
      url: finalUrl,
      screenshot: flowResult.screenshotPath,
      durationMs: flowDurationMs,
      issueType: flowResult.success ? undefined : flowResult.exceptionType,
      metadata,
    }),
  ];

  return {
    scenario: 'delete-space',
    version: options.version as Version,
    env: options.env.label,
    runMode: options.runMode as RunMode,
    success: flowResult.success,
    highestRiskLevel: 'NONE',
    shouldNotify: false,
    shouldBlockCI: false,
    steps,
  };
}
