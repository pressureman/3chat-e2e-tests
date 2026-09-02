import { expect, type Locator, type Page } from '@playwright/test';

export async function firstVisible(locators: Locator[], timeout = 10_000): Promise<Locator> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 20); i += 1) {
        const item = locator.nth(i);
        if (await item.isVisible().catch(() => false)) {
          return item;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('No matching visible locator found. Frontend may need stable data-testid attributes.');
}

export async function clickFirstVisible(locators: Locator[], timeout?: number): Promise<void> {
  const locator = await firstVisible(locators, timeout);
  await locator.click();
}

export async function clickFirstVisibleOptional(locators: Locator[], timeout = 3_000): Promise<boolean> {
  try {
    await clickFirstVisible(locators, timeout);
    return true;
  } catch {
    return false;
  }
}

export async function fillIfVisible(locator: Locator, value: string): Promise<boolean> {
  if (await locator.first().isVisible().catch(() => false)) {
    await locator.first().fill(value);
    return true;
  }
  return false;
}

export async function getVisibleContentSummary(page: Page): Promise<string> {
  const content = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '');
  return content.replace(/\s+/g, ' ').trim().slice(0, 500) || '未确认';
}

const LOGIN_AUTH_URL_PATTERN = /\/chat\/login(?:[/?#]|$)/i;
const CN_REGISTER_AUTH_URL_PATTERN = /\/chat\/signup(?:[/?#]|$)/i;
const HOME_URL_PATTERN = /^https?:\/\/(?:www\.)?3chat(?:ai)?\.(?:cn|ai)(?:[/?#]|$)/i;

function isCnAppOrigin(appOrigin?: string): boolean {
  if (!appOrigin) return false;
  try {
    return new URL(appOrigin).hostname === 'app.3chatai.cn';
  } catch {
    return false;
  }
}

function expectedRegisterAuthPath(appOrigin?: string): '/chat/signup' | '/chat/login' {
  return isCnAppOrigin(appOrigin) ? '/chat/signup' : '/chat/login';
}

function expectedRegisterAuthPattern(appOrigin?: string): RegExp {
  return isCnAppOrigin(appOrigin) ? CN_REGISTER_AUTH_URL_PATTERN : LOGIN_AUTH_URL_PATTERN;
}

function urlMatchesOrigin(url: string, appOrigin?: string): boolean {
  if (!appOrigin) return true;
  try {
    return new URL(url).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

function isRegisterAuthUrl(url: string, appOrigin?: string): boolean {
  return expectedRegisterAuthPattern(appOrigin).test(url) && urlMatchesOrigin(url, appOrigin);
}

function isHomeUrl(url: string): boolean {
  return HOME_URL_PATTERN.test(url)
    && !LOGIN_AUTH_URL_PATTERN.test(url)
    && !CN_REGISTER_AUTH_URL_PATTERN.test(url);
}

async function isAuthPageReached(page: Page, appOrigin?: string): Promise<boolean> {
  return isRegisterAuthUrl(page.url(), appOrigin);
}

async function waitForAuthPageReady(page: Page, appOrigin?: string, timeout = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isAuthPageReached(page, appOrigin)) {
      return true;
    }
    await page.waitForTimeout(300);
  }

  return false;
}

async function firstCurrentlyVisible(locators: Locator[], limit = 10): Promise<Locator | undefined> {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, limit); i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        return item;
      }
    }
  }

  return undefined;
}

async function isRegisterModeReady(page: Page): Promise<boolean> {
  const registerIndicators = [
    page.getByTestId('register-email-input'),
    page.getByTestId('register-phone-input'),
    page.getByTestId('register-email-tab'),
    page.getByTestId('register-phone-tab'),
  ];

  for (const locator of registerIndicators) {
    if (await locator.first().isVisible().catch(() => false)) {
      return true;
    }
  }

  const combinedAuthPhoneTab = page.getByRole('tab', { name: /^Phone$/i });
  const combinedAuthEmailTab = page.getByRole('tab', { name: /^Email$/i });
  const combinedAuthPasswordTab = page.getByRole('tab', { name: /^Password$/i });
  if (
    await combinedAuthPhoneTab.first().isVisible().catch(() => false)
    && await combinedAuthEmailTab.first().isVisible().catch(() => false)
    && await combinedAuthPasswordTab.first().isVisible().catch(() => false)
  ) {
    return true;
  }

  const cnPhoneTab = page.getByRole('tab', { name: /^(手机号|手机)$/ });
  const cnEmailTab = page.getByRole('tab', { name: /^邮箱$/ });
  if (
    await cnPhoneTab.first().isVisible().catch(() => false)
    && await cnEmailTab.first().isVisible().catch(() => false)
  ) {
    return true;
  }

  return false;
}

async function waitForRegisterMode(page: Page, timeout = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isRegisterModeReady(page)) {
      return true;
    }
    await page.waitForTimeout(300);
  }
  return false;
}

export async function ensureRegisterMode(page: Page, appOrigin?: string): Promise<void> {
  if (!isRegisterAuthUrl(page.url(), appOrigin)) {
    throw new Error([
      'Cannot switch to register mode because current URL is not the login/register page.',
      `currentUrl=${page.url() || 'unknown'}`,
      `expectedUrl=${appOrigin ? new URL(expectedRegisterAuthPath(appOrigin), appOrigin).toString() : expectedRegisterAuthPath(appOrigin)}`,
      `pageType=${isHomeUrl(page.url()) ? 'home' : 'unknown'}`,
    ].join('\n'));
  }

  const switchLocators = [
    page.getByTestId('auth-register-switch'),
    page.getByTestId('login-to-register-button'),
    page.getByRole('link', { name: /Sign up|Register|Create account/i }),
    page.getByRole('button', { name: /Sign up|Register|Create account/i }),
  ];

  const failures: string[] = [];
  for (let reloadCount = 0; reloadCount <= 2; reloadCount += 1) {
    if (reloadCount > 0) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => undefined);
    }

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await isRegisterModeReady(page)) {
        return;
      }

      const item = await firstCurrentlyVisible(switchLocators);
      if (item) {
        await item.click();
        if (await waitForRegisterMode(page, 20_000)) {
          return;
        }
      }

      await page.waitForTimeout(300);
    }

    failures.push([
      `reloadCount=${reloadCount}`,
      `currentUrl=${page.url() || 'unknown'}`,
      `visibleBody=${(await getVisibleContentSummary(page)).slice(0, 200)}`,
    ].join(' | '));
  }

  throw new Error([
    'Auth page reached, but failed to switch to register mode after waiting for a stable register entry.',
    'Reloaded auth page at most 2 times, 20s per attempt.',
    ...failures,
  ].join('\n'));
}

async function tryOpenRegisterVia(page: Page, locator: Locator, appOrigin?: string): Promise<boolean> {
  await locator.first().click();
  return waitForAuthPageReady(page, appOrigin);
}

export async function openRegistrationFromHome(page: Page, baseUrl: string, appOrigin?: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const registerEntryLocators = () => [
    page.getByTestId('home-free-trial-button'),
    page.getByRole('link', { name: /^Free Trial$/i }),
    page.getByRole('button', { name: /^Free Trial$/i }),
    page.locator('a,button,[role="button"]').filter({ hasText: /免费试用|开始免费试用|Free Trial/i }),
    page.getByRole('link', { name: /免费试用|开始免费试用|Free Trial/i }),
    page.getByRole('button', { name: /免费试用|开始免费试用|Free Trial/i }),
    page.getByText(/免费试用|开始免费试用|Free Trial/i),
    page.getByTestId('home-register-button'),
    page.locator('a,button,[role="button"]').filter({ hasText: /注册|Sign up/i }),
    page.getByRole('link', { name: /注册|Sign up/i }),
    page.getByRole('button', { name: /注册|Sign up/i }),
    page.getByText(/注册|Sign up/i),
  ];

  const deadline = Date.now() + 15_000;
  const triedLabels = new Set<string>();
  const failures: string[] = [];

  while (Date.now() < deadline) {
    let sawVisibleCandidate = false;

    for (const candidate of registerEntryLocators()) {
      const count = await candidate.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 30); i += 1) {
        const item = candidate.nth(i);
        const visible = await item.isVisible().catch(() => false);
        if (!visible) continue;
        sawVisibleCandidate = true;

        const label = (await item.innerText().catch(() => ''))
          || (await item.getAttribute('aria-label').catch(() => ''))
          || `${candidate.toString()}#${i}`;
        const key = `${label}#${i}`;
        if (triedLabels.has(key)) continue;
        triedLabels.add(key);

        if (await tryOpenRegisterVia(page, item, appOrigin)) {
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
          return;
        }

        failures.push([
          `sourceUrl=${baseUrl}`,
          `candidate=${label.replace(/\s+/g, ' ').trim() || 'unknown'}`,
          `currentUrl=${page.url()}`,
          `expectedAuthUrlPattern=${appOrigin ? new URL(expectedRegisterAuthPath(appOrigin), appOrigin).toString() : expectedRegisterAuthPath(appOrigin)}`,
          `visibleBody=${(await getVisibleContentSummary(page)).slice(0, 200)}`,
        ].join(' | '));

        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      }
    }

    if (!sawVisibleCandidate) {
      await page.waitForTimeout(300);
    }
  }

  if (appOrigin) {
    const registerUrl = new URL(expectedRegisterAuthPath(appOrigin), appOrigin).toString();
    await page.goto(registerUrl, { waitUntil: 'domcontentloaded' });
    if (await waitForAuthPageReady(page, appOrigin)) {
      return;
    }
    failures.push([
      `sourceUrl=${baseUrl}`,
      `candidate=direct-auth-fallback`,
      `currentUrl=${page.url()}`,
      `expectedAuthUrlPattern=${registerUrl}`,
      `visibleBody=${(await getVisibleContentSummary(page)).slice(0, 200)}`,
    ].join(' | '));
  }

  throw new Error([
    'Failed to open auth page from home. No working register entry was found.',
    ...failures.slice(-3),
  ].join('\n'));
}

type VerificationInputDebugInfo = {
  index: number;
  placeholder: string | null;
  ariaLabel: string | null;
  type: string | null;
  value: string;
  visible: boolean;
  editable: boolean;
};

function verificationCodeInputLocators(page: Page): Locator[] {
  return [
    page.locator('input[name="code"]'),
    page.locator('input[name="verificationCode"]'),
    page.locator('input[name="verification_code"]'),
    page.getByLabel(/验证码|Code|Verification Code/i),
    page.getByPlaceholder(/验证码|Code|Verification Code/i),
    page.locator('input[inputmode="numeric"]'),
    page.locator('input[type="text"]'),
    page.getByRole('textbox'),
  ];
}

async function firstReadyVerificationInput(locator: Locator, limit = 20): Promise<Locator | undefined> {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, limit); i += 1) {
    const item = locator.nth(i);
    const [visible, editable] = await Promise.all([
      item.isVisible().catch(() => false),
      item.isEditable().catch(() => false),
    ]);
    if (visible && editable) {
      return item;
    }
  }

  return undefined;
}

async function readyVerificationInputs(locator: Locator, limit = 20): Promise<Locator[]> {
  const count = await locator.count().catch(() => 0);
  const readyInputs: Locator[] = [];

  for (let i = 0; i < Math.min(count, limit); i += 1) {
    const item = locator.nth(i);
    const [visible, editable] = await Promise.all([
      item.isVisible().catch(() => false),
      item.isEditable().catch(() => false),
    ]);
    if (visible && editable) {
      readyInputs.push(item);
    }
  }

  return readyInputs;
}

async function waitForSegmentedVerificationCodeInputs(
  page: Page,
  codeLength: number,
  timeout = 15_000,
): Promise<Locator[]> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const locator of verificationCodeInputLocators(page)) {
      const readyInputs = await readyVerificationInputs(locator);
      if (readyInputs.length < codeLength) continue;

      const targetInputs = readyInputs.slice(0, codeLength);
      const maxLengths = await Promise.all(
        targetInputs.map((input) => input.getAttribute('maxlength').catch(() => null)),
      );
      if (maxLengths.every((maxLength) => maxLength === '1')) {
        return targetInputs;
      }
    }

    await page.waitForTimeout(300);
  }

  throw new Error(await verificationInputDiagnostic(page));
}

async function verificationInputDebugInfo(page: Page): Promise<VerificationInputDebugInfo[]> {
  const textboxes = page.getByRole('textbox');
  const count = await textboxes.count().catch(() => 0);
  const infos: VerificationInputDebugInfo[] = [];

  for (let i = 0; i < Math.min(count, 30); i += 1) {
    const textbox = textboxes.nth(i);
    const [placeholder, ariaLabel, type, value, visible, editable] = await Promise.all([
      textbox.getAttribute('placeholder').catch(() => null),
      textbox.getAttribute('aria-label').catch(() => null),
      textbox.getAttribute('type').catch(() => null),
      textbox.inputValue().catch(() => ''),
      textbox.isVisible().catch(() => false),
      textbox.isEditable().catch(() => false),
    ]);

    if (!visible) continue;

    infos.push({
      index: i,
      placeholder,
      ariaLabel,
      type,
      value,
      visible,
      editable,
    });
  }

  return infos;
}

async function verificationInputDiagnostic(page: Page): Promise<string> {
  const visibleInputs = await verificationInputDebugInfo(page);
  const visibleDialogs = await visibleDialogTexts(page);
  const bodyText = await getVisibleContentSummary(page);
  return [
    'Verification input not ready.',
    '',
    'URL:',
    page.url() || 'unknown',
    '',
    `Visible textbox count: ${visibleInputs.length}`,
    '',
    'Visible inputs:',
    JSON.stringify(visibleInputs, null, 2),
    '',
    'Visible dialogs:',
    JSON.stringify(visibleDialogs, null, 2),
    '',
    'Body text:',
    bodyText,
  ].join('\n');
}

export async function waitForVerificationCodeInput(
  page: Page,
  timeout = 15_000,
): Promise<Locator> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const locator of verificationCodeInputLocators(page)) {
      const readyInput = await firstReadyVerificationInput(locator);
      if (readyInput) {
        return readyInput;
      }
    }

    await page.waitForTimeout(300);
  }

  throw new Error(await verificationInputDiagnostic(page));
}

export async function fillVerificationCode(page: Page, code: string): Promise<void> {
  const input = await waitForVerificationCodeInput(page);

  let acceptedInputCount = 0;
  const errors: string[] = [];

  const maxLength = await input.getAttribute('maxlength').catch(() => null);
  if (maxLength === '1' && code.length > 1) {
    const inputs = await waitForSegmentedVerificationCodeInputs(page, code.length);
    for (let i = 0; i < code.length; i += 1) {
      try {
        await inputs[i].fill(code[i]);
        acceptedInputCount += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        if (!await isVerificationInputStillMounted(inputs[i])) {
          break;
        }
      }
    }

    if (acceptedInputCount > 0) {
      return;
    }
  } else {
    try {
      await input.fill(code);
      acceptedInputCount += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (!await isVerificationInputStillMounted(input)) {
        return;
      }
    }
  }

  if (acceptedInputCount === 0) {
    throw new Error([
      'No verification input accepted code.',
      ...errors.slice(0, 3),
      await verificationInputDiagnostic(page),
    ].join('\n'));
  }
}

async function isVerificationInputStillMounted(input: Locator): Promise<boolean> {
  return input.evaluate((element) => element.isConnected).catch(() => false);
}

type OnboardingFieldStatus =
  | 'not-present'
  | 'skipped'
  | 'found'
  | 'typed'
  | 'dom-verified'
  | 'validation-verified'
  | 'submitted';
type OnboardingFieldName = 'contactName' | 'workspaceName' | 'phone';

type OnboardingDiagnostics = {
  contactName: OnboardingFieldStatus;
  workspaceName: OnboardingFieldStatus;
  workspaceSource: 'not-present' | 'auto-filled' | 'manually-filled';
  phone: OnboardingFieldStatus;
};

export type RegistrationOnboardingResult = {
  filledContactName: boolean;
  filledWorkspaceName: boolean;
  filledPhone: boolean;
  phoneVisible: boolean;
};

function contactNameLocators(page: Page): Locator[] {
  const contactNamePattern = /如何称呼|公司名|您的名字|How should we address you|What should we call you|Your company name is recommended|Company name|Your name|Organization|Business name/i;
  return [
    page.getByTestId('onboarding-company-name-input'),
    page.getByTestId('onboarding-contact-name-input'),
    page.locator('input[name="username"]'),
    page.getByLabel(contactNamePattern),
    page.getByRole('textbox', { name: contactNamePattern }),
    page.getByPlaceholder(/^(您的名字|请输入名称|公司名称|Your name|Company name|Organization|Business name)$/i),
    ...findInputByVisibleText(page, contactNamePattern),
  ];
}

function workspaceNameLocators(page: Page): Locator[] {
  const workspacePattern = /给新的工作空间起个名字|工作空间|空间名称|Name your (?:new )?workspace|Workspace name|New workspace|workspace/i;
  return [
    page.getByTestId('onboarding-workspace-name-input'),
    page.locator('input[name="workspaceName"]'),
    page.locator('input[name="workspace"]'),
    page.locator('input[placeholder="Workspace name"]'),
    page.locator('input[placeholder="工作空间名称"]'),
    page.locator('input[placeholder="空间名称"]'),
    page.getByLabel(workspacePattern),
    page.getByRole('textbox', { name: workspacePattern }),
    page.getByPlaceholder(workspacePattern),
    ...findInputByVisibleText(page, workspacePattern),
  ];
}

function phoneLocators(page: Page): Locator[] {
  const phonePattern = /请输入手机号|手机号|联系电话|电话号码|Phone|Phone number|Mobile|Mobile number|Enter phone number|Your phone number|Please enter your phone number/i;
  return [
    page.getByTestId('onboarding-contact-phone-input'),
    page.getByTestId('onboarding-phone-input'),
    page.locator('input[type="tel"]'),
    page.getByLabel(phonePattern),
    page.getByRole('textbox', { name: phonePattern }),
    page.getByPlaceholder(phonePattern),
    ...findInputByVisibleText(page, phonePattern),
  ];
}

function findInputByVisibleText(page: Page, textPattern: RegExp): Locator[] {
  const inputInFieldContainer = 'xpath=ancestor::*[(self::label or self::div or self::section or self::fieldset) and count(.//input[not(@type="hidden")])=1][1]//input[not(@type="hidden")]';
  return [
    page.getByText(textPattern, { exact: false }).locator(inputInFieldContainer),
    page.locator('label,p,span,h1,h2,h3,h4,h5,h6').filter({ hasText: textPattern }).locator(inputInFieldContainer),
  ];
}

function onboardingLocators(page: Page): Locator[] {
  return [
    page.getByTestId('onboarding-company-name-input'),
    page.getByTestId('onboarding-contact-name-input'),
    page.getByTestId('onboarding-workspace-name-input'),
    ...contactNameLocators(page),
    ...workspaceNameLocators(page),
  ];
}

export async function waitForRegistrationOnboarding(
  page: Page,
  timeout = 30_000,
  stabilizationMs = 0,
): Promise<void> {
  await firstVisible(onboardingLocators(page), timeout);
  if (stabilizationMs <= 0) return;

  const marker = `e2e-onboarding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const markerAttribute = 'data-e2e-onboarding-stability-marker';
  let stableSince = Date.now();
  let currentInput = await firstVisible(contactNameLocators(page), timeout);
  const deadline = Date.now() + timeout;

  await currentInput.evaluate(
    (element, input) => element.setAttribute(input.attribute, input.marker),
    { attribute: markerAttribute, marker },
  );

  while (Date.now() < deadline) {
    const marked = page.locator(`[${markerAttribute}="${marker}"]`).first();
    const markedStable = await marked.isVisible().catch(() => false)
      && await marked.isEditable().catch(() => false);
    if (markedStable) {
      if (Date.now() - stableSince >= stabilizationMs) {
        await marked.evaluate((element, attribute) => element.removeAttribute(attribute), markerAttribute)
          .catch(() => undefined);
        return;
      }
    } else {
      currentInput = await firstVisible(contactNameLocators(page), Math.min(2_000, timeout));
      await currentInput.evaluate(
        (element, input) => element.setAttribute(input.attribute, input.marker),
        { attribute: markerAttribute, marker },
      );
      stableSince = Date.now();
    }

    if (!await currentInput.isEditable().catch(() => false)) {
      stableSince = Date.now();
    }
    await page.waitForTimeout(150);
  }

  throw new Error(`Onboarding input did not remain stable and editable for ${stabilizationMs}ms.`);
}

export type VerificationResult = 'onboarding' | 'confirm-register' | 'failed';

export type RegisterCodeVerificationState = VerificationResult;

export function isOnboardingPage(page: Page): boolean {
  return isOnOnboardingRoute(page);
}

function registerConfirmPrompt(page: Page): Locator {
  return page.getByText(/当前账号.*未注册.*是否直接注册并登录|账号.*未注册.*注册并登录|not registered.*(?:register|sign up)|account.*not registered|register and login/i);
}

export async function isRegisterConfirmDialog(page: Page): Promise<boolean> {
  return registerConfirmPrompt(page).first().isVisible({ timeout: 500 }).catch(() => false);
}

export async function handleRegisterConfirmDialog(page: Page): Promise<boolean> {
  const prompt = registerConfirmPrompt(page);
  if (!(await prompt.first().isVisible({ timeout: 500 }).catch(() => false))) {
    return false;
  }

  const modal = page.locator('.ant-modal:visible, [role="dialog"]:visible, [class*="modal"]:visible')
    .filter({ hasText: /未注册|not registered|register and login/i })
    .first();
  const confirmButton = modal.locator('button').filter({ hasText: /^确认$|^确定$|Continue|Confirm|Register|OK/i }).last();
  if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await confirmButton.click({ force: true });
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    return true;
  }

  const primaryButton = page.locator('.ant-modal-confirm .ant-btn-primary, .ant-modal .ant-btn-primary').last();
  if (await primaryButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await primaryButton.click({ force: true });
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    return true;
  }

  const confirmText = page.getByText(/^确认$|^确定$|Continue|Confirm|Register|OK/i).last();
  const box = await confirmText.boundingBox({ timeout: 3_000 }).catch(() => null);
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await prompt.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    return true;
  }

  return false;
}

async function visibleDialogTexts(page: Page): Promise<string[]> {
  const dialogs = page.locator('.ant-modal:visible, [role="dialog"]:visible, [class*="modal"]:visible');
  const count = await dialogs.count().catch(() => 0);
  const texts: string[] = [];

  for (let i = 0; i < Math.min(count, 10); i += 1) {
    const text = await dialogs.nth(i).innerText().catch(() => '');
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized) {
      texts.push(normalized.slice(0, 300));
    }
  }

  return texts;
}

export async function verificationResultDiagnostic(page: Page): Promise<string> {
  const visibleInputs = await verificationInputDebugInfo(page);
  const visibleDialogs = await visibleDialogTexts(page);
  const bodyText = await getVisibleContentSummary(page);

  return [
    'Verification result failed.',
    '',
    'URL:',
    page.url() || 'unknown',
    '',
    'Visible inputs:',
    JSON.stringify(visibleInputs, null, 2),
    '',
    'Visible dialogs:',
    JSON.stringify(visibleDialogs, null, 2),
    '',
    'Body text:',
    bodyText,
  ].join('\n');
}

export async function waitForVerificationResult(
  page: Page,
  timeout = 30_000,
): Promise<VerificationResult> {
  const deadline = Date.now() + timeout;
  const codeErrorPattern = /验证码.*(错误|无效|过期|不正确|失败)|code.*(invalid|wrong|expired|failed|incorrect)/i;

  while (Date.now() < deadline) {
    if (await isBuilderReached(page)) {
      return 'onboarding';
    }

    if (await hasAnyVisible(onboardingLocators(page)) || isOnOnboardingRoute(page)) {
      return 'onboarding';
    }

    if (await isRegisterConfirmDialog(page)) {
      return 'confirm-register';
    }

    const visibleText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
    if (codeErrorPattern.test(visibleText)) {
      return 'failed';
    }

    await page.waitForTimeout(300);
  }

  return 'failed';
}

export async function completeRegisterCodeVerification(
  page: Page,
  code: string,
): Promise<VerificationResult> {
  await fillVerificationCode(page, code);

  const result = await waitForVerificationResult(page);
  if (result !== 'confirm-register') {
    return result;
  }

  await handleRegisterConfirmDialog(page);
  return waitForVerificationResult(page);
}

function doneButtonLocators(page: Page): Locator[] {
  return [
    page.getByTestId('onboarding-finish-button'),
    page.getByRole('button', { name: /完成|继续|开始使用|进入系统|确认|Done|Finish|Continue|Complete|Start|Get started/i }),
  ];
}

async function visibleLocatorCount(locator: Locator): Promise<number> {
  const count = await locator.count().catch(() => 0);
  let visible = 0;
  for (let i = 0; i < count; i += 1) {
    if (await locator.nth(i).isVisible().catch(() => false)) {
      visible += 1;
    }
  }
  return visible;
}

async function hasAnyVisible(locators: Locator[]): Promise<boolean> {
  for (const locator of locators) {
    if (await visibleLocatorCount(locator)) {
      return true;
    }
  }
  return false;
}

async function optionalVisible(locators: Locator[], timeout = 5_000): Promise<Locator | null> {
  return firstVisible(locators, timeout).catch(() => null);
}

async function isAnyVisible(locators: Locator[]): Promise<boolean> {
  return optionalVisible(locators, 500).then(Boolean);
}

async function onboardingDiagnostic(page: Page, status: OnboardingDiagnostics): Promise<string> {
  const [
    visibleText,
    textboxCount,
    contactFound,
    workspaceFound,
    phoneFound,
    doneVisible,
  ] = await Promise.all([
    getVisibleContentSummary(page),
    visibleLocatorCount(page.getByRole('textbox')),
    hasAnyVisible(contactNameLocators(page)),
    hasAnyVisible(workspaceNameLocators(page)),
    hasAnyVisible(phoneLocators(page)),
    hasAnyVisible(doneButtonLocators(page)),
  ]);
  const safeVisibleText = visibleText
    .replace(/\b1\d{10}\b/g, (phone) => phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'))
    .replace(/\b\d{4,8}\b/g, '[code]');

  return [
    `currentUrl=${page.url() || 'unknown'}`,
    `visibleText=${safeVisibleText}`,
    `visibleTextboxCount=${textboxCount}`,
    `contactName=${contactFound ? status.contactName : 'not-found'}`,
    `workspaceName=${workspaceFound ? status.workspaceName : 'not-found'}`,
    `workspaceSource=${status.workspaceSource}`,
    `phone=${phoneFound ? status.phone : 'not-present'}`,
    `doneButton=${doneVisible ? 'visible' : 'hidden'}`,
    `validationErrorContainers=${JSON.stringify(await visibleValidationErrorContainerTexts(page))}`,
    `textboxes=${await textboxDebugInfo(page)}`,
  ].join('\n');
}

async function withOnboardingDiagnostics<T>(
  page: Page,
  status: OnboardingDiagnostics,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = await onboardingDiagnostic(page, status);
    throw new Error(`${message}\n${diagnostic}`);
  }
}

async function focusOnboardingInput(page: Page, input: Locator): Promise<void> {
  await input.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  await input.click({ force: true, timeout: 5_000 }).catch(async () => {
    await input.evaluate((element) => (element as HTMLElement).focus());
  });
}

async function typeOnboardingValue(
  page: Page,
  input: Locator,
  value: string,
  fieldName: OnboardingFieldName,
): Promise<void> {
  if (fieldName === 'workspaceName') {
    await input.fill(value);
    return;
  }

  await focusOnboardingInput(page, input);
  if (await input.inputValue().catch(() => '')) {
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
  }

  if (fieldName === 'contactName') {
    throw new Error('Contact Name must be handled by the two-stage onboarding flow.');
  }

  await input.pressSequentially(value, { delay: 40 });
}

function maskDebugValue(value: string | null): string {
  return (value || '')
    .replace(/\b1\d{10}\b/g, (phone) => phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'))
    .replace(/\b\d{4,8}\b/g, '[code]');
}

async function textboxDebugInfo(page: Page): Promise<string> {
  const textboxes = page.getByRole('textbox');
  const count = await textboxes.count().catch(() => 0);
  const infos: string[] = [];

  for (let i = 0; i < Math.min(count, 30); i += 1) {
    const textbox = textboxes.nth(i);
    if (!await textbox.isVisible().catch(() => false)) continue;
    const [placeholder, ariaLabel, name, value, ariaInvalid, visible, editable, box] = await Promise.all([
      textbox.getAttribute('placeholder').catch(() => null),
      textbox.getAttribute('aria-label').catch(() => null),
      textbox.getAttribute('name').catch(() => null),
      textbox.inputValue().catch(() => ''),
      textbox.getAttribute('aria-invalid').catch(() => null),
      textbox.isVisible().catch(() => false),
      textbox.isEditable().catch(() => false),
      textbox.boundingBox().catch(() => null),
    ]);

    infos.push(JSON.stringify({
      index: i,
      placeholder,
      ariaLabel,
      name,
      value: maskDebugValue(value),
      ariaInvalid,
      visible,
      editable,
      boundingBox: box,
    }));
  }

  return infos.length ? `[${infos.join(',')}]` : '[]';
}

function valuesMatch(fieldName: string, actual: string, expected: string): boolean {
  if (fieldName !== 'phone') {
    return actual === expected;
  }

  const actualDigits = actual.replace(/\D/g, '');
  const expectedDigits = expected.replace(/\D/g, '');
  return actualDigits === expectedDigits || actualDigits.endsWith(expectedDigits.slice(-8));
}

async function expectFieldValue(input: Locator, value: string, fieldName: string): Promise<void> {
  if (fieldName === 'phone') {
    await expect.poll(async () => {
      const actual = await input.inputValue().catch(() => '');
      return valuesMatch(fieldName, actual, value);
    }, { timeout: 5_000 }).toBeTruthy();
    return;
  }

  await expect(input).toHaveValue(value, { timeout: 5_000 });
}

const ONBOARDING_ACTION_TIMEOUT_MS = 5_000;
const ONBOARDING_CONTACT_STABLE_MS = 750;
const ONBOARDING_CONTACT_INPUT_ATTEMPTS = 2;

async function contactNameValueRemainedStable(
  page: Page,
  expectedValue: string,
  stableMs = ONBOARDING_CONTACT_STABLE_MS,
  timeout = ONBOARDING_ACTION_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  let stableSince: number | undefined;

  while (Date.now() < deadline) {
    const latestInput = await optionalVisible(contactNameLocators(page), 500);
    const actualValue = await latestInput?.inputValue({ timeout: 1_000 }).catch(() => '') || '';
    if (actualValue === expectedValue) {
      stableSince ??= Date.now();
      if (Date.now() - stableSince >= stableMs) return true;
    } else {
      stableSince = undefined;
    }
    await page.waitForTimeout(100);
  }

  return false;
}

async function typeStableContactName(
  page: Page,
  preferredInput: Locator,
  value: string,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ONBOARDING_CONTACT_INPUT_ATTEMPTS; attempt += 1) {
    const input = attempt === 0 && await preferredInput.isVisible().catch(() => false)
      ? preferredInput
      : await firstVisible(contactNameLocators(page), ONBOARDING_ACTION_TIMEOUT_MS);

    try {
      await focusOnboardingInput(page, input);
      if (await input.inputValue({ timeout: 1_000 }).catch(() => '')) {
        await input.press('ControlOrMeta+A', { timeout: ONBOARDING_ACTION_TIMEOUT_MS });
        await input.press('Backspace', { timeout: ONBOARDING_ACTION_TIMEOUT_MS });
      }
      await input.pressSequentially(value, {
        delay: 60,
        timeout: ONBOARDING_ACTION_TIMEOUT_MS,
      });
      await input.press('Tab', { timeout: ONBOARDING_ACTION_TIMEOUT_MS });

      if (await contactNameValueRemainedStable(page, value)) return;
      lastError = new Error(`Contact name value was cleared after typing (attempt ${attempt + 1}).`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Contact name did not remain stable after ${ONBOARDING_CONTACT_INPUT_ATTEMPTS} attempts. ${
      lastError instanceof Error ? lastError.message : String(lastError || '')
    }`,
  );
}

async function fillContactNameAndWaitForWorkspace(
  page: Page,
  contactInput: Locator,
  contactName: string,
  timeout = 10_000,
): Promise<{ expanded: true }> {
  await typeStableContactName(page, contactInput, contactName);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const workspaceInput = await optionalVisible(workspaceNameLocators(page), 500);
    if (workspaceInput) {
      const latestContactInput = await firstVisible(contactNameLocators(page), 5_000);
      const contactValue = await latestContactInput.inputValue().catch(() => '');
      if (contactValue !== contactName) {
        await typeStableContactName(page, latestContactInput, contactName);
      }
      return { expanded: true };
    }

    const latestContactInput = await optionalVisible(contactNameLocators(page), 500);
    const contactValue = await latestContactInput?.inputValue().catch(() => '') || '';
    if (contactValue !== contactName) {
      if (!latestContactInput) {
        await page.waitForTimeout(150);
        continue;
      }
      await typeStableContactName(page, latestContactInput, contactName);
    }
    await page.waitForTimeout(150);
  }

  throw new Error([
    'Onboarding workspaceName did not appear after contactName was typed.',
    `contactName=${JSON.stringify(contactName)}`,
  ].join('\n'));
}

async function getExpandedOnboardingInputs(page: Page): Promise<{
  contactNameInput: Locator;
  workspaceNameInput: Locator;
}> {
  const contactNameInput = await firstVisible(contactNameLocators(page), 10_000);
  const workspaceNameInput = await firstVisible(workspaceNameLocators(page), 10_000);

  if (await isSameInput(contactNameInput, workspaceNameInput)) {
    throw new Error('Expanded onboarding contactName and workspaceName resolved to the same input.');
  }

  return { contactNameInput, workspaceNameInput };
}

async function fillContactNameInExpandedForm(
  page: Page,
  contactInput: Locator,
  contactName: string,
): Promise<void> {
  await typeStableContactName(page, contactInput, contactName);
}

async function waitForWorkspaceAutoValueStable(
  page: Page,
  expectedContactName: string,
  timeout = 8_000,
): Promise<string> {
  const deadline = Date.now() + timeout;
  let previous = '';
  let stableReads = 0;

  while (Date.now() < deadline) {
    const contactInput = await optionalVisible(contactNameLocators(page), 500);
    const workspaceInput = await optionalVisible(workspaceNameLocators(page), 500);
    if (!contactInput || !workspaceInput) {
      await page.waitForTimeout(100);
      continue;
    }

    const contactValue = await contactInput.inputValue().catch(() => '');
    const workspaceValue = (await workspaceInput.inputValue().catch(() => '')).trim();
    if (contactValue !== expectedContactName) {
      await typeStableContactName(page, contactInput, expectedContactName);
      previous = '';
      stableReads = 0;
      await page.waitForTimeout(150);
      continue;
    }

    if (workspaceValue && workspaceValue === previous) {
      stableReads += 1;
      if (stableReads >= 3) {
        return workspaceValue;
      }
    } else {
      previous = workspaceValue;
      stableReads = 0;
    }
    await page.waitForTimeout(150);
  }

  throw new Error('Onboarding workspaceName value did not become stable.');
}

async function verifyAutoFilledWorkspace(
  input: Locator,
  expectedValue: string,
): Promise<void> {
  await expect(input).toHaveValue(expectedValue, { timeout: 5_000 });
  await input.press('Tab', { timeout: ONBOARDING_ACTION_TIMEOUT_MS });
  await expect(input).toHaveValue(expectedValue, { timeout: 5_000 });
  if (await input.getAttribute('aria-invalid').catch(() => null) === 'true') {
    throw new Error('Auto-filled onboarding workspace is marked invalid.');
  }
}

type OnboardingFieldCallbacks = {
  onTyped?: () => void;
  onDomVerified?: () => void;
};

async function typeAndCommitOnboardingField(
  page: Page,
  input: Locator,
  value: string,
  fieldName: OnboardingFieldName,
  validationError?: Locator,
  callbacks?: OnboardingFieldCallbacks,
): Promise<boolean> {
  if (await isRegistrationTerminalState(page)) {
    return true;
  }

  const visibleOutcome = await withTerminalAware(page, async () => {
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    return input.isEditable().catch(() => false);
  });
  if (visibleOutcome === 'terminal' || await isRegistrationTerminalState(page)) {
    return true;
  }
  if (!visibleOutcome) {
    throw new Error('Onboarding input is visible but not editable.');
  }

  await typeOnboardingValue(page, input, value, fieldName);
  if (await isRegistrationTerminalState(page)) {
    callbacks?.onTyped?.();
    callbacks?.onDomVerified?.();
    return true;
  }

  callbacks?.onTyped?.();
  const valueOutcome = await withTerminalAware(page, async () => {
    await expectFieldValue(input, value, fieldName);
  });
  if (valueOutcome === 'terminal' || await isRegistrationTerminalState(page)) {
    callbacks?.onDomVerified?.();
    return true;
  }

  callbacks?.onDomVerified?.();

  await input.press('Tab', { timeout: ONBOARDING_ACTION_TIMEOUT_MS });
  await expectFieldValue(input, value, fieldName);

  if (validationError && !await isRegistrationTerminalState(page)) {
    const validationOutcome = await withTerminalAware(page, async () => {
      await expect(validationError).not.toBeVisible({ timeout: 5_000 });
    });
    if (validationOutcome === 'terminal' || await isRegistrationTerminalState(page)) {
      return true;
    }
  }

  return await isRegistrationTerminalState(page);
}

async function clickOnboardingDone(page: Page): Promise<void> {
  const doneButton = await firstVisible(doneButtonLocators(page), 15_000);
  await expect(doneButton).toBeEnabled({ timeout: 10_000 });
  await doneButton.click({ timeout: ONBOARDING_ACTION_TIMEOUT_MS });
}

function isOnOnboardingRoute(page: Page): boolean {
  return /on-boarding|onboarding/i.test(page.url());
}

function welcomeIndicatorLocators(page: Page): Locator[] {
  return [
    page.getByTestId('welcome-modal'),
    page.getByTestId('welcome-start-experience-button'),
    page.getByTestId('welcome-start-build-button'),
    page.getByRole('dialog', { name: /欢迎|恭喜|Welcome/i }),
    page.getByRole('button', { name: /立即体验\s*AI|立即体验|开始体验|进入搭建助手|Start|Build now|Get started|Experience|Continue/i }),
  ];
}

async function isBuilderReached(page: Page): Promise<boolean> {
  if (/embedded-app\/subapp.*butler\/agent\/builder|butler\/agent\/builder/i.test(page.url())) {
    return true;
  }

  if (await hasAnyVisible([
    page.getByRole('link', { name: /^Agent Builder$/i }),
    page.getByText(/^Agent Builder$/i),
  ])) {
    return true;
  }

  for (const frame of page.frames()) {
    const text = await frame.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
    if (/3Chat\s*Agent\s*Builder|3Chat\s*搭建助手|Agent Builder|Welcome to Agent Builder/i.test(text)) {
      return true;
    }
  }

  return false;
}

async function isRegistrationTerminalState(page: Page): Promise<boolean> {
  if (page.isClosed()) {
    return false;
  }

  if (await isBuilderReached(page)) {
    return true;
  }

  if (await hasAnyVisible(welcomeIndicatorLocators(page))) {
    return true;
  }

  const url = page.url();
  if (!isOnOnboardingRoute(page) && /embedded-app\/subapp|\/butler\//i.test(url)) {
    return true;
  }

  return false;
}

function isTerminalNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /has been closed|Target page, context or browser has been closed|Execution context was destroyed/i.test(message);
}

async function withTerminalAware<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<T | 'terminal'> {
  try {
    return await action();
  } catch (error) {
    if (isTerminalNavigationError(error)) {
      return 'terminal';
    }
    if (await isRegistrationTerminalState(page).catch(() => false)) {
      return 'terminal';
    }
    throw error;
  }
}

async function isSameInput(a: Locator, b: Locator): Promise<boolean> {
  const outcome = await withTerminalAware(a.page(), async () => {
    const [aHandle, bHandle] = await Promise.all([a.elementHandle(), b.elementHandle()]);
    if (!aHandle || !bHandle) return false;
    return aHandle.evaluate((left, right) => left === right, bHandle);
  });
  if (outcome === 'terminal') return false;
  return outcome;
}

async function assertDistinctInputs(
  contactNameInput: Locator,
  workspaceNameInput: Locator,
  phoneInput: Locator | null,
): Promise<void> {
  if (await isSameInput(contactNameInput, workspaceNameInput)) {
    throw new Error('Onboarding locators resolved contactName and workspaceName to the same input.');
  }
  if (phoneInput && (
    await isSameInput(contactNameInput, phoneInput)
    || await isSameInput(workspaceNameInput, phoneInput)
  )) {
    throw new Error('Onboarding phone locator resolved to another business field.');
  }
}

async function findOptionalPhoneInput(page: Page, timeout = 5_000): Promise<Locator | null> {
  return optionalVisible(phoneLocators(page), timeout);
}

function validationErrorContainers(page: Page): Locator {
  return page.locator([
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    '.ant-form-item-explain-error',
    '.el-form-item__error',
    '.form-error',
    '.error-message',
    '.text-danger',
    '[data-testid*="error" i]',
    '[data-test*="error" i]',
  ].join(', '));
}

async function visibleValidationErrorContainerTexts(page: Page): Promise<string[]> {
  const containers = validationErrorContainers(page);
  const count = await containers.count().catch(() => 0);
  const texts: string[] = [];

  for (let i = 0; i < Math.min(count, 20); i += 1) {
    const container = containers.nth(i);
    if (!await container.isVisible().catch(() => false)) continue;

    const [text, ariaInvalid] = await Promise.all([
      container.innerText().catch(() => ''),
      container.getAttribute('aria-invalid').catch(() => null),
    ]);
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized && ariaInvalid !== 'true') continue;
    texts.push(maskDebugValue(normalized || `aria-invalid=${ariaInvalid}`));
  }

  return texts;
}

async function assertNoVisibleValidationErrors(page: Page): Promise<void> {
  const errors = await visibleValidationErrorContainerTexts(page);
  if (errors.length) {
    throw new Error(`Onboarding validation error container is visible: ${errors.join(' | ')}`);
  }
}

async function waitForOnboardingSubmission(page: Page, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  let consecutiveValidationFailures = 0;

  while (Date.now() < deadline) {
    if (await isRegistrationTerminalState(page)) {
      return;
    }

    const validationVisible = (await visibleValidationErrorContainerTexts(page)).length > 0;
    consecutiveValidationFailures = validationVisible ? consecutiveValidationFailures + 1 : 0;
    if (consecutiveValidationFailures >= 2) {
      throw new Error('Onboarding submission was rejected by frontend validation.');
    }

    await page.waitForTimeout(250);
  }

  throw new Error('Onboarding submission did not reach builder.');
}

export async function completeRegistrationOnboarding(
  page: Page,
  options: {
    contactName: string;
    workspaceName: string;
    phone?: string;
  },
): Promise<RegistrationOnboardingResult> {
  const status: OnboardingDiagnostics = {
    contactName: 'not-present',
    workspaceName: 'not-present',
    workspaceSource: 'not-present',
    phone: 'not-present',
  };

  return withOnboardingDiagnostics(page, status, async () => {
    const result: RegistrationOnboardingResult = {
      filledContactName: false,
      filledWorkspaceName: false,
      filledPhone: false,
      phoneVisible: false,
    };
    const initialContactInput = await optionalVisible(contactNameLocators(page), 30_000);
    if (!initialContactInput) {
      throw new Error('Missing required onboarding field:\ncontactName');
    }
    status.contactName = 'found';

    let expandedOnce = false;
    const initialWorkspaceInput = await optionalVisible(workspaceNameLocators(page), 500);
    if (!initialWorkspaceInput) {
      await fillContactNameAndWaitForWorkspace(page, initialContactInput, options.contactName);
      expandedOnce = true;
      status.contactName = 'typed';
    }

    const { contactNameInput, workspaceNameInput } = await getExpandedOnboardingInputs(page);
    if (expandedOnce && !await workspaceNameInput.isVisible().catch(() => false)) {
      throw new Error('Onboarding workspace disappeared after the initial dynamic expansion.');
    }
    status.workspaceName = 'found';
    await assertDistinctInputs(contactNameInput, workspaceNameInput, null);

    await fillContactNameInExpandedForm(page, contactNameInput, options.contactName);
    status.contactName = 'validation-verified';
    result.filledContactName = true;

    const workspaceValue = await waitForWorkspaceAutoValueStable(page, options.contactName);
    status.workspaceSource = 'auto-filled';
    status.workspaceName = 'dom-verified';
    await verifyAutoFilledWorkspace(
      workspaceNameInput,
      workspaceValue,
    );
    status.workspaceName = 'validation-verified';
    result.filledWorkspaceName = true;

    const phoneInput = await findOptionalPhoneInput(page);
    await assertDistinctInputs(contactNameInput, workspaceNameInput, phoneInput);
    if (phoneInput) {
      status.phone = 'found';
      result.phoneVisible = true;
      if (!options.phone) {
        throw new Error('Visible onboarding phone field was not filled.');
      }
      await typeAndCommitOnboardingField(
        page,
        phoneInput,
        options.phone,
        'phone',
        undefined,
        {
          onTyped: () => { status.phone = 'typed'; },
          onDomVerified: () => { status.phone = 'dom-verified'; },
        },
      );
      await expectFieldValue(phoneInput, options.phone, 'phone');
      status.phone = 'validation-verified';
      result.filledPhone = true;
    } else {
      status.phone = 'skipped';
    }

    const finalContactInput = await firstVisible(contactNameLocators(page), 5_000);
    const finalWorkspaceInput = await firstVisible(workspaceNameLocators(page), 5_000);
    await assertDistinctInputs(finalContactInput, finalWorkspaceInput, phoneInput);
    await expectFieldValue(finalContactInput, options.contactName, 'contactName');
    await expect(finalWorkspaceInput).not.toHaveValue('', { timeout: 5_000 });
    if (phoneInput && options.phone) {
      const finalPhoneInput = await firstVisible(phoneLocators(page), 5_000);
      await expectFieldValue(finalPhoneInput, options.phone, 'phone');
    }
    await assertNoVisibleValidationErrors(page);
    await clickOnboardingDone(page);
    await waitForOnboardingSubmission(page);
    status.contactName = 'submitted';
    status.workspaceName = 'submitted';
    if (phoneInput) status.phone = 'submitted';
    return result;
  });
}

export async function waitForBuilder(page: Page, timeout = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isBuilderReached(page)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}
