import type { Frame, Locator, Page } from '@playwright/test';
import type { ChannelExpectedBehavior, ChannelRule } from '../../configs/channel-rules';
import type { RuntimeEnv } from '../../configs/env.cn';
import type { Version } from '../../scenarios/types';

type RuntimeVersion = Exclude<Version, 'all'>;

export type ContentContext = Page | Frame;

export type ChannelNavigationStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'unconfirmed'
  | 'missing';

export interface ChannelFlowResult {
  success: boolean;
  status: ChannelNavigationStatus;
  channelId: string;
  zhName: string;
  enName?: string;
  version: RuntimeVersion;
  expectedType?: string;
  expectedUrl?: string;
  actualUrl?: string;
  visibleText?: string;
  popupShown?: boolean;
  clickedGo?: boolean;
  message?: string;
  issueType?:
    | 'CHANNEL_CARD_NOT_FOUND'
    | 'CHANNEL_URL_MISMATCH'
    | 'CHANNEL_MODAL_FAILED'
    | 'CHANNEL_NOT_SUPPORTED'
    | 'CHANNEL_PAGE_ERROR'
    | 'CHANNEL_UNCONFIRMED';
}

type ClickTarget = {
  card: Locator;
  target: Locator;
};

function appOrigin(version: RuntimeVersion): string {
  return version === 'intl' ? 'https://app.3chat.ai' : 'https://app.3chatai.cn';
}

function overviewUrl(version: RuntimeVersion): string {
  return `${appOrigin(version)}/embedded-app/subapp?url=/butler/channels/overview`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function channelNamePattern(rule: ChannelRule): RegExp {
  const names = [rule.zhName, rule.enName, ...(rule.aliases || [])];
  if (rule.enName === 'Gamil') names.push('Gmail');
  return new RegExp(`^\\s*(${names.filter((name): name is string => Boolean(name)).map(escapeRegExp).join('|')})\\s*$`, 'i');
}

function channelNames(rule: ChannelRule): string[] {
  return [...new Set([rule.zhName, rule.enName, ...(rule.aliases || [])].filter((name): name is string => Boolean(name)))];
}

function normalizeUrl(url: string, version: RuntimeVersion): URL | null {
  try {
    const absolute = url.startsWith('http') ? url : `${appOrigin(version)}${url}`;
    const parsed = new URL(absolute);
    parsed.pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/, '') || '/';
    parsed.search = decodeURIComponent(parsed.search);
    return parsed;
  } catch {
    return null;
  }
}

function originPath(url: string, version: RuntimeVersion): string {
  const parsed = normalizeUrl(url, version);
  return parsed ? `${parsed.origin}${parsed.pathname}` : '';
}

function isExpectedUrl(actualUrl: string, expected: ChannelExpectedBehavior, version: RuntimeVersion): boolean {
  const expectedUrl = expected.expectedUrl || expected.expectedPath || '';
  if (!actualUrl || !expectedUrl) return expected.expectedType === 'visible-only';

  const expectedParsed = normalizeUrl(expectedUrl, version);
  const actualParsed = normalizeUrl(actualUrl, version);
  if (!expectedParsed || !actualParsed) return false;

  if (expected.expectedOrigin && actualParsed.origin !== expected.expectedOrigin) return false;
  if (expectedUrl.includes('/chat/login?')) {
    return originPath(actualUrl, version) === `${expectedParsed.origin}${expectedParsed.pathname}`;
  }

  if (expected.allowExtraQuery) {
    return actualParsed.origin === expectedParsed.origin
      && actualParsed.pathname === expectedParsed.pathname
      && actualParsed.search.startsWith(expectedParsed.search);
  }

  return actualParsed.origin === expectedParsed.origin
    && actualParsed.pathname === expectedParsed.pathname
    && actualParsed.search === expectedParsed.search;
}

function hasPageErrorState(actualUrl: string, visibleText: string): boolean {
  if (/^chrome-error:\/\//i.test(actualUrl)) return true;

  const text = visibleText.replace(/\s+/g, ' ').trim();
  if (!text) return false;

  return /^(404|500)(\b|[:：])/i.test(text)
    || /\b404\s+(not found|page not found)\b/i.test(text)
    || /\b500\s+(internal server error|server error)\b/i.test(text)
    || /\b(page not found|internal server error)\b/i.test(text)
    || /页面不存在|页面未找到|服务器错误|系统错误|访问被拒绝|无权限访问|没有权限访问|暂无权限访问/.test(text);
}

export async function getVisibleContentSummary(context: ContentContext, limit = 500): Promise<string> {
  const content = await context.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
  return content.replace(/\s+/g, ' ').trim().slice(0, limit) || '未确认';
}

async function findOverviewContext(page: Page): Promise<ContentContext> {
  const deadline = Date.now() + 30_000;
  const realChannelText = /自定义官网|Custom Website|Shopify|Shopline|微信客服|WeChat Customer Service|WhatsApp|Facebook|Instagram|Telegram|Discord|网易邮箱|Netease Email/i;

  while (Date.now() < deadline) {
    for (const frame of page.frames().filter((frame) => frame !== page.mainFrame())) {
      const text = await frame.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
      if (realChannelText.test(text)) return frame;
    }

    const pageText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
    if (realChannelText.test(pageText)) return page;
    await page.waitForTimeout(500);
  }

  throw new Error('无法定位已加载真实渠道卡片的全渠道内容区。');
}

export async function openChannelOverview(page: Page, env: RuntimeEnv, rules: ChannelRule[]): Promise<ContentContext> {
  const targetUrl = overviewUrl(env.version);
  await page.goto(targetUrl, { waitUntil: 'commit', timeout: 30_000 }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('ERR_ABORTED')) throw error;
  });
  await page.waitForURL(/embedded-app\/subapp.*channels\/overview|butler\/channels\/overview/i, {
    timeout: 15_000,
  }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

  const context = await findOverviewContext(page);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const visibleCount = await countVisibleChannelEntries(context, rules).catch(() => 0);
    const text = await context.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
    if (visibleCount >= 10 && !/loading|加载中|skeleton/i.test(text)) {
      await page.waitForTimeout(1_000);
      return context;
    }
    await page.waitForTimeout(500);
  }

  return context;
}

export async function findChannelCard(context: ContentContext, rule: ChannelRule): Promise<Locator | null> {
  const namePattern = channelNamePattern(rule);
  const candidates = [
    ...channelNames(rule).map((name) => context.getByText(name, { exact: true })),
    context.getByText(namePattern),
  ];

  await context.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const candidate of candidates) {
      const card = await findCardFromCandidate(context, candidate);
      if (card) return card;
    }

    await context.evaluate(() => {
      window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * 0.75)));
    }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

async function findCardFromCandidate(context: ContentContext, candidate: Locator): Promise<Locator | null> {
  const count = await candidate.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const text = candidate.nth(i);
    if (!(await text.isVisible().catch(() => false))) continue;
    const marker = `channel-card-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const marked = await text.evaluate((node, value) => {
      const markerValue = value as string;
      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      let current = node as HTMLElement | null;
      while (current && current !== document.body) {
        const rect = current.getBoundingClientRect();
        const style = window.getComputedStyle(current);
        const className = String(current.className || '');
        const hasCardShape = style.borderStyle !== 'none'
          || Number.parseFloat(style.borderRadius) > 0
          || /card|item|channel|platform/i.test(className)
          || current.tagName === 'BUTTON'
          || current.tagName === 'A'
          || current.getAttribute('role') === 'button';
        const hasReasonableSize = rect.width >= 120 && rect.width <= 900 && rect.height >= 40 && rect.height <= 260;
        if (isVisible(current) && hasCardShape && hasReasonableSize) {
          current.setAttribute('data-e2e-channel-card', markerValue);
          return true;
        }
        current = current.parentElement;
      }
      return false;
    }, marker).catch(() => false);

    if (marked) {
      const card = context.locator(`[data-e2e-channel-card="${marker}"]`).first();
      if (await card.isVisible().catch(() => false)) return card;
    }

    return text.first();
  }

  return null;
}

async function findChannelClickTarget(card: Locator): Promise<ClickTarget> {
  const marker = `channel-action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const marked = await card.evaluate((cardElement, value) => {
    const markerValue = value as string;
    const root = cardElement as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const isVisible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const closestClickable = (element: HTMLElement) => element.closest('button, a, [role="button"], [onclick], [tabindex], [class*="cursor"], [class*="pointer"]') as HTMLElement | null;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('button, a, [role="button"], [onclick], [tabindex], [class*="cursor"], [class*="pointer"], [class*="arrow"], [class*="right"], svg'));
    const candidates = elements
      .map((element) => closestClickable(element) || element)
      .filter((element, index, array) => element && array.indexOf(element) === index)
      .filter((element) => element !== root && root.contains(element) && isVisible(element));

    let best: { element: HTMLElement; score: number } | null = null;
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const text = [element.innerText, element.textContent, element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('class')].filter(Boolean).join(' ');
      let score = 0;
      if (centerX > rootRect.left + rootRect.width * 0.68) score += 70;
      if (centerY > rootRect.top + rootRect.height * 0.38) score += 35;
      if (/前往|去往|进入|跳转|open|go|enter|arrow|right|next/i.test(text)) score += 60;
      if (/button|a/i.test(element.tagName) || element.getAttribute('role') === 'button') score += 30;
      if (window.getComputedStyle(element).cursor === 'pointer') score += 25;
      if (/收藏|favorite|star|subscribe|subscription/i.test(text)) score -= 140;
      if (rect.width > rootRect.width * 0.75 && rect.height > rootRect.height * 0.75) score -= 80;
      if (!best || score > best.score) best = { element, score };
    }

    if (best && best.score > 30) {
      best.element.setAttribute('data-e2e-channel-action', markerValue);
      return true;
    }
    return false;
  }, marker).catch(() => false);

  if (marked) {
    const target = card.locator(`[data-e2e-channel-action="${marker}"]`).first();
    if (await target.isVisible().catch(() => false)) return { card, target };
  }

  return { card, target: card };
}

async function countVisibleChannelEntries(context: ContentContext, rules: ChannelRule[]): Promise<number> {
  let count = 0;
  for (const rule of rules) {
    if (await findChannelCard(context, rule)) count += 1;
  }
  return count;
}

async function visibleDialog(context: ContentContext): Promise<Locator | null> {
  const dialog = context.getByRole('dialog').first();
  if (await dialog.isVisible().catch(() => false)) return dialog;
  const modal = context.locator('.ant-modal:visible, .modal:visible, [class*="modal"]:visible').first();
  if (await modal.isVisible().catch(() => false)) return modal;
  return null;
}

async function waitForVisibleDialog(page: Page, context: ContentContext, timeout = 5_000): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const contextDialog = await visibleDialog(context);
    if (contextDialog) return contextDialog;
    const pageDialog = context === page ? null : await visibleDialog(page);
    if (pageDialog) return pageDialog;
    await page.waitForTimeout(250);
  }
  return null;
}

async function clickDialogGoButton(dialog: Locator): Promise<boolean> {
  const buttons = [
    dialog.getByRole('button', { name: /前往|继续|确认|确定|去往|Go|Continue|Confirm/i }),
    dialog.getByText(/前往|继续|确认|确定|去往|Go|Continue|Confirm/i),
  ];
  for (const button of buttons) {
    if (await button.first().isVisible().catch(() => false)) {
      await button.first().click();
      return true;
    }
  }
  return false;
}

async function waitForNavigationOrPopup(page: Page, context: ContentContext, action: () => Promise<void>): Promise<ContentContext> {
  const popupPromise = page.waitForEvent('popup', { timeout: 8_000 }).catch(() => null);
  await action();
  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
    return popup;
  }
  await context.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  return context;
}

export async function checkChannelNavigation(
  page: Page,
  overviewContext: ContentContext,
  rule: ChannelRule,
  version: RuntimeVersion,
): Promise<ChannelFlowResult> {
  const expected = rule.versions[version];
  if (!expected || !expected.enabled || expected.expectedType === 'not-supported') {
    return {
      success: true,
      status: 'skipped',
      channelId: rule.id,
      zhName: rule.zhName,
      enName: rule.enName,
      version,
      expectedType: expected?.expectedType,
      expectedUrl: expected?.expectedUrl,
      message: '当前版本不支持该渠道。',
      issueType: 'CHANNEL_NOT_SUPPORTED',
    };
  }

  const card = await findChannelCard(overviewContext, rule);
  if (!card) {
    return {
      success: false,
      status: 'missing',
      channelId: rule.id,
      zhName: rule.zhName,
      enName: rule.enName,
      version,
      expectedType: expected.expectedType,
      expectedUrl: expected.expectedUrl,
      actualUrl: page.url(),
      message: '当前渠道卡片没有展示。',
      issueType: 'CHANNEL_CARD_NOT_FOUND',
    };
  }

  await card.scrollIntoViewIfNeeded().catch(() => undefined);
  await card.hover({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(300);

  const beforeUrl = overviewContext.url();
  const clickTarget = await findChannelClickTarget(card);
  let activeContext = await waitForNavigationOrPopup(page, overviewContext, async () => {
    await clickTarget.target.click({ timeout: 10_000 });
  });

  let popupShown = false;
  let clickedGo = false;
  const dialog = await waitForVisibleDialog(page, activeContext, 5_000);
  if (dialog) {
    popupShown = true;
    activeContext = await waitForNavigationOrPopup(page, activeContext, async () => {
      clickedGo = await clickDialogGoButton(dialog);
    });
    if (!clickedGo) {
      return {
        success: false,
        status: 'failed',
        channelId: rule.id,
        zhName: rule.zhName,
        enName: rule.enName,
        version,
        expectedType: expected.expectedType,
        expectedUrl: expected.expectedUrl,
        actualUrl: activeContext.url(),
        visibleText: await getVisibleContentSummary(activeContext),
        popupShown,
        clickedGo,
        message: '弹窗按钮不可点击或未找到“前往”同义按钮。',
        issueType: 'CHANNEL_MODAL_FAILED',
      };
    }
  }

  const actualUrl = activeContext.url();
  const visibleText = await getVisibleContentSummary(activeContext);
  const urlOk = isExpectedUrl(actualUrl, expected, version);
  const expectsPopup = expected.expectedType === 'modal-then-navigation';
  const pageError = hasPageErrorState(actualUrl, visibleText);

  if (pageError) {
    return {
      success: false,
      status: 'failed',
      channelId: rule.id,
      zhName: rule.zhName,
      enName: rule.enName,
      version,
      expectedType: expected.expectedType,
      expectedUrl: expected.expectedUrl,
      actualUrl,
      visibleText,
      popupShown,
      clickedGo,
      message: '渠道跳转后页面出现错误状态。',
      issueType: 'CHANNEL_PAGE_ERROR',
    };
  }

  const result: ChannelFlowResult = {
    success: urlOk,
    status: urlOk ? 'passed' : 'failed',
    channelId: rule.id,
    zhName: rule.zhName,
    enName: rule.enName,
    version,
    expectedType: expected.expectedType,
    expectedUrl: expected.expectedUrl,
    actualUrl,
    visibleText,
    popupShown,
    clickedGo,
    message: urlOk ? '跳转符合预期。' : `expected=${expected.expectedUrl || expected.expectedPath || '-'}, actual=${actualUrl}`,
    issueType: urlOk ? undefined : 'CHANNEL_URL_MISMATCH',
  };

  if (urlOk && expectsPopup && !popupShown) {
    result.success = false;
    result.status = 'unconfirmed';
    result.issueType = 'CHANNEL_UNCONFIRMED';
    result.message = '未按预期弹窗，但最终地址正确。';
  }

  if ('isClosed' in activeContext && activeContext !== page && !activeContext.isClosed()) {
    await activeContext.close().catch(() => undefined);
  }

  if (beforeUrl && !page.url().includes('/butler/channels/overview')) {
    await page.goto(overviewUrl(version), { waitUntil: 'commit', timeout: 30_000 }).catch(() => undefined);
  }

  return result;
}
