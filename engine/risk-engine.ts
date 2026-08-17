import type { RiskLevel, RunMode, RunResult, ScenarioResult, StepType } from '../scenarios/types';

export interface EvaluateStepRiskInput {
  scenario: string;
  stepId: string;
  stepType: StepType;
  defaultRiskLevel: RiskLevel;
  issueType?: string;
  env: string;
  runMode: RunMode;
  retryPassed?: boolean;
}

export interface ScenarioRiskSummary {
  highestRiskLevel: RiskLevel;
  shouldNotify: boolean;
  shouldBlockCI: boolean;
}

export interface RunRiskSummary extends ScenarioRiskSummary {
  success: boolean;
}

const riskRank: Record<RiskLevel, number> = {
  NONE: 0,
  P3: 1,
  P2: 2,
  P1: 3,
  P0: 4,
};

const riskByRank: Record<number, RiskLevel> = {
  0: 'NONE',
  1: 'P3',
  2: 'P2',
  3: 'P1',
  4: 'P0',
};

function capRiskLevel(riskLevel: RiskLevel, maxRiskLevel: RiskLevel): RiskLevel {
  return riskRank[riskLevel] > riskRank[maxRiskLevel] ? maxRiskLevel : riskLevel;
}

function lowerRiskLevel(riskLevel: RiskLevel): RiskLevel {
  if (riskLevel === 'P0' || riskLevel === 'NONE') return riskLevel;
  return riskByRank[riskRank[riskLevel] - 1];
}

function maxRiskLevel(riskLevels: RiskLevel[]): RiskLevel {
  return riskLevels.reduce<RiskLevel>((highest, current) => {
    return riskRank[current] > riskRank[highest] ? current : highest;
  }, 'NONE');
}

export function evaluateStepRisk(input: EvaluateStepRiskInput): RiskLevel {
  let finalRiskLevel = input.defaultRiskLevel;

  if (input.stepType === 'optional') {
    finalRiskLevel = capRiskLevel(finalRiskLevel, 'P2');
  }

  if (input.stepType === 'action') {
    finalRiskLevel = capRiskLevel(finalRiskLevel, 'P1');
  }

  if (input.retryPassed) {
    finalRiskLevel = lowerRiskLevel(finalRiskLevel);
  }

  return finalRiskLevel;
}

export function summarizeScenarioRisk(result: ScenarioResult): ScenarioRiskSummary {
  const failedStepRiskLevels = result.steps
    .filter((step) => step.status === 'failed')
    .map((step) => step.finalRiskLevel);
  const highestRiskLevel = maxRiskLevel(failedStepRiskLevels);

  if (result.runMode === 'manual') {
    return {
      highestRiskLevel,
      shouldNotify: false,
      shouldBlockCI: false,
    };
  }

  if (result.runMode === 'daily') {
    return {
      highestRiskLevel,
      shouldNotify: highestRiskLevel === 'P0' || highestRiskLevel === 'P1',
      shouldBlockCI: false,
    };
  }

  return {
    highestRiskLevel,
    shouldNotify: highestRiskLevel === 'P0' || highestRiskLevel === 'P1',
    shouldBlockCI: highestRiskLevel === 'P0',
  };
}

export function summarizeRunRisk(runResult: RunResult): RunRiskSummary {
  const scenarioSummaries = runResult.scenarios.map((scenario) => summarizeScenarioRisk(scenario));
  const highestRiskLevel = maxRiskLevel(
    scenarioSummaries.map((scenarioSummary) => scenarioSummary.highestRiskLevel),
  );

  return {
    highestRiskLevel,
    shouldNotify: scenarioSummaries.some((scenarioSummary) => scenarioSummary.shouldNotify),
    shouldBlockCI: scenarioSummaries.some((scenarioSummary) => scenarioSummary.shouldBlockCI),
    success: runResult.scenarios.every((scenario) => scenario.success),
  };
}
