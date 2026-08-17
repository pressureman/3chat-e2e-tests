import type { LocalizationIssue, ExpectedLocale } from './types';
import type { TextCandidate } from './text-collector';

const ignoredTerms = new Set([
  '3Chat',
  'Stripe',
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Telegram',
  'TikTok',
  'Line',
  'API',
  'URL',
]);

const eastAsianScriptPatterns = [
  { locale: 'zh', pattern: /\p{Script=Han}/u },
  { locale: 'ja', pattern: /\p{Script=Hiragana}|\p{Script=Katakana}/u },
  { locale: 'ko', pattern: /\p{Script=Hangul}/u },
];

export interface CheckLocalizationInput {
  candidates: TextCandidate[];
  expectedLocale: ExpectedLocale;
  pageId: string;
  url: string;
  trigger: LocalizationIssue['trigger'];
  screenshot?: string;
}

export function checkLocalization(input: CheckLocalizationInput): {
  checkedTextCount: number;
  issues: LocalizationIssue[];
} {
  const checkedCandidates = input.candidates.filter((candidate) => !shouldIgnoreText(candidate.text));
  const issues: LocalizationIssue[] = [];

  for (const candidate of checkedCandidates) {
    const detectedLocale = detectLanguage(candidate.text);
    if (!violatesExpectedLocale(input.expectedLocale, detectedLocale)) continue;

    issues.push({
      text: candidate.text,
      expectedLocale: input.expectedLocale,
      detectedLocale,
      pageId: input.pageId,
      url: input.url,
      trigger: input.trigger,
      element: {
        selector: candidate.selector,
        tagName: candidate.tagName,
        role: candidate.role,
        source: candidate.source,
      },
      screenshot: input.screenshot,
    });
  }

  return {
    checkedTextCount: checkedCandidates.length,
    issues,
  };
}

function shouldIgnoreText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (normalized.length <= 1) return true;
  if (/^[\d\s.,:%+()[\]/-]+$/.test(normalized)) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (/^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(normalized)) return true;
  if (/^[¥$€£]\s?\d[\d,.]*$/.test(normalized)) return true;
  if (ignoredTerms.has(normalized)) return true;

  return false;
}

function detectLanguage(text: string): string | undefined {
  for (const { locale, pattern } of eastAsianScriptPatterns) {
    if (pattern.test(text)) return locale;
  }

  if (/[A-Za-z]/.test(text)) return 'en';
  return undefined;
}

function violatesExpectedLocale(expectedLocale: ExpectedLocale, detectedLocale?: string): boolean {
  if (!detectedLocale) return false;

  if (expectedLocale === 'en') {
    return ['zh', 'ja', 'ko'].includes(detectedLocale);
  }

  return false;
}
