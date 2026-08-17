export type ProgressEvent =
  | { kind: 'suite:start'; suite: 'profile' | 'scenario' | 'localization'; version: string; runMode?: string }
  | { kind: 'suite:end'; suite: 'profile' | 'scenario' | 'localization'; success: boolean }
  | { kind: 'scenario:start'; scenario: string; version: string; env: string }
  | {
      kind: 'scenario:end';
      scenario: string;
      version: string;
      env: string;
      success: boolean;
      durationMs: number;
      runDir: string;
    }
  | { kind: 'localization:login'; env: string }
  | { kind: 'localization:page:start'; pageId: string; env: string }
  | { kind: 'localization:page:end'; pageId: string; env: string; issues: number; errors: number }
  | {
      kind: 'localization:end';
      env: string;
      pages: number;
      errors: number;
      issues: number;
      runDir: string;
    };

export function formatProgress(event: ProgressEvent): string {
  switch (event.kind) {
    case 'suite:start':
      return `[3Chat E2E] suite start: ${event.suite} version=${event.version}${
        event.runMode ? ` runMode=${event.runMode}` : ''
      }`;
    case 'suite:end':
      return `[3Chat E2E] suite end: ${event.suite} success=${event.success}`;
    case 'scenario:start':
      return `[3Chat E2E] scenario start: ${event.scenario} env=${event.env} version=${event.version}`;
    case 'scenario:end':
      return `[3Chat E2E] scenario end: ${event.scenario} env=${event.env} success=${event.success} durationMs=${event.durationMs} runDir=${event.runDir}`;
    case 'localization:login':
      return `[3Chat E2E] localization login: env=${event.env}`;
    case 'localization:page:start':
      return `[3Chat E2E] localization page start: ${event.pageId} env=${event.env}`;
    case 'localization:page:end':
      return `[3Chat E2E] localization page end: ${event.pageId} env=${event.env} issues=${event.issues} errors=${event.errors}`;
    case 'localization:end':
      return `[3Chat E2E] localization end: env=${event.env} pages=${event.pages} issues=${event.issues} errors=${event.errors} runDir=${event.runDir}`;
  }
}

export type TestStepFn = (name: string, body: () => Promise<void>) => Promise<void>;

/**
 * Wires a single ProgressEvent emitter to:
 *   1. console.log with the [3Chat E2E] prefix line (always)
 *   2. test.step() so the HTML report shows the same hierarchy (only on *:end events)
 */
export function createProgressLogger(
  step: TestStepFn,
  log: (msg: string) => void = (m) => console.log(m),
): (event: ProgressEvent) => void {
  return (event: ProgressEvent): void => {
    const line = formatProgress(event);
    log(line);
    if (event.kind === 'scenario:end' || event.kind === 'localization:end' || event.kind === 'suite:end') {
      void step(line, async () => {
        /* already logged above */
      });
    }
  };
}