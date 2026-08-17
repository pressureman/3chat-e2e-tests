export type StepType = 'action' | 'checkpoint' | 'optional';

export type StepStatus = 'passed' | 'failed' | 'skipped';

export type RiskLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'NONE';

export type RunMode = 'release-smoke' | 'daily' | 'manual';

export type Version = 'cn' | 'intl' | 'all';

export interface StepDefinition {
  id: string;
  name: string;
  type: StepType;
  defaultRiskLevel: RiskLevel;
  required: boolean;
}

export interface StepResult {
  stepId: string;
  name: string;
  type: StepType;
  status: StepStatus;
  defaultRiskLevel: RiskLevel;
  finalRiskLevel: RiskLevel;
  issueType?: string;
  message?: string;
  url?: string;
  screenshot?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  retryPassed?: boolean;
}

export interface ScenarioResult {
  scenario: string;
  reportKey?: string;
  version: Version;
  env: string;
  runMode: RunMode;
  success: boolean;
  highestRiskLevel: RiskLevel;
  shouldNotify: boolean;
  shouldBlockCI: boolean;
  steps: StepResult[];
  flaky?: boolean;
  retryCount?: number;
  firstFailureMessage?: string;
}

export interface RunResult {
  runId: string;
  runDir: string;
  runMode: RunMode;
  version: Version;
  env: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  highestRiskLevel: RiskLevel;
  shouldNotify: boolean;
  shouldBlockCI: boolean;
  scenarios: ScenarioResult[];
  flaky?: boolean;
  retryCount?: number;
}
