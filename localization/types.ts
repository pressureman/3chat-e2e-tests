export type ExpectedLocale = 'zh-CN' | 'en';

export interface ScanCheck {
  type: 'scan';
}

export interface HoverCheck {
  type: 'hover';
  target: string;
}

export interface ClickCheck {
  type: 'click';
  target: string;
  reloadAfter?: boolean;
}

export interface ScrollCheck {
  type: 'scroll';
  positions: number[];
}

export type LocalizationCheckDefinition =
  | ScanCheck
  | HoverCheck
  | ClickCheck
  | ScrollCheck;

export interface LocalizationPageDefinition {
  id: string;
  path: string;
  requiredText?: Array<string | RegExp>;
  checks: LocalizationCheckDefinition[];
}

export interface LocalizationIssue {
  text: string;
  expectedLocale: ExpectedLocale;
  detectedLocale?: string;
  pageId: string;
  url: string;
  trigger: {
    type: 'scan' | 'hover' | 'click' | 'scroll';
    target?: string;
  };
  element?: {
    selector?: string;
    tagName?: string;
    role?: string;
    source?: string;
  };
  screenshot?: string;
}

export interface LocalizationPageResult {
  pageId: string;
  path: string;
  url?: string;
  expectedLocale: ExpectedLocale;
  status: 'passed' | 'failed' | 'error';
  checkedTextCount: number;
  issues: LocalizationIssue[];
  durationMs: number;
  error?: string;
}

export interface LocalizationCheckResult {
  checkedTextCount: number;
  issues: LocalizationIssue[];
}
